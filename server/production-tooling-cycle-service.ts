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
  computeToolingCyclesFromFacts,
  piecesToCycles,
  resolveToolingStatusForCycleCount,
} from "@shared/production-tooling-utils";
import type { ProductionToolingStatus } from "@shared/schema";
import { getProductionTooling, patchToolingCycleCounters } from "./production-tooling-service";
import {
  linkedProductIdsForToolingRow,
  syncToolingMaintenancePlannedDate,
} from "./production-tooling-maintenance-plan";

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

function cycleDivisorForProduct(
  tooling: typeof productionTooling.$inferSelect,
  product: typeof products.$inferSelect | undefined
) {
  return {
    piecesPerCycle: tooling.piecesPerCycle,
    cavitiesLayout: tooling.cavitiesLayout,
    cavities: product?.cavities ?? tooling.cavities,
  };
}

async function factCyclesForTooling(
  tooling: typeof productionTooling.$inferSelect,
  productIds: Set<number>
): Promise<number> {
  const orders = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.subdivisionId, tooling.subdivisionId));
  const orderIdsForTooling = orders
    .filter((o) => productIds.has(o.productId))
    .map((o) => o.id);

  if (orderIdsForTooling.length === 0) return 0;

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const productRows =
    productIds.size > 0
      ? await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.subdivisionId, tooling.subdivisionId),
              inArray(products.id, [...productIds])
            )
          )
      : [];
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const facts = await db
    .select()
    .from(productionFact)
    .where(
      and(
        eq(productionFact.subdivisionId, tooling.subdivisionId),
        inArray(productionFact.orderId, orderIdsForTooling)
      )
    );

  const piecesByProduct = new Map<number, number>();
  for (const fact of facts) {
    const order = orderById.get(fact.orderId);
    if (!order) continue;
    piecesByProduct.set(
      order.productId,
      (piecesByProduct.get(order.productId) ?? 0) + (fact.producedQuantity ?? 0)
    );
  }

  let totalFactCycles = 0;
  for (const [productId, pieces] of piecesByProduct) {
    if (pieces <= 0) continue;
    totalFactCycles += piecesToCycles(
      pieces,
      cycleDivisorForProduct(tooling, productById.get(productId))
    );
  }
  return totalFactCycles;
}

export async function recalculateToolingCycles(toolingId: number): Promise<void> {
  const tooling = await getProductionTooling(toolingId);
  if (!tooling) return;

  const productIds = await linkedProductIdsForTooling(tooling);
  if (productIds.size === 0) return;

  const factCycles = await factCyclesForTooling(tooling, productIds);
  if (factCycles <= 0) return;

  const computed = computeToolingCyclesFromFacts(tooling, factCycles);
  if (!computed) return;

  await updateToolingCounters(tooling, computed.totalCycles, computed.sinceMaintenance);
}

async function updateToolingCounters(
  tooling: typeof productionTooling.$inferSelect,
  totalCycles: number,
  sinceMaintenance: number
): Promise<void> {
  let status: ProductionToolingStatus = tooling.status as ProductionToolingStatus;
  status = resolveToolingStatusForCycleCount(
    status,
    tooling.maintenanceCycleInterval,
    sinceMaintenance
  ) as ProductionToolingStatus;

  await patchToolingCycleCounters(tooling.id, {
    cycleCounterTotal: totalCycles,
    cyclesSinceMaintenance: sinceMaintenance,
    status,
  });

  const fresh = await getProductionTooling(tooling.id);
  if (fresh) {
    const ids = await linkedProductIdsForToolingRow(fresh);
    await syncToolingMaintenancePlannedDate(fresh, ids);
  }
}

export async function recalculateToolingCyclesForProduct(productId: number): Promise<void> {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return;

  const toolingIds = new Set<number>();

  if (product.pfNumber) {
    const byPf = await db
      .select({ id: productionTooling.id })
      .from(productionTooling)
      .where(
        and(
          eq(productionTooling.subdivisionId, product.subdivisionId),
          eq(productionTooling.pfNumber, product.pfNumber)
        )
      );
    for (const row of byPf) toolingIds.add(row.id);
  }

  const junction = await db
    .select({ toolingId: productionToolingProducts.toolingId })
    .from(productionToolingProducts)
    .where(eq(productionToolingProducts.productId, productId));
  for (const row of junction) toolingIds.add(row.toolingId);

  await Promise.all([...toolingIds].map((id) => recalculateToolingCycles(id)));
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
