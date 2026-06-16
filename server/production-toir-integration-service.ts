import { db } from "./db";
import {
  equipment,
  maintenanceRecords,
  productionPlanConflicts,
  productionSchedule,
  productionOrders,
  products,
  serviceRequests,
  tasks,
} from "@shared/schema";
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { isoWeekToMonday } from "@shared/iso-week";
import {
  checkScheduleConflicts,
  summarizeConflictStatus,
  type ProductionConflictItem,
} from "./production-conflicts-service";
import { getProductionOrder, listSchedule } from "./production-service";

const ACTIVE_SCHEDULE_STATUSES = ["planned", "in_progress", "paused"];
const ACTIVE_MAINTENANCE_STATUSES = ["scheduled", "in_progress", "overdue", "unplanned", "postponed"];
const REPAIR_SR_TYPES = ["repair", "diagnostics"];
const REPAIR_TASK_TYPES = ["repair", "diagnostics"];
const ACTIVE_TASK_STATUSES = ["pending", "in_progress", "overdue"];
const CLOSED_SR_STATUSES = ["closed", "cancelled", "duplicate", "not_needed"];

export type ToirOverlayBlock = {
  id: string;
  kind: "maintenance" | "repair";
  equipmentId: string;
  equipmentName: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  linkedMaintenanceId?: number;
  linkedServiceRequestId?: number;
  linkedTaskId?: number;
};

function parseDurationHours(duration: string | null | undefined): number | null {
  if (!duration?.trim()) return null;
  const match = duration.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function durationMs(hours?: number | null, fallbackHours = 4): number {
  const h = hours != null && hours > 0 ? hours : fallbackHours;
  return h * 60 * 60 * 1000;
}

function srStartDate(sr: typeof serviceRequests.$inferSelect): Date {
  if (sr.plannedDate) return new Date(sr.plannedDate);
  if (sr.plannedWeek) {
    const monday = isoWeekToMonday(sr.plannedWeek);
    if (monday) return monday;
  }
  return new Date(sr.createdAt);
}

function isOpenRepairServiceRequest(sr: typeof serviceRequests.$inferSelect): boolean {
  return (
    REPAIR_SR_TYPES.includes(sr.requestType) && !CLOSED_SR_STATUSES.includes(sr.status)
  );
}

export async function getEquipmentPlanningAvailability(equipmentId: string) {
  const [equipmentRow] = await db
    .select()
    .from(equipment)
    .where(eq(equipment.id, equipmentId));
  if (!equipmentRow) {
    return { available: false, reasons: ["Оборудование не найдено"], equipment: null };
  }

  const reasons: string[] = [];

  if (equipmentRow.status === "decommissioned") reasons.push("Выведено из эксплуатации");
  if (equipmentRow.status === "inactive") reasons.push("Неактивно");
  if (equipmentRow.status === "repair") reasons.push("В ремонте");
  if (equipmentRow.status === "maintenance") reasons.push("На ТО");
  if (equipmentRow.repairSubdivisionId != null) {
    reasons.push(
      `Отправлено в ремонт: ${equipmentRow.repairSubdivisionName ?? equipmentRow.repairSubdivisionId}`
    );
  }

  const repairRequests = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.equipmentId, equipmentId),
        inArray(serviceRequests.requestType, REPAIR_SR_TYPES)
      )
    );

  for (const sr of repairRequests) {
    if (isOpenRepairServiceRequest(sr)) {
      reasons.push(`Активная заявка #${sr.id} (${sr.requestType}, ${sr.status})`);
    }
  }

  return {
    available: reasons.length === 0,
    reasons,
    equipment: equipmentRow,
  };
}

export type ToirOverlayOptions = {
  showMaintenance?: boolean;
  showRepair?: boolean;
  maintenanceDefaultHours?: number;
  repairDefaultHours?: number;
};

