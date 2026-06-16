import { db } from "./db";
import {
  equipment,
  productionDowntimes,
  products,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  listFacts,
  listProductionOrders,
  listSchedule,
  getProductionPlanningSettings,
} from "./production-service";
import {
  computeOeePercent,
  ratioToPercent,
  type OeeAnalyticsResponse,
  type OeeEquipmentLine,
  type OeeOrderLine,
  type OeeSummaryMetrics,
} from "@shared/production-oee-types";

const DEFAULT_SLOT_STATUSES = ["planned", "in_progress", "paused"];

function slotMinutes(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function overlapsPeriod(start: Date, end: Date, from: Date, to: Date): boolean {
  return start < to && end > from;
}

function buildMetrics(
  plannedMinutes: number,
  downtimeMinutes: number,
  produced: number,
  defective: number,
  normQuantity: number | null
): OeeSummaryMetrics {
  const operatingMinutes = Math.max(0, plannedMinutes - downtimeMinutes);
  const totalOutput = produced + defective;
  const goodQuantity = produced;
  const varianceQuantity =
    normQuantity != null && normQuantity > 0 ? produced - normQuantity : null;
  const variancePercent =
    varianceQuantity != null && normQuantity != null && normQuantity > 0
      ? Math.round((varianceQuantity / normQuantity) * 10000) / 100
      : null;

  const availability = ratioToPercent(
    plannedMinutes > 0 ? operatingMinutes / plannedMinutes : null
  );
  const performance = ratioToPercent(
    normQuantity != null && normQuantity > 0 ? produced / normQuantity : null
  );
  const quality = ratioToPercent(
    totalOutput > 0 ? goodQuantity / totalOutput : produced > 0 ? 1 : null
  );
  const oee = computeOeePercent(availability, performance, quality);

  return {
    plannedMinutes: Math.round(plannedMinutes),
    downtimeMinutes: Math.round(downtimeMinutes),
    operatingMinutes: Math.round(operatingMinutes),
    produced,
    defective,
    goodQuantity,
    normQuantity,
    varianceQuantity,
    variancePercent,
    availability,
    performance,
    quality,
    oee,
  };
}

export async function getOeeAnalytics(filters: {
  subdivisionId: number;
  from?: Date;
  to?: Date;
  equipmentId?: string;
}): Promise<OeeAnalyticsResponse> {
  const { subdivisionId, equipmentId } = filters;
  const notes: string[] = [];

  const periodFrom =
    filters.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodTo =
    filters.to ??
    new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

  const settings = await getProductionPlanningSettings(subdivisionId);
  const slotStatuses =
    settings.displayConfig.timeline.slotStatuses.length > 0
      ? settings.displayConfig.timeline.slotStatuses
      : DEFAULT_SLOT_STATUSES;

  const allSchedule = await listSchedule({
    subdivisionId,
    equipmentId,
    from: periodFrom,
    to: periodTo,
  });
  const scheduleSlots = allSchedule.filter(
    (s) =>
      slotStatuses.includes(s.status) &&
      overlapsPeriod(s.startTime, s.endTime, periodFrom, periodTo)
  );

  const facts = await listFacts({
    subdivisionId,
    equipmentId,
    from: periodFrom,
    to: periodTo,
  });

  let downtimes = await db
    .select()
    .from(productionDowntimes)
    .where(eq(productionDowntimes.subdivisionId, subdivisionId));

  if (equipmentId) {
    downtimes = downtimes.filter((d) => d.equipmentId === equipmentId);
  }

  downtimes = downtimes.filter((d) => {
    const anchor = d.startTime ?? d.createdAt;
    return anchor >= periodFrom && anchor <= periodTo;
  });

  const factIdsWithDowntimeRows = new Set(
    downtimes.map((d) => d.factId).filter((id): id is number => id != null)
  );

  const orders = await listProductionOrders({ subdivisionId });
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const productRows = await db
    .select({ id: products.id, name: products.name })
    .from(products);
  const productNameById = new Map(productRows.map((p) => [p.id, p.name]));

  const equipmentRows = await db.select().from(equipment);
  const equipmentNameById = new Map(equipmentRows.map((e) => [e.id, e.name]));

  const totalPlannedMinutes = scheduleSlots.reduce(
    (sum, s) => sum + slotMinutes(s.startTime, s.endTime),
    0
  );
  const normFromSchedule = scheduleSlots.reduce((sum, s) => sum + s.plannedQuantity, 0);

  const downtimeFromTable = downtimes.reduce((sum, d) => sum + d.durationMinutes, 0);
  const downtimeFromFacts = facts
    .filter((f) => !factIdsWithDowntimeRows.has(f.id))
    .reduce((sum, f) => sum + (f.downtimeMinutes ?? 0), 0);
  const totalDowntimeMinutes = downtimeFromTable + downtimeFromFacts;

  const totalProduced = facts.reduce((sum, f) => sum + f.producedQuantity, 0);
  const totalDefective = facts.reduce((sum, f) => sum + f.defectiveQuantity, 0);

  let normQuantity: number | null = normFromSchedule > 0 ? normFromSchedule : null;
  if (normQuantity == null && facts.length > 0) {
    const orderIds = [...new Set(facts.map((f) => f.orderId))];
    normQuantity = orderIds.reduce((sum, orderId) => {
      const order = orderMap.get(orderId);
      if (!order) return sum;
      const target =
        order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity;
      return sum + target;
    }, 0);
    if (normQuantity === 0) normQuantity = null;
  }

  if (normQuantity == null && totalProduced > 0) {
    notes.push(
      "Норма не задана — Performance не рассчитан (заполните план слота или заказ)."
    );
  }
  if (totalPlannedMinutes === 0 && facts.length > 0) {
    notes.push(
      "Нет слотов графика в периоде — плановое время = 0, Availability не рассчитан."
    );
  }

  const summary = buildMetrics(
    totalPlannedMinutes,
    totalDowntimeMinutes,
    totalProduced,
    totalDefective,
    normQuantity
  );

  const orderIdsInScope = new Set<number>();
  scheduleSlots.forEach((s) => orderIdsInScope.add(s.orderId));
  facts.forEach((f) => orderIdsInScope.add(f.orderId));

  const byOrder: OeeOrderLine[] = [...orderIdsInScope].map((orderId) => {
    const order = orderMap.get(orderId);
    const orderSchedule = scheduleSlots.filter((s) => s.orderId === orderId);
    const orderFacts = facts.filter((f) => f.orderId === orderId);
    const plannedMin = orderSchedule.reduce(
      (sum, s) => sum + slotMinutes(s.startTime, s.endTime),
      0
    );
    const slotNorm = orderSchedule.reduce((sum, s) => sum + s.plannedQuantity, 0);
    let orderNorm: number | null = slotNorm > 0 ? slotNorm : null;
    if (orderNorm == null && order) {
      const target =
        order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity;
      orderNorm = target > 0 ? target : null;
    }

    const orderFactIdsWithRows = new Set(
      orderFacts.filter((f) => factIdsWithDowntimeRows.has(f.id)).map((f) => f.id)
    );
    const orderDowntime =
      downtimes
        .filter((d) => orderFacts.some((f) => f.id === d.factId))
        .reduce((sum, d) => sum + d.durationMinutes, 0) +
      orderFacts
        .filter((f) => !orderFactIdsWithRows.has(f.id))
        .reduce((sum, f) => sum + (f.downtimeMinutes ?? 0), 0);

    const produced = orderFacts.reduce((sum, f) => sum + f.producedQuantity, 0);
    const defective = orderFacts.reduce((sum, f) => sum + f.defectiveQuantity, 0);

    const metrics = buildMetrics(plannedMin, orderDowntime, produced, defective, orderNorm);

    return {
      ...metrics,
      orderId,
      orderNumber: order?.orderNumber ?? `#${orderId}`,
      productId: order?.productId ?? 0,
      productName: order ? productNameById.get(order.productId) ?? "—" : "—",
    };
  });

  const equipmentIdsInScope = new Set<string>();
  scheduleSlots.forEach((s) => equipmentIdsInScope.add(s.equipmentId));
  facts.forEach((f) => equipmentIdsInScope.add(f.equipmentId));
  downtimes.forEach((d) => equipmentIdsInScope.add(d.equipmentId));

  const byEquipment: OeeEquipmentLine[] = [...equipmentIdsInScope].map((eqId) => {
    const eqSchedule = scheduleSlots.filter((s) => s.equipmentId === eqId);
    const eqFacts = facts.filter((f) => f.equipmentId === eqId);
    const plannedMin = eqSchedule.reduce(
      (sum, s) => sum + slotMinutes(s.startTime, s.endTime),
      0
    );
    const slotNorm = eqSchedule.reduce((sum, s) => sum + s.plannedQuantity, 0);
    const eqDowntime =
      downtimes
        .filter((d) => d.equipmentId === eqId)
        .reduce((sum, d) => sum + d.durationMinutes, 0) +
      eqFacts
        .filter((f) => !factIdsWithDowntimeRows.has(f.id))
        .reduce((sum, f) => sum + (f.downtimeMinutes ?? 0), 0);

    const produced = eqFacts.reduce((sum, f) => sum + f.producedQuantity, 0);
    const defective = eqFacts.reduce((sum, f) => sum + f.defectiveQuantity, 0);
    const eqNorm = slotNorm > 0 ? slotNorm : null;

    const metrics = buildMetrics(plannedMin, eqDowntime, produced, defective, eqNorm);

    return {
      ...metrics,
      equipmentId: eqId,
      equipmentName: equipmentNameById.get(eqId) ?? eqId,
    };
  });

  byOrder.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  byEquipment.sort((a, b) => a.equipmentName.localeCompare(b.equipmentName));

  return {
    subdivisionId,
    from: periodFrom.toISOString(),
    to: periodTo.toISOString(),
    equipmentId: equipmentId ?? null,
    summary,
    byOrder,
    byEquipment,
    notes,
  };
}
