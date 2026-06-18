import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { productionDailyPlan, productionTooling, productionToolingProducts } from "@shared/schema";
import { predictNextMaintenanceDateFromPlan } from "@shared/production-tooling-utils";

function dateKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export type MaintenancePlanContext = {
  byProductId: Map<number, Map<string, number>>;
  byToolingId: Map<number, Map<string, number>>;
};

export async function loadMaintenancePlanContext(
  subdivisionId: number
): Promise<MaintenancePlanContext> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(productionDailyPlan)
    .where(eq(productionDailyPlan.subdivisionId, subdivisionId));

  const byProductId = new Map<number, Map<string, number>>();
  const byToolingId = new Map<number, Map<string, number>>();

  for (const row of rows) {
    const d = dateKey(row.planDate);
    if (d < today) continue;
    const qty = row.plannedQuantity ?? 0;
    if (qty <= 0) continue;

    if (row.productId) {
      if (!byProductId.has(row.productId)) byProductId.set(row.productId, new Map());
      const bucket = byProductId.get(row.productId)!;
      bucket.set(d, (bucket.get(d) ?? 0) + qty);
    }
    if (row.toolingId) {
      if (!byToolingId.has(row.toolingId)) byToolingId.set(row.toolingId, new Map());
      const bucket = byToolingId.get(row.toolingId)!;
      bucket.set(d, (bucket.get(d) ?? 0) + qty);
    }
  }

  return { byProductId, byToolingId };
}

export function planEntriesForTooling(
  toolingId: number,
  productIds: Iterable<number>,
  ctx: MaintenancePlanContext
) {
  const dateQty = new Map<string, number>();
  for (const productId of productIds) {
    for (const [d, q] of ctx.byProductId.get(productId) ?? []) {
      dateQty.set(d, (dateQty.get(d) ?? 0) + q);
    }
  }
  for (const [d, q] of ctx.byToolingId.get(toolingId) ?? []) {
    dateQty.set(d, (dateQty.get(d) ?? 0) + q);
  }
  return [...dateQty.entries()]
    .map(([planDate, plannedQuantity]) => ({ planDate, plannedQuantity }))
    .sort((a, b) => a.planDate.localeCompare(b.planDate));
}

export function predictMaintenanceDateForTooling(
  tooling: typeof productionTooling.$inferSelect,
  productIds: Iterable<number>,
  ctx: MaintenancePlanContext
): Date | null {
  const entries = planEntriesForTooling(tooling.id, productIds, ctx);
  return predictNextMaintenanceDateFromPlan(
    tooling.cyclesSinceMaintenance,
    tooling.maintenanceCycleInterval,
    tooling,
    entries
  );
}

export async function syncToolingMaintenancePlannedDate(
  tooling: typeof productionTooling.$inferSelect,
  productIds: Iterable<number>,
  ctx?: MaintenancePlanContext
): Promise<Date | null> {
  const planCtx = ctx ?? (await loadMaintenancePlanContext(tooling.subdivisionId));
  const predicted = predictMaintenanceDateForTooling(tooling, productIds, planCtx);
  const current = tooling.nextMaintenancePlannedAt?.getTime() ?? null;
  const next = predicted?.getTime() ?? null;
  if (current !== next) {
    await db
      .update(productionTooling)
      .set({
        nextMaintenancePlannedAt: predicted,
        updatedAt: new Date(),
      })
      .where(eq(productionTooling.id, tooling.id));
  }
  return predicted;
}

export async function syncToolingMaintenancePlannedDatesForSubdivision(
  subdivisionId: number
): Promise<void> {
  const [toolingRows, planCtx] = await Promise.all([
    db.select().from(productionTooling).where(eq(productionTooling.subdivisionId, subdivisionId)),
    loadMaintenancePlanContext(subdivisionId),
  ]);

  const toolingIds = toolingRows.map((r) => r.id);
  const junctionRows =
    toolingIds.length > 0
      ? await db
          .select()
          .from(productionToolingProducts)
          .where(inArray(productionToolingProducts.toolingId, toolingIds))
      : [];

  const junctionByTooling = new Map<number, number[]>();
  for (const j of junctionRows) {
    const list = junctionByTooling.get(j.toolingId) ?? [];
    list.push(j.productId);
    junctionByTooling.set(j.toolingId, list);
  }

  await Promise.all(
    toolingRows.map((row) => {
      const ids = new Set<number>();
      if (row.productId) ids.add(row.productId);
      for (const pid of junctionByTooling.get(row.id) ?? []) ids.add(pid);
      return syncToolingMaintenancePlannedDate(row, ids, planCtx);
    })
  );
}

export async function linkedProductIdsForToolingRow(
  tooling: typeof productionTooling.$inferSelect
): Promise<Set<number>> {
  const ids = new Set<number>();
  if (tooling.productId) ids.add(tooling.productId);
  const junction = await db
    .select({ productId: productionToolingProducts.productId })
    .from(productionToolingProducts)
    .where(eq(productionToolingProducts.toolingId, tooling.id));
  for (const row of junction) ids.add(row.productId);
  return ids;
}

export async function loadJunctionByTooling(
  toolingIds: number[]
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (toolingIds.length === 0) return map;
  const rows = await db
    .select()
    .from(productionToolingProducts)
    .where(inArray(productionToolingProducts.toolingId, toolingIds));
  for (const row of rows) {
    const list = map.get(row.toolingId) ?? [];
    list.push(row.productId);
    map.set(row.toolingId, list);
  }
  return map;
}
