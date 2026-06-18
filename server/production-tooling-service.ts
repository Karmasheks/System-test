import { db } from "./db";
import {
  productionTooling,
  productionToolingProducts,
  productionToolingMaintenance,
  products,
} from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import type {
  InsertProductionTooling,
  InsertProductionToolingMaintenance,
} from "@shared/schema";
import { computeShiftNormFromCycle } from "@shared/production-norm-utils";
import {
  cyclesRemainingGuarantee,
  cyclesUntilMaintenance,
  isMaintenanceDue,
  resolveNextMaintenancePlannedAt,
  resolveToolingStatusForCycleCount,
} from "@shared/production-tooling-utils";
import { createProduct } from "./production-service";
import { recalculateToolingCycles } from "./production-tooling-cycle-service";
import {
  loadMaintenancePlanContext,
  predictMaintenanceDateForTooling,
  syncToolingMaintenancePlannedDate,
  type MaintenancePlanContext,
  linkedProductIdsForToolingRow,
} from "./production-tooling-maintenance-plan";

export type ToolingProductLink = {
  id: number;
  sapCode: string;
  name: string;
};

export type ProductionToolingView = typeof productionTooling.$inferSelect & {
  products: ToolingProductLink[];
  cyclesUntilMaintenance: number | null;
  cyclesRemainingGuarantee: number | null;
  maintenanceDue: boolean;
};

export type ProductionToolingDetail = ProductionToolingView & {
  maintenanceHistory: (typeof productionToolingMaintenance.$inferSelect)[];
};

async function loadProductLinks(toolings: (typeof productionTooling.$inferSelect)[]) {
  const toolingIds = toolings.map((t) => t.id);
  const junction =
    toolingIds.length > 0
      ? await db
          .select()
          .from(productionToolingProducts)
          .where(inArray(productionToolingProducts.toolingId, toolingIds))
      : [];

  const productIds = new Set<number>();
  for (const t of toolings) {
    if (t.productId) productIds.add(t.productId);
  }
  for (const j of junction) productIds.add(j.productId);

  const productRows =
    productIds.size > 0
      ? await db
          .select()
          .from(products)
          .where(inArray(products.id, [...productIds]))
      : [];
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const junctionByTooling = new Map<number, number[]>();
  for (const j of junction) {
    const list = junctionByTooling.get(j.toolingId) ?? [];
    list.push(j.productId);
    junctionByTooling.set(j.toolingId, list);
  }

  return { productById, junctionByTooling };
}

function enrichTooling(
  row: typeof productionTooling.$inferSelect,
  productById: Map<number, typeof products.$inferSelect>,
  junctionByTooling: Map<number, number[]>,
  planCtx?: MaintenancePlanContext
): ProductionToolingView {
  const ids = new Set<number>();
  if (row.productId) ids.add(row.productId);
  for (const pid of junctionByTooling.get(row.id) ?? []) ids.add(pid);

  const linkedProducts: ToolingProductLink[] = [...ids]
    .map((id) => productById.get(id))
    .filter((p): p is typeof products.$inferSelect => p != null)
    .map((p) => ({ id: p.id, sapCode: p.sapCode, name: p.name }))
    .sort((a, b) => a.sapCode.localeCompare(b.sapCode, "ru"));

  const predictedMaintenanceAt = planCtx
    ? predictMaintenanceDateForTooling(row, ids, planCtx)
    : null;
  const maintenanceDue = isMaintenanceDue(
    row.maintenanceCycleInterval,
    row.cyclesSinceMaintenance
  );
  const nextMaintenancePlannedAt = resolveNextMaintenancePlannedAt(
    row.nextMaintenancePlannedAt,
    predictedMaintenanceAt,
    maintenanceDue
  );

  return {
    ...row,
    nextMaintenancePlannedAt,
    products: linkedProducts,
    cyclesUntilMaintenance: cyclesUntilMaintenance(
      row.maintenanceCycleInterval,
      row.cyclesSinceMaintenance
    ),
    cyclesRemainingGuarantee: cyclesRemainingGuarantee(
      row.cyclesUntilGuarantee,
      row.cycleCounterTotal
    ),
    maintenanceDue,
  };
}

