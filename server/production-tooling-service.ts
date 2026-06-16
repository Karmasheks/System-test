import { db } from "./db";
import { productionTooling, products } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import type { InsertProductionTooling } from "@shared/schema";
import { computeShiftNormFromCycle } from "@shared/production-norm-utils";
import { createProduct } from "./production-service";

export async function listProductionTooling(filters: {
  subdivisionId: number;
  activeOnly?: boolean;
  search?: string;
}) {
  const rows = await db
    .select()
    .from(productionTooling)
    .where(eq(productionTooling.subdivisionId, filters.subdivisionId))
    .orderBy(productionTooling.pfNumber);

  let result = rows;
  if (filters.activeOnly) {
    result = result.filter((r) => r.isActive);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (r) =>
        r.pfNumber.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    );
  }
  return result;
}

export async function getProductionTooling(id: number) {
  const [row] = await db.select().from(productionTooling).where(eq(productionTooling.id, id));
  return row ?? null;
}

export async function createProductionTooling(data: InsertProductionTooling) {
  const [row] = await db
    .insert(productionTooling)
    .values({
      ...data,
      applicableEquipmentIds: data.applicableEquipmentIds ?? [],
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function updateProductionTooling(
  id: number,
  data: Partial<InsertProductionTooling>
) {
  const [row] = await db
    .update(productionTooling)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(productionTooling.id, id))
    .returning();
  return row ?? null;
}

export async function syncToolingFromProduct(productId: number) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product || !product.pfNumber) return null;

  const [existing] = await db
    .select()
    .from(productionTooling)
    .where(
      and(
        eq(productionTooling.subdivisionId, product.subdivisionId),
        eq(productionTooling.pfNumber, product.pfNumber)
      )
    );

  const payload = {
    subdivisionId: product.subdivisionId,
    pfNumber: product.pfNumber,
    name: product.name,
    productId: product.id,
    toolingType: "press_form" as const,
    cycleTimeSec: product.cycleTimeSec,
    cavities: product.cavities,
    productWeightGr: product.productWeight,
    shotWeightGr: product.shotWeight,
    isActive: product.isActive,
  };

  if (existing) {
    return updateProductionTooling(existing.id, payload);
  }
  return createProductionTooling(payload);
}

export async function createProductFromTooling(
  toolingId: number,
  data: { sapCode: string; name?: string; defaultShiftNorm?: number }
) {
  const tooling = await getProductionTooling(toolingId);
  if (!tooling) throw new Error("Оснастка не найдена");
  if (tooling.productId) throw new Error("Изделие уже связано с этой оснасткой");

  const sapCode = data.sapCode.trim();
  if (!sapCode) throw new Error("Укажите SAP-код изделия");

  const [existingSap] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.subdivisionId, tooling.subdivisionId), eq(products.sapCode, sapCode))
    );
  if (existingSap) throw new Error(`SAP ${sapCode} уже используется в подразделении`);

  const defaultShiftNorm =
    data.defaultShiftNorm ??
    computeShiftNormFromCycle(tooling.cycleTimeSec, tooling.cavities) ??
    undefined;

  const product = await createProduct({
    subdivisionId: tooling.subdivisionId,
    sapCode,
    name: data.name?.trim() || tooling.name,
    pfNumber: tooling.pfNumber,
    cycleTimeSec: tooling.cycleTimeSec ?? undefined,
    cavities: tooling.cavities ?? undefined,
    productWeight: tooling.productWeightGr ?? undefined,
    shotWeight: tooling.shotWeightGr ?? undefined,
    defaultShiftNorm,
    isActive: true,
  });

  if (!product) throw new Error("Не удалось создать изделие");

  await updateProductionTooling(toolingId, { productId: product.id });
  return { product, tooling: await getProductionTooling(toolingId) };
}
