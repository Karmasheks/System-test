import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  productionDailyPlan,
  productionTooling,
  productionToolingProducts,
  products,
} from "@shared/schema";
import {
  isMaintenanceDue,
  predictNextMaintenanceDateFromPlan,
  resolveNextMaintenancePlannedAt,
} from "@shared/production-tooling-utils";

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
  const [rows, toolingRows, productRows] = await Promise.all([
    db
      .select()
      .from(productionDailyPlan)
      .where(
        and(
          eq(productionDailyPlan.subdivisionId, subdivisionId),
          gte(productionDailyPlan.planDate, today)
        )
      ),
    db
      .select({ id: productionTooling.id, pfNumber: productionTooling.pfNumber })
      .from(productionTooling)
      .where(eq(productionTooling.subdivisionId, subdivisionId)),
    db
      .select({ id: products.id, pfNumber: products.pfNumber })
      .from(products)
      .where(eq(products.subdivisionId, subdivisionId)),
  ]);

  const toolingByPf = new Map(
    toolingRows.map((t) => [t.pfNumber.toUpperCase(), t.id])
  );
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const byProductId = new Map<number, Map<string, number>>();
  const byToolingId = new Map<number, Map<string, number>>();

  const addToolingQty = (toolingId: number, d: string, qty: number) => {
    if (!byToolingId.has(toolingId)) byToolingId.set(toolingId, new Map());
    const bucket = byToolingId.get(toolingId)!;
    bucket.set(d, (bucket.get(d) ?? 0) + qty);
  };

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

    let toolingId = row.toolingId ?? null;
    if (!toolingId && row.pfNumber) {
      toolingId = toolingByPf.get(row.pfNumber.toUpperCase()) ?? null;
    }
    if (!toolingId && row.productId) {
      const product = productById.get(row.productId);
      if (product?.pfNumber) {
        toolingId = toolingByPf.get(product.pfNumber.toUpperCase()) ?? null;
      }
    }
    if (toolingId) addToolingQty(toolingId, d, qty);
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
  const maintenanceDue = isMaintenanceDue(
    tooling.maintenanceCycleInterval,
    tooling.cyclesSinceMaintenance
  );
  const resolved = resolveNextMaintenancePlannedAt(
    tooling.nextMaintenancePlannedAt,
    predicted,
    maintenanceDue
  );
  const current = tooling.nextMaintenancePlannedAt?.getTime() ?? null;
  const next = resolved?.getTime() ?? null;
  if (current !== next) {
    await db
      .update(productionTooling)
      .set({
        nextMaintenancePlannedAt: resolved,
        updatedAt: new Date(),
      })
      .where(eq(productionTooling.id, tooling.id));
  }
  return resolved;
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

  const byPf = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.subdivisionId, tooling.subdivisionId),
        eq(products.pfNumber, tooling.pfNumber)
      )
    );
  for (const row of byPf) ids.add(row.id);

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