export async function listProductionTooling(filters: {
  subdivisionId: number;
  activeOnly?: boolean;
  search?: string;
}): Promise<ProductionToolingView[]> {
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

  const { productById, junctionByTooling } = await loadProductLinks(result);
  const planCtx = await loadMaintenancePlanContext(filters.subdivisionId);
  return result.map((row) => enrichTooling(row, productById, junctionByTooling, planCtx));
}

export async function getProductionTooling(id: number) {
  const [row] = await db.select().from(productionTooling).where(eq(productionTooling.id, id));
  return row ?? null;
}

export async function getProductionToolingView(id: number): Promise<ProductionToolingView | null> {
  const row = await getProductionTooling(id);
  if (!row) return null;
  const { productById, junctionByTooling } = await loadProductLinks([row]);
  const planCtx = await loadMaintenancePlanContext(row.subdivisionId);
  return enrichTooling(row, productById, junctionByTooling, planCtx);
}

export async function getProductionToolingDetail(id: number): Promise<ProductionToolingDetail | null> {
  const row = await getProductionTooling(id);
  if (!row) return null;

  const { productById, junctionByTooling } = await loadProductLinks([row]);
  const planCtx = await loadMaintenancePlanContext(row.subdivisionId);
  const maintenanceHistory = await db
    .select()
    .from(productionToolingMaintenance)
    .where(eq(productionToolingMaintenance.toolingId, id))
    .orderBy(productionToolingMaintenance.performedAt);

  return {
    ...enrichTooling(row, productById, junctionByTooling, planCtx),
    maintenanceHistory: maintenanceHistory.reverse(),
  };
}

export async function setToolingProductLinks(toolingId: number, productIds: number[]) {
  await db
    .delete(productionToolingProducts)
    .where(eq(productionToolingProducts.toolingId, toolingId));

  const unique = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return;

  await db.insert(productionToolingProducts).values(
    unique.map((productId) => ({
      toolingId,
      productId,
    }))
  );

  const primary = unique[0];
  await db
    .update(productionTooling)
    .set({ productId: primary, updatedAt: new Date() })
    .where(eq(productionTooling.id, toolingId));

  const fresh = await getProductionTooling(toolingId);
  if (fresh) {
    const ids = await linkedProductIdsForToolingRow(fresh);
    await syncToolingMaintenancePlannedDate(fresh, ids);
  }
}

function parseOptionalTimestamp(value: string | Date | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createProductionTooling(
  data: InsertProductionTooling & { productIds?: number[]; skipCycleRecalc?: boolean }
) {
  const {
    productIds,
    lastMaintenanceAt,
    infoUpdatedAt,
    nextMaintenancePlannedAt,
    skipCycleRecalc,
    ...rest
  } = data;
  const now = new Date();
  const [row] = await db
    .insert(productionTooling)
    .values({
      ...rest,
      applicableEquipmentIds: rest.applicableEquipmentIds ?? [],
      cycleCounterTotal: rest.cycleCounterTotal ?? 0,
      cycleCounterRegistryBase:
        rest.cycleCounterRegistryBase ?? rest.cycleCounterTotal ?? 0,
      cyclesSinceMaintenance: rest.cyclesSinceMaintenance ?? 0,
      lastMaintenanceAt: parseOptionalTimestamp(lastMaintenanceAt) ?? undefined,
      infoUpdatedAt: parseOptionalTimestamp(infoUpdatedAt) ?? now,
      nextMaintenancePlannedAt: parseOptionalTimestamp(nextMaintenancePlannedAt) ?? undefined,
      updatedAt: now,
    })
    .returning();

  if (productIds?.length) {
    await setToolingProductLinks(row.id, productIds);
  } else if (rest.productId) {
    await setToolingProductLinks(row.id, [rest.productId]);
  }

  if (!skipCycleRecalc) {
    await recalculateToolingCycles(row.id);
  } else {
    const fresh = await getProductionTooling(row.id);
    if (fresh) {
      const ids = await linkedProductIdsForToolingRow(fresh);
      await syncToolingMaintenancePlannedDate(fresh, ids);
    }
  }
  return (await getProductionToolingView(row.id))!;
}

export async function getProductionToolingByPfNumber(
  subdivisionId: number,
  pfNumber: string
) {
  const [row] = await db
    .select()
    .from(productionTooling)
    .where(
      and(
        eq(productionTooling.subdivisionId, subdivisionId),
        eq(productionTooling.pfNumber, pfNumber)
      )
    );
  return row ?? null;
}

export async function patchToolingCycleCounters(
  id: number,
  data: {
    cycleCounterTotal?: number;
    cyclesSinceMaintenance?: number;
    status?: typeof productionTooling.$inferSelect.status;
  }
) {
  await db
    .update(productionTooling)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(productionTooling.id, id));
}