export async function getEquipmentProductionSummary(
  equipmentId: string,
  options?: {
    horizonDays?: number;
    maxSlots?: number;
    slotStatuses?: string[];
  }
) {
  const availability = await getEquipmentPlanningAvailability(equipmentId);
  const now = new Date();
  const horizonDays = options?.horizonDays ?? 45;
  const maxSlots = options?.maxSlots ?? 8;
  const slotStatuses = options?.slotStatuses ?? ACTIVE_SCHEDULE_STATUSES;
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + horizonDays);

  const allSchedule = await listSchedule({ equipmentId });
  const upcomingSchedule = allSchedule
    .filter(
      (s) =>
        slotStatuses.includes(s.status) &&
        s.endTime >= now &&
        s.startTime <= horizon
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, maxSlots);

  const orderMap = new Map<number, Awaited<ReturnType<typeof getProductionOrder>>>();
  const productMap = new Map<number, { id: number; name: string; sapCode: string }>();

  for (const slot of upcomingSchedule) {
    if (!orderMap.has(slot.orderId)) {
      orderMap.set(slot.orderId, await getProductionOrder(slot.orderId));
    }
    const order = orderMap.get(slot.orderId);
    if (order && !productMap.has(order.productId)) {
      const [product] = await db
        .select({ id: products.id, name: products.name, sapCode: products.sapCode })
        .from(products)
        .where(eq(products.id, order.productId));
      if (product) productMap.set(order.productId, product);
    }
  }

  const openConflicts = await db
    .select()
    .from(productionPlanConflicts)
    .where(
      and(
        eq(productionPlanConflicts.equipmentId, equipmentId),
        eq(productionPlanConflicts.isResolved, false)
      )
    )
    .orderBy(productionPlanConflicts.createdAt);

  const scheduleRows = upcomingSchedule.map((slot) => {
    const order = orderMap.get(slot.orderId);
    const product = order ? productMap.get(order.productId) : undefined;
    return {
      id: slot.id,
      orderId: slot.orderId,
      orderNumber: order?.orderNumber ?? `#${slot.orderId}`,
      productName: product?.name ?? "—",
      productSapCode: product?.sapCode ?? "",
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
      plannedQuantity: slot.plannedQuantity,
      status: slot.status,
      conflictStatus: slot.conflictStatus,
      subdivisionId: slot.subdivisionId,
    };
  });

  return {
    availableForPlanning: availability.available,
    unavailableReasons: availability.reasons,
    schedule: scheduleRows,
    openConflicts,
    equipmentStatus: availability.equipment?.status ?? null,
  };
}

export async function getScheduleToirOverlay(
  filters: {
    subdivisionId: number;
    from: Date;
    to: Date;
    equipmentId?: string;
  },
  options?: ToirOverlayOptions
): Promise<ToirOverlayBlock[]> {
  const { subdivisionId, from, to, equipmentId } = filters;
  const showMaintenance = options?.showMaintenance ?? true;
  const showRepair = options?.showRepair ?? true;
  const maintenanceHours = options?.maintenanceDefaultHours ?? 4;
  const repairHours = options?.repairDefaultHours ?? 4;
  const blocks: ToirOverlayBlock[] = [];

  const subdivisionEquipment = await db
    .select()
    .from(equipment)
    .where(
      or(
        eq(equipment.subdivisionId, subdivisionId),
        eq(equipment.homeSubdivisionId, subdivisionId)
      )
    );
  const equipmentIds = new Set(subdivisionEquipment.map((e) => e.id));
  const equipmentNameById = new Map(subdivisionEquipment.map((e) => [e.id, e.name]));

  const maintenanceRows = showMaintenance
    ? await db
        .select()
        .from(maintenanceRecords)
        .where(
          and(
            inArray(maintenanceRecords.status, [...ACTIVE_MAINTENANCE_STATUSES]),
            gte(maintenanceRecords.scheduledDate, from),
            lte(maintenanceRecords.scheduledDate, to)
          )
        )
    : [];

  for (const m of maintenanceRows) {
    if (!equipmentIds.has(m.equipmentId)) continue;
    if (equipmentId && m.equipmentId !== equipmentId) continue;
    const start = new Date(m.scheduledDate);
    const end = new Date(
      start.getTime() + durationMs(parseDurationHours(m.duration), maintenanceHours)
    );
    blocks.push({
      id: `maint-${m.id}`,
      kind: "maintenance",
      equipmentId: m.equipmentId,
      equipmentName: m.equipmentName ?? equipmentNameById.get(m.equipmentId) ?? m.equipmentId,
      title: `ТО: ${m.maintenanceType}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status: m.status,
      linkedMaintenanceId: m.id,
    });
  }

  if (showRepair) {
    const repairRequests = await db
      .select()
      .from(serviceRequests)
      .where(inArray(serviceRequests.requestType, REPAIR_SR_TYPES));

    for (const sr of repairRequests) {
      if (!isOpenRepairServiceRequest(sr)) continue;
      if (!equipmentIds.has(sr.equipmentId)) continue;
      if (equipmentId && sr.equipmentId !== equipmentId) continue;

      const start = srStartDate(sr);
      const end = new Date(start.getTime() + durationMs(sr.plannedHours, repairHours));
      if (end < from || start > to) continue;

      blocks.push({
        id: `sr-${sr.id}`,
        kind: "repair",
        equipmentId: sr.equipmentId,
        equipmentName: sr.equipmentName ?? equipmentNameById.get(sr.equipmentId) ?? sr.equipmentId,
        title: `Заявка #${sr.id}: ${sr.requestType}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: sr.status,
        linkedServiceRequestId: sr.id,
      });
    }

    const openTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          inArray(tasks.status, ACTIVE_TASK_STATUSES),
          or(
            inArray(tasks.taskType, REPAIR_TASK_TYPES),
            eq(tasks.taskType, "maintenance")
          )
        )
      );

    for (const task of openTasks) {
      if (!task.equipmentId || !equipmentIds.has(task.equipmentId)) continue;
      if (equipmentId && task.equipmentId !== equipmentId) continue;
      if (!task.dueDate) continue;

      const start = new Date(task.dueDate);
      const isMaint = task.taskType === "maintenance";
      const end = new Date(
        start.getTime() + durationMs(task.estimatedHours, isMaint ? maintenanceHours : repairHours)
      );
      if (end < from || start > to) continue;

      const kind = isMaint ? "maintenance" : "repair";
      blocks.push({
        id: `task-${task.id}`,
        kind,
        equipmentId: task.equipmentId,
        equipmentName: equipmentNameById.get(task.equipmentId) ?? task.equipmentId,
        title: task.title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: task.status,
        linkedTaskId: task.id,
      });
    }
  }

  return blocks.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

