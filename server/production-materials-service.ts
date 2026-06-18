import { db } from "./db";
import {
  materials,
  materialStocks,
  materialMovements,
  materialSubdivisionAvailability,
  productBom,
  productionFact,
  productionOrders,
  productionPlanningSettings,
  products,
  type InsertMaterialMovement,
  type MaterialWriteoffMode,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";

export interface MaterialRequirementLine {
  materialId: number;
  materialName: string;
  sapCode: string;
  unit: string;
  usageType: string;
  required: number;
  available: number;
  reserved: number;
  isRequired: boolean;
  sufficient: boolean;
}

export async function listMaterialStocksBySubdivision(subdivisionId: number) {
  const stocks = await db
    .select({
      stock: materialStocks,
      material: materials,
      product: products,
    })
    .from(materialStocks)
    .innerJoin(materials, eq(materialStocks.materialId, materials.id))
    .leftJoin(products, eq(materials.productId, products.id))
    .where(eq(materialStocks.subdivisionId, subdivisionId));

  return stocks.map((row) => ({
    ...row.stock,
    materialName: row.material.name,
    sapCode: row.material.sapCode,
    materialType: row.material.type,
    materialUnit: row.material.unit,
    materialProductId: row.material.productId,
    linkedProductName: row.product?.name ?? null,
    linkedProductSapCode: row.product?.sapCode ?? null,
  }));
}

export async function getOrCreateMaterialStock(
  materialId: number,
  subdivisionId: number,
  storageLocation = ""
) {
  const [existing] = await db
    .select()
    .from(materialStocks)
    .where(
      and(
        eq(materialStocks.materialId, materialId),
        eq(materialStocks.subdivisionId, subdivisionId),
        eq(materialStocks.storageLocation, storageLocation)
      )
    );
  if (existing) return existing;

  const [created] = await db
    .insert(materialStocks)
    .values({
      materialId,
      subdivisionId,
      storageLocation,
      quantity: 0,
      reservedQuantity: 0,
      minStock: 0,
    })
    .returning();
  return created;
}

export async function calculateMaterialRequirements(
  productId: number,
  subdivisionId: number,
  quantity: number
): Promise<MaterialRequirementLine[]> {
  const bomLines = await db
    .select({
      bom: productBom,
      material: materials,
    })
    .from(productBom)
    .innerJoin(materials, eq(productBom.materialId, materials.id))
    .where(and(eq(productBom.productId, productId), eq(productBom.subdivisionId, subdivisionId)));

  const results: MaterialRequirementLine[] = [];

  for (const { bom, material } of bomLines) {
    let required = 0;
    switch (bom.usageType) {
      case "per_unit":
        required = (bom.quantityPerUnit ?? 0) * quantity;
        break;
      case "percentage":
        required = quantity * ((bom.percentage ?? 0) / 100);
        break;
      case "fixed":
        required = bom.quantityPerUnit ?? 0;
        break;
      default:
        required = (bom.quantityPerUnit ?? 0) * quantity;
    }

    const stock = await getOrCreateMaterialStock(material.id, subdivisionId);
    const available = stock.quantity - stock.reservedQuantity;

    results.push({
      materialId: material.id,
      materialName: material.name,
      sapCode: material.sapCode,
      unit: bom.unit ?? material.unit,
      usageType: bom.usageType,
      required,
      available,
      reserved: stock.reservedQuantity,
      isRequired: bom.isRequired,
      sufficient: available >= required,
    });
  }

  return results;
}

export async function getMaterialWriteoffMode(subdivisionId: number): Promise<MaterialWriteoffMode> {
  const [settings] = await db
    .select()
    .from(productionPlanningSettings)
    .where(eq(productionPlanningSettings.subdivisionId, subdivisionId));
  return (settings?.materialWriteoffMode as MaterialWriteoffMode) ?? "sync";
}

export async function recordMaterialMovement(
  data: Omit<InsertMaterialMovement, "id" | "createdAt"> & { type: InsertMaterialMovement["type"] }
) {
  const [movement] = await db.insert(materialMovements).values(data).returning();
  return movement;
}

async function adjustStockQuantity(
  materialId: number,
  subdivisionId: number,
  deltaQuantity: number,
  deltaReserved = 0
) {
  const stock = await getOrCreateMaterialStock(materialId, subdivisionId);
  const [updated] = await db
    .update(materialStocks)
    .set({
      quantity: stock.quantity + deltaQuantity,
      reservedQuantity: stock.reservedQuantity + deltaReserved,
      updatedAt: new Date(),
    })
    .where(eq(materialStocks.id, stock.id))
    .returning();
  return updated;
}

export async function reserveMaterialsForQuantity(
  productId: number,
  subdivisionId: number,
  quantity: number,
  productionOrderId: number,
  user: { id: number; name: string }
) {
  const requirements = await calculateMaterialRequirements(productId, subdivisionId, quantity);
  const movements = [];

  for (const req of requirements) {
    if (!req.isRequired || req.required <= 0) continue;
    await adjustStockQuantity(req.materialId, subdivisionId, 0, req.required);
    const movement = await recordMaterialMovement({
      materialId: req.materialId,
      subdivisionId,
      type: "reserve",
      quantity: req.required,
      productionOrderId,
      comment: `Резерв по заказу #${productionOrderId}`,
      performedById: user.id,
      performedByName: user.name,
    });
    movements.push(movement);
  }

  return { requirements, movements };
}

export async function applyWriteoffFromRequirements(
  factId: number,
  subdivisionId: number,
  orderId: number,
  producedQuantity: number,
  user: { id: number; name: string }
) {
  const [order] = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.id, orderId));

  if (!order?.productId) return { skipped: true, reason: "no_product" };

  const requirements = await calculateMaterialRequirements(
    order.productId,
    subdivisionId,
    producedQuantity
  );
  const movements = [];

  for (const req of requirements) {
    if (!req.isRequired || req.required <= 0) continue;

    const stock = await getOrCreateMaterialStock(req.materialId, subdivisionId);
    const unreserve = Math.min(req.required, stock.reservedQuantity);
    if (unreserve > 0) {
      await adjustStockQuantity(req.materialId, subdivisionId, 0, -unreserve);
      await recordMaterialMovement({
        materialId: req.materialId,
        subdivisionId,
        type: "unreserve",
        quantity: unreserve,
        productionOrderId: orderId,
        productionFactId: factId,
        comment: `Снятие резерва при списании (факт #${factId})`,
        performedById: user.id,
        performedByName: user.name,
      });
    }

    await adjustStockQuantity(req.materialId, subdivisionId, -req.required);
    const movement = await recordMaterialMovement({
      materialId: req.materialId,
      subdivisionId,
      type: "out",
      quantity: req.required,
      productionOrderId: orderId,
      productionFactId: factId,
      comment: `Списание по факту выпуска #${factId}`,
      performedById: user.id,
      performedByName: user.name,
    });
    movements.push(movement);
  }

  return { requirements, movements };
}

