import { db } from "./db";
import {
  productionDailyPlan,
  productionOrders,
  products,
  equipment,
  productionFact,
  productEquipment,
  productionTooling,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";
import type { InsertProductionDailyPlan } from "@shared/schema";
import {
  computeShiftNormFromCycle,
  computeShiftsToComplete,
  resolveShiftNorm,
} from "@shared/production-norm-utils";
import { getActiveShiftPattern } from "./shift-template-service";
import { listSubdivisionShiftNorms } from "./product-shift-norm-service";
import { effectivePiecesPerCycle } from "@shared/cavities-utils";
import type { ShiftSlot } from "@shared/shift-template-types";

export type DailyPlanCellValue = {
  shifts: Record<string, number>;
  fact: number;
};

export type DailyPlanGridRow = {
  key: string;
  equipmentId: string;
  equipmentName: string;
  orderId: number | null;
  orderNumber: string | null;
  productId: number | null;
  productName: string | null;
  productSapCode: string | null;
  pfNumber: string | null;
  shiftNorm: number | null;
  normByShift: Record<string, number>;
  targetQuantity: number;
  completedQuantity: number;
  remainderQuantity: number;
  percentComplete: number;
  shiftsToComplete: number | null;
  cells: Record<string, DailyPlanCellValue>;
  planTotal: number;
  factTotal: number;
};

export type DailyPlanGridResponse = {
  subdivisionId: number;
  from: string;
  to: string;
  dates: string[];
  shiftSlots: ShiftSlot[];
  rows: DailyPlanGridRow[];
};

function dateKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function emptyCell(slotCodes: string[]): DailyPlanCellValue {
  const shifts: Record<string, number> = {};
  for (const code of slotCodes) shifts[code] = 0;
  return { shifts, fact: 0 };
}

export async function listDailyPlan(filters: {
  subdivisionId: number;
  from?: Date;
  to?: Date;
  equipmentId?: string;
}) {
  const conditions = [eq(productionDailyPlan.subdivisionId, filters.subdivisionId)];
  if (filters.equipmentId) {
    conditions.push(eq(productionDailyPlan.equipmentId, filters.equipmentId));
  }

  let rows = await db
    .select()
    .from(productionDailyPlan)
    .where(and(...conditions))
    .orderBy(productionDailyPlan.planDate);

  if (filters.from) {
    rows = rows.filter((r) => new Date(r.planDate) >= filters.from!);
  }
  if (filters.to) {
    rows = rows.filter((r) => new Date(r.planDate) <= filters.to!);
  }
  return rows;
}

export async function getDailyPlanGrid(filters: {
  subdivisionId: number;
  from: Date;
  to: Date;
  equipmentId?: string;
}): Promise<DailyPlanGridResponse> {
  const pattern = await getActiveShiftPattern(filters.subdivisionId);
  const slotCodes = pattern.slots.map((s) => s.code);
  const rows = await listDailyPlan(filters);
  const equipmentRows = await db.select().from(equipment);
  const equipmentNameById = new Map(equipmentRows.map((e) => [e.id, e.name]));

  const orderRows = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.subdivisionId, filters.subdivisionId));
  const orderById = new Map(orderRows.map((o) => [o.id, o]));

  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.subdivisionId, filters.subdivisionId));
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const toolingRows = await db
    .select()
    .from(productionTooling)
    .where(eq(productionTooling.subdivisionId, filters.subdivisionId));
  const toolingByPf = new Map(toolingRows.map((t) => [t.pfNumber, t]));

  const peRows = await db
    .select()
    .from(productEquipment)
    .where(eq(productEquipment.subdivisionId, filters.subdivisionId));
  const peByProductEquipment = new Map(
    peRows.map((pe) => [`${pe.productId}:${pe.equipmentId}`, pe])
  );

  const factRows = await db
    .select()
    .from(productionFact)
    .where(eq(productionFact.subdivisionId, filters.subdivisionId));
  const filteredFacts = factRows.filter((f) => {
    const d = new Date(f.reportDate);
    return d >= filters.from && d <= filters.to;
  });

  const dates: string[] = [];
  const cursor = new Date(filters.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(filters.to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    dates.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const rowMap = new Map<string, DailyPlanGridRow>();

  const storedNormRows = await listSubdivisionShiftNorms(filters.subdivisionId);
  const storedByProduct = new Map<number, Record<string, number>>();
  for (const row of storedNormRows) {
    const m = storedByProduct.get(row.productId) ?? {};
    m[row.shiftCode] = row.shiftNorm;
    storedByProduct.set(row.productId, m);
  }

  const buildNormByShift = (
    product: (typeof productRows)[0] | undefined,
    tooling: (typeof toolingRows)[0] | undefined,
    productId: number | null
  ): Record<string, number> => {
    if (!productId || !product) return {};
    const stored = storedByProduct.get(productId) ?? {};
    const result: Record<string, number> = {};
    for (const slot of pattern.slots) {
      if (stored[slot.code] != null && stored[slot.code] > 0) {
        result[slot.code] = stored[slot.code];
        continue;
      }
      const piecesPerCycle =
        product.cavities != null && product.cavities > 0
          ? product.cavities
          : tooling
            ? effectivePiecesPerCycle(tooling)
            : 1;
      const computed = computeShiftNormFromCycle(
        product.cycleTimeSec ?? tooling?.cycleTimeSec,
        piecesPerCycle,
        slot.hours
      );
      if (computed != null && computed > 0) {
        result[slot.code] = computed;
      } else if (product.defaultShiftNorm != null && product.defaultShiftNorm > 0) {
        result[slot.code] = product.defaultShiftNorm;
      }
    }
    return result;
  };

  const ensureRow = (
    equipmentId: string,
    orderId: number | null,
    productId: number | null,
    pfNumber: string | null
  ): DailyPlanGridRow => {
    const key = `${equipmentId}:${orderId ?? ""}:${productId ?? ""}:${pfNumber ?? ""}`;
    let gridRow = rowMap.get(key);
    if (!gridRow) {
      const order = orderId ? orderById.get(orderId) : undefined;
      const product =
        productId
          ? productById.get(productId)
          : order
            ? productById.get(order.productId)
            : undefined;
      const resolvedPf = pfNumber ?? product?.pfNumber ?? null;
      const tooling = resolvedPf ? toolingByPf.get(resolvedPf) : undefined;
      const pe = product
        ? peByProductEquipment.get(`${product.id}:${equipmentId}`)
        : undefined;
      const target = order
        ? order.plannedQuantity > 0
          ? order.plannedQuantity
          : order.requestedQuantity
        : 0;
      const completed = order?.completedQuantity ?? 0;
      const remainder = order ? Math.max(0, target - completed) : 0;
      const pid = productId ?? order?.productId ?? null;
      const normByShift = buildNormByShift(product, tooling, pid);
      const primaryNorm =
        (slotCodes[0] ? normByShift[slotCodes[0]] : null) ??
        (product ? resolveShiftNorm(product, pe, tooling) : null);

      gridRow = {
        key,
        equipmentId,
        equipmentName: equipmentNameById.get(equipmentId) ?? equipmentId,
        orderId,
        orderNumber: order?.orderNumber ?? null,
        productId: pid,
        productName: product?.name ?? null,
        productSapCode: product?.sapCode ?? null,
        pfNumber: resolvedPf,
        shiftNorm: primaryNorm,
        normByShift,
        targetQuantity: target,
        completedQuantity: completed,
        remainderQuantity: remainder,
        percentComplete:
          target > 0 ? Math.round((completed / target) * 100) : completed > 0 ? 100 : 0,
        shiftsToComplete: computeShiftsToComplete(remainder, primaryNorm),
        cells: {},
        planTotal: 0,
        factTotal: 0,
      };
      rowMap.set(key, gridRow);
    }
    return gridRow;
  };

  for (const cell of rows) {
    const gridRow = ensureRow(
      cell.equipmentId,
      cell.orderId ?? null,
      cell.productId ?? null,
      cell.pfNumber ?? null
    );
    const dk = dateKey(cell.planDate);
    if (!gridRow.cells[dk]) gridRow.cells[dk] = emptyCell(slotCodes);
    const qty = cell.plannedQuantity;
    const code = cell.shiftCode || slotCodes[0] || "1";
    if (gridRow.cells[dk].shifts[code] == null) gridRow.cells[dk].shifts[code] = 0;
    gridRow.cells[dk].shifts[code] += qty;
    gridRow.planTotal += qty;
  }

  for (const fact of filteredFacts) {
    const order = orderById.get(fact.orderId);
    const product = order ? productById.get(order.productId) : undefined;
    const pf = product?.pfNumber ?? null;
    const gridRow = ensureRow(fact.equipmentId, fact.orderId, order?.productId ?? null, pf);
    const dk = dateKey(fact.reportDate);
    if (!gridRow.cells[dk]) gridRow.cells[dk] = emptyCell(slotCodes);
    gridRow.cells[dk].fact += fact.producedQuantity;
    gridRow.factTotal += fact.producedQuantity;
  }

  const gridRows = [...rowMap.values()].sort((a, b) =>
    a.equipmentName.localeCompare(b.equipmentName)
  );

  return {
    subdivisionId: filters.subdivisionId,
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
    dates,
    shiftSlots: pattern.slots,
    rows: gridRows,
  };
}

async function findExistingCell(data: {
  subdivisionId: number;
  equipmentId: string;
  orderId?: number | null;
  productId?: number | null;
  planDate: Date | string;
  shiftCode: string;
}) {
  const all = await db
    .select()
    .from(productionDailyPlan)
    .where(
      and(
        eq(productionDailyPlan.subdivisionId, data.subdivisionId),
        eq(productionDailyPlan.equipmentId, data.equipmentId),
        eq(productionDailyPlan.shiftCode, data.shiftCode)
      )
    );

  const planDateStr = dateKey(data.planDate);
  return all.find(
    (r) =>
      dateKey(r.planDate) === planDateStr &&
      (r.orderId ?? null) === (data.orderId ?? null) &&
      (r.productId ?? null) === (data.productId ?? null)
  );
}

export async function upsertDailyPlanCell(data: InsertProductionDailyPlan) {
  const existing = await findExistingCell({
    subdivisionId: data.subdivisionId,
    equipmentId: data.equipmentId,
    orderId: data.orderId,
    productId: data.productId,
    planDate: data.planDate,
    shiftCode: data.shiftCode ?? "1",
  });

  if (existing) {
    const [row] = await db
      .update(productionDailyPlan)
      .set({
        plannedQuantity: data.plannedQuantity,
        pfNumber: data.pfNumber,
        toolingId: data.toolingId,
        comment: data.comment,
        updatedAt: new Date(),
      })
      .where(eq(productionDailyPlan.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(productionDailyPlan)
    .values({
      ...data,
      shiftCode: (data.shiftCode ?? "1") as "1" | "2",
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function bulkUpsertDailyPlan(
  subdivisionId: number,
  entries: Array<{
    equipmentId: string;
    orderId?: number | null;
    productId?: number | null;
    planDate: string;
    shiftCode?: string;
    plannedQuantity: number;
    pfNumber?: string | null;
    toolingId?: number | null;
    comment?: string | null;
  }>
) {
  const results = [];
  for (const entry of entries) {
    const row = await upsertDailyPlanCell({
      subdivisionId,
      equipmentId: entry.equipmentId,
      orderId: entry.orderId ?? undefined,
      productId: entry.productId ?? undefined,
      planDate: entry.planDate,
      shiftCode: (entry.shiftCode ?? "1") as "1" | "2",
      plannedQuantity: entry.plannedQuantity,
      pfNumber: entry.pfNumber ?? undefined,
      toolingId: entry.toolingId ?? undefined,
      comment: entry.comment ?? undefined,
    });
    if (row) results.push(row);
  }

  try {
    const { syncToolingMaintenancePlannedDatesForSubdivision } = await import(
      "./production-tooling-maintenance-plan"
    );
    await syncToolingMaintenancePlannedDatesForSubdivision(subdivisionId);
  } catch (err) {
    console.error("tooling maintenance date sync after daily plan:", err);
  }

  return results;
}