export async function updateProductionTooling(
  id: number,
  data: Partial<InsertProductionTooling> & {
    productIds?: number[];
    skipCycleRecalc?: boolean;
  }
) {
  const {
    productIds,
    lastMaintenanceAt,
    infoUpdatedAt,
    nextMaintenancePlannedAt,
    skipCycleRecalc,
    ...rest
  } = data;
  const linkOnlyUpdate =
    productIds !== undefined &&
    Object.keys(rest).length === 0 &&
    lastMaintenanceAt === undefined &&
    infoUpdatedAt === undefined &&
    nextMaintenancePlannedAt === undefined;
  const now = new Date();
  const updatePayload: Partial<typeof productionTooling.$inferInsert> = {
    ...rest,
    updatedAt: now,
  };
  if (!linkOnlyUpdate) {
    updatePayload.infoUpdatedAt =
      infoUpdatedAt !== undefined
        ? parseOptionalTimestamp(infoUpdatedAt) ?? null
        : now;
  } else if (infoUpdatedAt !== undefined) {
    updatePayload.infoUpdatedAt = parseOptionalTimestamp(infoUpdatedAt) ?? null;
  }
  if (lastMaintenanceAt !== undefined) {
    updatePayload.lastMaintenanceAt = parseOptionalTimestamp(lastMaintenanceAt) ?? null;
  }
  if (nextMaintenancePlannedAt !== undefined) {
    updatePayload.nextMaintenancePlannedAt =
      parseOptionalTimestamp(nextMaintenancePlannedAt) ?? null;
  }
  if (rest.cycleCounterTotal !== undefined) {
    updatePayload.cycleCounterRegistryBase = rest.cycleCounterTotal;
  }
  const [row] = await db
    .update(productionTooling)
    .set(updatePayload)
    .where(eq(productionTooling.id, id))
    .returning();

  if (!row) return null;

  if (productIds) {
    await setToolingProductLinks(id, productIds);
  }

  const hasManualCounters =
    rest.cycleCounterTotal !== undefined ||
    rest.cyclesSinceMaintenance !== undefined ||
    rest.cyclesAtLastMaintenance !== undefined ||
    lastMaintenanceAt !== undefined;

  if (!skipCycleRecalc && !hasManualCounters && !linkOnlyUpdate) {
    await recalculateToolingCycles(id);
  } else {
    const fresh = await getProductionTooling(id);
    if (fresh) {
      const ids = await linkedProductIdsForToolingRow(fresh);
      const interval = rest.maintenanceCycleInterval ?? fresh.maintenanceCycleInterval;
      const since = rest.cyclesSinceMaintenance ?? fresh.cyclesSinceMaintenance;
      const status = resolveToolingStatusForCycleCount(fresh.status, interval, since);
      if (status !== fresh.status) {
        await patchToolingCycleCounters(id, { status });
      }
      const forSync = await getProductionTooling(id);
      if (forSync) {
        await syncToolingMaintenancePlannedDate(forSync, ids);
      }
    }
  }
  return (await getProductionToolingView(id))!;
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

  if (existing) {
    const junction = await db
      .select({ productId: productionToolingProducts.productId })
      .from(productionToolingProducts)
      .where(eq(productionToolingProducts.toolingId, existing.id));
    const ids = junction.map((j) => j.productId);
    if (!ids.includes(product.id)) ids.push(product.id);
    await setToolingProductLinks(existing.id, ids);
    return getProductionToolingDetail(existing.id);
  }

  const created = await createProductionTooling({
    subdivisionId: product.subdivisionId,
    pfNumber: product.pfNumber,
    name: product.pfNumber,
    productIds: [product.id],
    productId: product.id,
    toolingType: "press_form",
    cycleTimeSec: product.cycleTimeSec ?? undefined,
    cavities: product.cavities ?? undefined,
    productWeightGr: product.productWeight ?? undefined,
    shotWeightGr: product.shotWeight ?? undefined,
    isActive: product.isActive,
  });
  return created;
}

