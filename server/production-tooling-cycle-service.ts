import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  productionFact,
  productionOrders,
  productionTooling,
  productionToolingProducts,
  products,
} from "@shared/schema";
import {
  isMaintenanceDue,
  piecesToCycles,
} from "@shared/production-tooling-utils";
import type { ProductionToolingStatus } from "@shared/schema";
import { getProductionTooling, patchToolingCycleCounters } from "./production-tooling-service";

async function linkedProductIdsForTooling(
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

export async function recalculateToolingCycles(toolingId: number): Promise<void> {
  const tooling = await getProductionTooling(toolingId);
  if (!tooling) return;

  const productIds = await linkedProductIdsForTooling(tooling);
  if (productIds.size === 0) return;

  const orders = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.subdivisionId, tooling.subdivisionId));
  const orderIdsForTooling = orders
    .filter((o) => productIds.has(o.productId))
    .map((o) => o.id);

  if (orderIdsForTooling.length === 0) {
    await updateToolingCounters(tooling, 0, tooling.cyclesAtLastMaintenance ?? 0);
    return;
  }

  const facts = await db
    .select()
    .from(productionFact)
    .where(
      and(
        eq(productionFact.subdivisionId, tooling.subdivisionId),
        inArray(productionFact.orderId, orderIdsForTooling)
      )
    );

  let totalPieces = 0;
  for (const fact of facts) {
    totalPieces += fact.producedQuantity ?? 0;
  }

  const totalCycles = piecesToCycles(totalPieces, tooling.cavities);
  const base = tooling.cyclesAtLastMaintenance ?? 0;
  const sinceMaintenance = Math.max(0, totalCycles - base);

  await updateToolingCounters(tooling, totalCycles, sinceMaintenance);
}

async function updateToolingCounters(
  tooling: typeof productionTooling.$inferSelect,
  totalCycles: number,
  sinceMaintenance: number
): Promise<void> {
  let status: ProductionToolingStatus = tooling.status as ProductionToolingStatus;
  if (
    tooling.status !== "decommissioned" &&
    tooling.status !== "on_maintenance" &&
    tooling.status !== "repair" &&
    tooling.status !== "testing"
  ) {
    if (isMaintenanceDue(tooling.maintenanceCycleInterval, sinceMaintenance)) {
      status = "maintenance_due";
    } else if (status === "maintenance_due") {
      status = "ok";
    }
  }

  await patchToolingCycleCounters(tooling.id, {
    cycleCounterTotal: totalCycles,
    cyclesSinceMaintenance: sinceMaintenance,
    status,
  });
}

export async function recalculateToolingCyclesForSubdivision(subdivisionId: number): Promise<void> {
  const rows = await db
    .select({ id: productionTooling.id })
    .from(productionTooling)
    .where(eq(productionTooling.subdivisionId, subdivisionId));

  for (const row of rows) {
    await recalculateToolingCycles(row.id);
  }
}