export async function processFactMaterialWriteoff(
  factId: number,
  subdivisionId: number,
  user: { id: number; name: string }
) {
  const mode = await getMaterialWriteoffMode(subdivisionId);

  if (mode === "manual") {
    return { mode, deferred: false, result: null };
  }

  const run = async () => {
    const [fact] = await db.select().from(productionFact).where(eq(productionFact.id, factId));
    if (!fact) return null;
    return applyWriteoffFromRequirements(
      factId,
      fact.subdivisionId,
      fact.orderId,
      fact.producedQuantity,
      user
    );
  };

  if (mode === "async") {
    setImmediate(() => {
      run().catch((err) => console.error("async material writeoff failed:", err));
    });
    return { mode, deferred: true, result: null };
  }

  const result = await run();
  return { mode, deferred: false, result };
}

export async function syncMaterialSubdivisionAvailability(
  materialId: number,
  subdivisionIds: number[]
) {
  await db
    .delete(materialSubdivisionAvailability)
    .where(eq(materialSubdivisionAvailability.materialId, materialId));

  if (subdivisionIds.length === 0) return [];

  return db
    .insert(materialSubdivisionAvailability)
    .values(subdivisionIds.map((subdivisionId) => ({ materialId, subdivisionId })))
    .returning();
}

export async function listMaterialSubdivisionIds(materialId: number): Promise<number[]> {
  const rows = await db
    .select()
    .from(materialSubdivisionAvailability)
    .where(eq(materialSubdivisionAvailability.materialId, materialId));
  return rows.map((r) => r.subdivisionId);
}

export async function listMaterialsWithLowStock(subdivisionId: number) {
  const stocks = await listMaterialStocksBySubdivision(subdivisionId);
  return stocks.filter((s) => s.quantity - s.reservedQuantity < s.minStock);
}

export async function countMaterialShortages(subdivisionId: number) {
  const low = await listMaterialsWithLowStock(subdivisionId);
  return low.length;
}

export async function listMaterialMovements(filters: {
  subdivisionId: number;
  from?: Date;
  to?: Date;
  materialId?: number;
}) {
  let rows = await db
    .select({
      movement: materialMovements,
      material: materials,
    })
    .from(materialMovements)
    .innerJoin(materials, eq(materialMovements.materialId, materials.id))
    .where(eq(materialMovements.subdivisionId, filters.subdivisionId))
    .orderBy(materialMovements.createdAt);

  if (filters.materialId) {
    rows = rows.filter((r) => r.movement.materialId === filters.materialId);
  }
  if (filters.from) {
    rows = rows.filter((r) => r.movement.createdAt >= filters.from!);
  }
  if (filters.to) {
    rows = rows.filter((r) => r.movement.createdAt <= filters.to!);
  }

  return rows.map((r) => ({
    ...r.movement,
    materialName: r.material.name,
    sapCode: r.material.sapCode,
    materialType: r.material.type,
    unit: r.material.unit,
  }));
}