export async function createProductFromTooling(
  toolingId: number,
  data: { sapCode: string; name?: string; defaultShiftNorm?: number }
) {
  const tooling = await getProductionTooling(toolingId);
  if (!tooling) throw new Error("Оснастка/ПФ не найдена");

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

  const junction = await db
    .select({ productId: productionToolingProducts.productId })
    .from(productionToolingProducts)
    .where(eq(productionToolingProducts.toolingId, toolingId));
  const ids = junction.map((j) => j.productId);
  if (tooling.productId) ids.push(tooling.productId);
  ids.push(product.id);
  await setToolingProductLinks(toolingId, ids);

  return { product, tooling: await getProductionToolingDetail(toolingId) };
}

export async function recordToolingMaintenance(
  toolingId: number,
  data: Omit<InsertProductionToolingMaintenance, "toolingId"> & {
    cyclesAtMaintenance?: number;
  },
  user: { id: number; name: string }
) {
  const tooling = await getProductionTooling(toolingId);
  if (!tooling) throw new Error("Оснастка/ПФ не найдена");

  let cyclesAt = data.cyclesAtMaintenance;
  if (cyclesAt == null) {
    await recalculateToolingCycles(toolingId);
    const fresh = await getProductionTooling(toolingId);
    if (!fresh) throw new Error("Оснастка/ПФ не найдена");
    cyclesAt = fresh.cycleCounterTotal;
  }

  const performedAt = data.performedAt ?? new Date();
  const totalCycles = Math.max(tooling.cycleCounterTotal, cyclesAt);

  const [record] = await db
    .insert(productionToolingMaintenance)
    .values({
      toolingId,
      performedAt,
      cyclesAtMaintenance: cyclesAt,
      comment: data.comment ?? null,
      performedById: user.id,
      performedByName: user.name,
    })
    .returning();

  await db
    .update(productionTooling)
    .set({
      cycleCounterTotal: totalCycles,
      cycleCounterRegistryBase: totalCycles,
      cyclesAtLastMaintenance: cyclesAt,
      cyclesSinceMaintenance: 0,
      lastMaintenanceAt: performedAt,
      status: "maintenance_completed",
      infoUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(productionTooling.id, toolingId));

  const fresh = await getProductionTooling(toolingId);
  if (fresh) {
    const ids = await linkedProductIdsForToolingRow(fresh);
    await syncToolingMaintenancePlannedDate(fresh, ids);
  }

  return record;
}

export async function listToolingMaintenanceDue(subdivisionId: number) {
  const all = await listProductionTooling({ subdivisionId, activeOnly: true });
  return all.filter((t) => t.maintenanceDue || t.status === "maintenance_due");
}