async function persistScheduleConflicts(
  subdivisionId: number,
  scheduleId: number,
  orderId: number,
  equipmentId: string,
  conflicts: ProductionConflictItem[]
) {
  await db
    .delete(productionPlanConflicts)
    .where(eq(productionPlanConflicts.scheduleId, scheduleId));

  for (const c of conflicts) {
    await db.insert(productionPlanConflicts).values({
      subdivisionId,
      scheduleId,
      orderId,
      equipmentId: c.equipmentId ?? equipmentId,
      conflictType: c.conflictType,
      severity: c.severity,
      message: c.message,
      linkedMaintenanceId: c.linkedMaintenanceId,
      linkedServiceRequestId: c.linkedServiceRequestId,
      linkedTaskId: c.linkedTaskId,
      isResolved: false,
    });
  }
}

export async function recalculateScheduleConflictsForEquipment(equipmentId: string) {
  const slots = await db
    .select()
    .from(productionSchedule)
    .where(
      and(
        eq(productionSchedule.equipmentId, equipmentId),
        inArray(productionSchedule.status, ACTIVE_SCHEDULE_STATUSES)
      )
    );

  const updated: number[] = [];

  for (const slot of slots) {
    const order = await getProductionOrder(slot.orderId);
    const conflicts = await checkScheduleConflicts({
      subdivisionId: slot.subdivisionId,
      orderId: slot.orderId,
      equipmentId: slot.equipmentId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      plannedQuantity: slot.plannedQuantity,
      scheduleId: slot.id,
      productId: order?.productId,
    });

    const conflictStatus = summarizeConflictStatus(conflicts);

    await db
      .update(productionSchedule)
      .set({ conflictStatus, updatedAt: new Date() })
      .where(eq(productionSchedule.id, slot.id));

    await persistScheduleConflicts(
      slot.subdivisionId,
      slot.id,
      slot.orderId,
      slot.equipmentId,
      conflicts
    );

    updated.push(slot.id);
  }

  return { updatedSlotIds: updated };
}

export async function syncToirAndRecalculateProduction(
  equipmentId: string | null | undefined,
  actor?: { id: number; name: string }
) {
  if (!equipmentId?.trim()) return;
  const { syncEquipmentOperationalStatus } = await import("./equipment-status-service");
  await syncEquipmentOperationalStatus(equipmentId, actor);
  await recalculateScheduleConflictsForEquipment(equipmentId);
}
