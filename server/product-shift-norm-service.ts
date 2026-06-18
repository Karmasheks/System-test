import { db } from "./db";
import { productShiftNorms, products } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import type { InsertProductShiftNorm } from "@shared/schema";
import { computeShiftNormFromCycle } from "@shared/production-norm-utils";
import type { ShiftSlot } from "@shared/shift-template-types";

export async function listProductShiftNorms(productId: number, subdivisionId: number) {
  return db
    .select()
    .from(productShiftNorms)
    .where(
      and(
        eq(productShiftNorms.productId, productId),
        eq(productShiftNorms.subdivisionId, subdivisionId)
      )
    );
}

export async function listSubdivisionShiftNorms(subdivisionId: number) {
  return db
    .select()
    .from(productShiftNorms)
    .where(eq(productShiftNorms.subdivisionId, subdivisionId));
}

export async function upsertProductShiftNorm(data: InsertProductShiftNorm) {
  const existing = await db
    .select()
    .from(productShiftNorms)
    .where(
      and(
        eq(productShiftNorms.productId, data.productId),
        eq(productShiftNorms.subdivisionId, data.subdivisionId),
        eq(productShiftNorms.shiftCode, data.shiftCode)
      )
    );

  if (existing[0]) {
    const [row] = await db
      .update(productShiftNorms)
      .set({ shiftNorm: data.shiftNorm, updatedAt: new Date() })
      .where(eq(productShiftNorms.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(productShiftNorms)
    .values({ ...data, updatedAt: new Date() })
    .returning();
  return row;
}

export async function bulkUpsertProductShiftNorms(
  subdivisionId: number,
  productId: number,
  norms: Array<{ shiftCode: string; shiftNorm: number }>
) {
  const results = [];
  for (const n of norms) {
    if (!n.shiftCode || n.shiftNorm <= 0) continue;
    results.push(
      await upsertProductShiftNorm({
        subdivisionId,
        productId,
        shiftCode: n.shiftCode,
        shiftNorm: n.shiftNorm,
      })
    );
  }
  return results;
}

export async function resolveNormsForProduct(
  productId: number,
  subdivisionId: number,
  slots: ShiftSlot[],
  tooling?: { cycleTimeSec?: number | null; cavities?: number | null } | null
): Promise<Record<string, number>> {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return {};

  const rows = await listProductShiftNorms(productId, subdivisionId);
  const byCode = new Map(rows.map((r) => [r.shiftCode, r.shiftNorm]));

  const result: Record<string, number> = {};
  for (const slot of slots) {
    const stored = byCode.get(slot.code);
    if (stored != null && stored > 0) {
      result[slot.code] = stored;
      continue;
    }
    const computed = computeShiftNormFromCycle(
      product.cycleTimeSec ?? tooling?.cycleTimeSec,
      product.cavities ?? tooling?.cavities,
      slot.hours
    );
    if (computed != null && computed > 0) {
      result[slot.code] = computed;
    } else if (product.defaultShiftNorm != null && product.defaultShiftNorm > 0) {
      result[slot.code] = product.defaultShiftNorm;
    }
  }
  return result;
}