export async function getInternalWarehouseSummary(
  subdivisionId: number,
  from?: Date,
  to?: Date
) {
  const stocks = await listMaterialStocksBySubdivision(subdivisionId);
  const movements = await listMaterialMovements({ subdivisionId, from, to });

  const orders = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.subdivisionId, subdivisionId));

  const activeOrders = orders.filter(
    (o) => !["completed", "cancelled"].includes(o.status)
  );

  let totalRequiredKg = 0;
  const requirementLines: Array<{
    materialId: number;
    materialName: string;
    sapCode: string;
    required: number;
    available: number;
    unit: string;
    materialType: string;
  }> = [];

  for (const order of activeOrders) {
    const remaining =
      order.plannedQuantity > 0
        ? order.plannedQuantity - order.completedQuantity
        : order.requestedQuantity - order.completedQuantity;
    if (remaining <= 0) continue;
    const reqs = await calculateMaterialRequirements(
      order.productId,
      subdivisionId,
      remaining
    );
    for (const r of reqs) {
      totalRequiredKg += r.required;
      const existing = requirementLines.find((x) => x.materialId === r.materialId);
      if (existing) {
        existing.required += r.required;
      } else {
        const stock = stocks.find((s) => s.materialId === r.materialId);
        requirementLines.push({
          materialId: r.materialId,
          materialName: r.materialName,
          sapCode: r.sapCode,
          required: r.required,
          available: r.available,
          unit: r.unit,
          materialType: stock?.materialType ?? "other",
        });
      }
    }
  }

  const consumedByMaterial = new Map<number, number>();
  for (const m of movements) {
    if (m.type === "out" || m.type === "writeoff") {
      consumedByMaterial.set(
        m.materialId,
        (consumedByMaterial.get(m.materialId) ?? 0) + m.quantity
      );
    }
  }

  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.subdivisionId, subdivisionId));
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const nonCancelledOrders = orders.filter((o) => o.status !== "cancelled");

  const finishedByOrder = nonCancelledOrders
    .map((order) => {
      const product = productById.get(order.productId);
      const target =
        order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity;
      const remainder = target - order.completedQuantity;
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        productId: order.productId,
        productName: product?.name ?? "—",
        sapCode: product?.sapCode ?? "—",
        pfNumber: product?.pfNumber ?? null,
        targetQuantity: target,
        completedQuantity: order.completedQuantity,
        remainderQuantity: remainder,
        defectiveQuantity: order.defectiveQuantity,
        status: order.status,
      };
    })
    .filter((row) => row.completedQuantity > 0 || row.remainderQuantity > 0)
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

  const finishedProductMap = new Map<
    number,
    {
      productId: number;
      sapCode: string;
      name: string;
      pfNumber: string | null;
      quantityOnHand: number;
      quantityDefective: number;
      quantityOrderRemainder: number;
      orderCount: number;
    }
  >();

  for (const order of nonCancelledOrders) {
    const product = productById.get(order.productId);
    if (!product) continue;
    const target =
      order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity;
    const remainder = Math.max(0, target - order.completedQuantity);

    const bucket = finishedProductMap.get(order.productId) ?? {
      productId: order.productId,
      sapCode: product.sapCode,
      name: product.name,
      pfNumber: product.pfNumber,
      quantityOnHand: 0,
      quantityDefective: 0,
      quantityOrderRemainder: 0,
      orderCount: 0,
    };
    bucket.quantityOnHand += order.completedQuantity;
    bucket.quantityDefective += order.defectiveQuantity;
    if (!["completed", "cancelled"].includes(order.status)) {
      bucket.quantityOrderRemainder += remainder;
    }
    bucket.orderCount += 1;
    finishedProductMap.set(order.productId, bucket);
  }

  const finishedProducts = [...finishedProductMap.values()]
    .filter(
      (p) =>
        p.quantityOnHand > 0 || p.quantityDefective > 0 || p.quantityOrderRemainder > 0
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const finishedQuantityTotal = finishedProducts.reduce(
    (sum, p) => sum + p.quantityOnHand,
    0
  );
  const finishedDefectiveTotal = finishedProducts.reduce(
    (sum, p) => sum + p.quantityDefective,
    0
  );

  return {
    subdivisionId,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    stocks,
    movements,
    requirements: requirementLines.sort((a, b) => a.materialName.localeCompare(b.materialName)),
    finishedProducts,
    finishedByOrder,
    summary: {
      stockItems: stocks.length,
      shortages: stocks.filter((s) => s.quantity - s.reservedQuantity < s.minStock).length,
      toolingItems: stocks.filter((s) => s.materialType === "tooling").length,
      movementsCount: movements.length,
      consumedTotal: [...consumedByMaterial.values()].reduce((a, b) => a + b, 0),
      plannedMaterialKg: Math.round(totalRequiredKg * 100) / 100,
      activeOrders: activeOrders.length,
      finishedProductSkus: finishedProducts.length,
      finishedQuantityTotal: Math.round(finishedQuantityTotal),
      finishedDefectiveTotal: Math.round(finishedDefectiveTotal),
    },
  };
}
