import { db } from "./db";
import {
  products,
  productSubdivisionAvailability,
  materials,
  materialSubdivisionAvailability,
  productBom,
  productEquipment,
  productionOrders,
  productionSchedule,
  productionFact,
  productionDowntimes,
  productionDailyPlan,
  productionPlanConflicts,
  maintenanceRecords,
  equipment,
  productionPlanningSettings,
  productionTooling,
  type InsertProduct,
  type InsertMaterial,
  type InsertProductBom,
  type InsertProductEquipment,
  type InsertProductionOrder,
  type InsertProductionSchedule,
  type InsertProductionFact,
  type InsertProductionDowntime,
  type ProductionOrderStatus,
} from "@shared/schema";
import { canAccessSubdivision, type SubdivisionScope } from "@shared/subdivision-scope";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  checkScheduleConflicts,
  summarizeConflictStatus,
  type ProductionConflictItem,
} from "./production-conflicts-service";
import {
  listMaterialSubdivisionIds,
  syncMaterialSubdivisionAvailability,
  calculateMaterialRequirements,
  processFactMaterialWriteoff,
  reserveMaterialsForQuantity,
  countMaterialShortages,
  listMaterialsWithLowStock,
} from "./production-materials-service";
import { getScheduleToirOverlay } from "./production-toir-integration-service";
import {
  mergeProductionDisplayConfig,
  type ProductionDisplayConfig,
} from "@shared/production-display-config";

const ACTIVE_SCHEDULE_STATUSES = ["planned", "in_progress", "paused"];

export async function listProductSubdivisionIds(productId: number): Promise<number[]> {
  const rows = await db
    .select()
    .from(productSubdivisionAvailability)
    .where(eq(productSubdivisionAvailability.productId, productId));
  return rows.map((r) => r.subdivisionId);
}

export async function syncProductSubdivisionAvailability(productId: number, subdivisionIds: number[]) {
  await db
    .delete(productSubdivisionAvailability)
    .where(eq(productSubdivisionAvailability.productId, productId));

  if (subdivisionIds.length === 0) return [];

  return db
    .insert(productSubdivisionAvailability)
    .values(subdivisionIds.map((subdivisionId) => ({ productId, subdivisionId })))
    .returning();
}

function productVisibleInScope(
  product: { id: number; subdivisionId: number; isSharedAcrossSubdivisions: boolean },
  scope: SubdivisionScope,
  availabilityMap: Map<number, number[]>
): boolean {
  if (scope.viewAll) return true;
  if (canAccessSubdivision(scope, product.subdivisionId)) return true;
  if (!product.isSharedAcrossSubdivisions) return false;
  const ids = availabilityMap.get(product.id) ?? [];
  return ids.some((sid) => canAccessSubdivision(scope, sid));
}

export async function listProducts(filters?: {
  subdivisionId?: number;
  search?: string;
  activeOnly?: boolean;
}) {
  const conditions = [];
  if (filters?.subdivisionId) {
    conditions.push(eq(products.subdivisionId, filters.subdivisionId));
  }
  if (filters?.activeOnly) {
    conditions.push(eq(products.isActive, true));
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(products.name, q),
        ilike(products.sapCode, q),
        ilike(products.pfNumber, q)
      )!
    );
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(products)
          .where(and(...conditions))
          .orderBy(desc(products.updatedAt))
      : await db.select().from(products).orderBy(desc(products.updatedAt));

  const productIds = rows.map((p) => p.id);
  const availability =
    productIds.length > 0
      ? await db
          .select()
          .from(productSubdivisionAvailability)
          .where(inArray(productSubdivisionAvailability.productId, productIds))
      : [];
  const map = new Map<number, number[]>();
  for (const row of availability) {
    const list = map.get(row.productId) ?? [];
    list.push(row.subdivisionId);
    map.set(row.productId, list);
  }

  return rows.map((p) => ({
    ...p,
    subdivisionIds: map.get(p.id) ?? [],
  }));
}

export function filterProductsByScope(
  items: Awaited<ReturnType<typeof listProducts>>,
  scope: SubdivisionScope
) {
  if (scope.viewAll) return items;
  const map = new Map(items.map((p) => [p.id, p.subdivisionIds]));
  return items.filter((p) =>
    productVisibleInScope(p, scope, map as Map<number, number[]>)
  );
}

export async function getProduct(id: number) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row) return null;
  const subdivisionIds = await listProductSubdivisionIds(id);
  return { ...row, subdivisionIds };
}

export async function createProduct(
  data: InsertProduct,
  subdivisionIds?: number[]
) {
  const [row] = await db
    .insert(products)
    .values({ ...data, updatedAt: new Date() })
    .returning();
  if (row.isSharedAcrossSubdivisions && subdivisionIds?.length) {
    await syncProductSubdivisionAvailability(row.id, subdivisionIds);
  }
  return getProduct(row.id);
}

export async function updateProduct(
  id: number,
  data: Partial<InsertProduct>,
  subdivisionIds?: number[]
) {
  const [row] = await db
    .update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  if (!row) return null;
  if (subdivisionIds !== undefined) {
    await syncProductSubdivisionAvailability(id, subdivisionIds);
  }
  return getProduct(id);
}

export async function archiveProduct(id: number) {
  const [row] = await db
    .update(products)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  return row ?? null;
}

export async function listMaterials(filters?: {
  subdivisionId?: number;
  search?: string;
  activeOnly?: boolean;
}) {
  const conditions = [];
  if (filters?.subdivisionId) {
    conditions.push(
      or(
        eq(materials.subdivisionId, filters.subdivisionId),
        isNull(materials.subdivisionId),
        eq(materials.isSharedAcrossSubdivisions, true)
      )!
    );
  }
  if (filters?.activeOnly) {
    conditions.push(eq(materials.isActive, true));
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(materials.name, q), ilike(materials.sapCode, q))!);
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(materials)
          .where(and(...conditions))
          .orderBy(desc(materials.updatedAt))
      : await db.select().from(materials).orderBy(desc(materials.updatedAt));

  const materialIds = rows.map((m) => m.id);
  const availability =
    materialIds.length > 0
      ? await db
          .select()
          .from(materialSubdivisionAvailability)
          .where(inArray(materialSubdivisionAvailability.materialId, materialIds))
      : [];
  const map = new Map<number, number[]>();
  for (const row of availability) {
    const list = map.get(row.materialId) ?? [];
    list.push(row.subdivisionId);
    map.set(row.materialId, list);
  }

  return rows.map((m) => ({
    ...m,
    subdivisionIds: map.get(m.id) ?? [],
  }));
}

export async function getMaterial(id: number) {
  const [row] = await db.select().from(materials).where(eq(materials.id, id));
  if (!row) return null;
  const subdivisionIds = await listMaterialSubdivisionIds(id);
  return { ...row, subdivisionIds };
}

export async function createMaterial(data: InsertMaterial, subdivisionIds?: number[]) {
  const [row] = await db
    .insert(materials)
    .values({ ...data, updatedAt: new Date() })
    .returning();
  if (row.isSharedAcrossSubdivisions && subdivisionIds?.length) {
    await syncMaterialSubdivisionAvailability(row.id, subdivisionIds);
  }
  return getMaterial(row.id);
}

export async function updateMaterial(
  id: number,
  data: Partial<InsertMaterial>,
  subdivisionIds?: number[]
) {
  const [row] = await db
    .update(materials)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(materials.id, id))
    .returning();
  if (!row) return null;
  if (subdivisionIds !== undefined) {
    await syncMaterialSubdivisionAvailability(id, subdivisionIds);
  }
  return getMaterial(id);
}

export async function archiveMaterial(id: number) {
  const [row] = await db
    .update(materials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(materials.id, id))
    .returning();
  return row ?? null;
}

export async function listBom(productId: number, subdivisionId: number) {
  return db
    .select({
      bom: productBom,
      material: materials,
    })
    .from(productBom)
    .innerJoin(materials, eq(productBom.materialId, materials.id))
    .where(and(eq(productBom.productId, productId), eq(productBom.subdivisionId, subdivisionId)));
}

export async function addBomLine(data: InsertProductBom) {
  const [row] = await db.insert(productBom).values(data).returning();
  return row;
}

export async function removeBomLine(id: number) {
  const [row] = await db.delete(productBom).where(eq(productBom.id, id)).returning();
  return row ?? null;
}

export async function listProductEquipment(productId: number, subdivisionId: number) {
  return db
    .select()
    .from(productEquipment)
    .where(
      and(
        eq(productEquipment.productId, productId),
        eq(productEquipment.subdivisionId, subdivisionId),
        eq(productEquipment.isActive, true)
      )
    )
    .orderBy(productEquipment.priority);
}

export async function upsertProductEquipment(data: InsertProductEquipment) {
  const [existing] = await db
    .select()
    .from(productEquipment)
    .where(
      and(
        eq(productEquipment.productId, data.productId),
        eq(productEquipment.equipmentId, data.equipmentId)
      )
    );

  if (existing) {
    const [row] = await db
      .update(productEquipment)
      .set({
        subdivisionId: data.subdivisionId,
        priority: data.priority ?? existing.priority,
        cycleTimeSecOverride: data.cycleTimeSecOverride ?? existing.cycleTimeSecOverride,
        shiftNormOverride: data.shiftNormOverride ?? existing.shiftNormOverride,
        setupTimeMin: data.setupTimeMin ?? existing.setupTimeMin,
        note: data.note ?? existing.note,
        isActive: data.isActive ?? existing.isActive,
      })
      .where(eq(productEquipment.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db.insert(productEquipment).values(data).returning();
  return row;
}

export async function removeProductEquipment(id: number) {
  const [row] = await db
    .update(productEquipment)
    .set({ isActive: false })
    .where(eq(productEquipment.id, id))
    .returning();
  return row ?? null;
}

export async function generateOrderNumber(subdivisionId: number): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${subdivisionId}-${year}-`;
  const existing = await db
    .select({ orderNumber: productionOrders.orderNumber })
    .from(productionOrders)
    .where(eq(productionOrders.subdivisionId, subdivisionId));

  let maxSeq = 0;
  for (const o of existing) {
    if (o.orderNumber.startsWith(prefix)) {
      const seq = parseInt(o.orderNumber.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export async function listProductionOrders(filters?: {
  subdivisionId?: number;
  productId?: number;
  status?: string;
  priority?: string;
}) {
  const conditions = [];
  if (filters?.subdivisionId) {
    conditions.push(eq(productionOrders.subdivisionId, filters.subdivisionId));
  }
  if (filters?.productId) {
    conditions.push(eq(productionOrders.productId, filters.productId));
  }
  if (filters?.status) {
    conditions.push(eq(productionOrders.status, filters.status));
  }
  if (filters?.priority) {
    conditions.push(eq(productionOrders.priority, filters.priority));
  }

  return conditions.length > 0
    ? await db
        .select()
        .from(productionOrders)
        .where(and(...conditions))
        .orderBy(desc(productionOrders.updatedAt))
    : await db.select().from(productionOrders).orderBy(desc(productionOrders.updatedAt));
}

export async function getProductionOrder(id: number) {
  const [row] = await db.select().from(productionOrders).where(eq(productionOrders.id, id));
  return row ?? null;
}

export async function createProductionOrder(
  data: InsertProductionOrder,
  user: { id: number; name: string }
) {
  let orderNumber = data.orderNumber;
  let orderNumberIsManual = data.orderNumberIsManual ?? false;

  if (!orderNumber?.trim()) {
    orderNumber = await generateOrderNumber(data.subdivisionId);
    orderNumberIsManual = false;
  }

  const [row] = await db
    .insert(productionOrders)
    .values({
      ...data,
      orderNumber,
      orderNumberIsManual,
      createdById: user.id,
      createdByName: user.name,
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function updateProductionOrder(id: number, data: Partial<InsertProductionOrder>) {
  const [row] = await db
    .update(productionOrders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(productionOrders.id, id))
    .returning();
  return row ?? null;
}

export async function updateOrderStatus(id: number, status: ProductionOrderStatus) {
  const [row] = await db
    .update(productionOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(productionOrders.id, id))
    .returning();
  return row ?? null;
}

export async function deleteProductionOrder(id: number) {
  const order = await getProductionOrder(id);
  if (!order) return null;

  const [factRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(productionFact)
    .where(eq(productionFact.orderId, id));
  if ((factRow?.count ?? 0) > 0 || order.completedQuantity > 0) {
    throw new Error(
      "Нельзя удалить заказ с фактом выпуска. Установите статус «Отменён»."
    );
  }

  await db.delete(productionDailyPlan).where(eq(productionDailyPlan.orderId, id));
  await db.delete(productionSchedule).where(eq(productionSchedule.orderId, id));
  await db.delete(productionPlanConflicts).where(eq(productionPlanConflicts.orderId, id));
  const [deleted] = await db
    .delete(productionOrders)
    .where(eq(productionOrders.id, id))
    .returning();
  return deleted ?? null;
}

export async function getOrderRemainingQuantity(orderId: number) {
  const order = await getProductionOrder(orderId);
  if (!order) return null;

  const target = order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity;
  const remaining = Math.max(0, target - order.completedQuantity);
  return {
    orderId,
    requestedQuantity: order.requestedQuantity,
    plannedQuantity: order.plannedQuantity,
    completedQuantity: order.completedQuantity,
    defectiveQuantity: order.defectiveQuantity,
    targetQuantity: target,
    remainingQuantity: remaining,
    percentComplete: target > 0 ? Math.round((order.completedQuantity / target) * 100) : 0,
  };
}

export async function recalculateOrderCompletedQuantity(orderId: number) {
  const facts = await db
    .select({
      produced: sql<number>`coalesce(sum(${productionFact.producedQuantity}), 0)`.mapWith(Number),
      defective: sql<number>`coalesce(sum(${productionFact.defectiveQuantity}), 0)`.mapWith(Number),
    })
    .from(productionFact)
    .where(eq(productionFact.orderId, orderId));

  const produced = facts[0]?.produced ?? 0;
  const defective = facts[0]?.defective ?? 0;

  const [row] = await db
    .update(productionOrders)
    .set({
      completedQuantity: produced,
      defectiveQuantity: defective,
      updatedAt: new Date(),
    })
    .where(eq(productionOrders.id, orderId))
    .returning();

  return row ?? null;
}

export async function listSchedule(filters: {
  subdivisionId?: number;
  equipmentId?: string;
  orderId?: number;
  from?: Date;
  to?: Date;
}) {
  const conditions = [];
  if (filters.subdivisionId) conditions.push(eq(productionSchedule.subdivisionId, filters.subdivisionId));
  if (filters.equipmentId) conditions.push(eq(productionSchedule.equipmentId, filters.equipmentId));
  if (filters.orderId) conditions.push(eq(productionSchedule.orderId, filters.orderId));
  if (filters.from) conditions.push(gte(productionSchedule.startTime, filters.from));
  if (filters.to) conditions.push(lte(productionSchedule.endTime, filters.to));

  if (conditions.length === 0) {
    return db.select().from(productionSchedule).orderBy(productionSchedule.startTime);
  }

  return db
    .select()
    .from(productionSchedule)
    .where(and(...conditions))
    .orderBy(productionSchedule.startTime);
}

export async function getScheduleSlot(id: number) {
  const [row] = await db.select().from(productionSchedule).where(eq(productionSchedule.id, id));
  return row ?? null;
}

async function persistScheduleConflicts(
  subdivisionId: number,
  scheduleId: number | null,
  orderId: number,
  equipmentId: string,
  conflicts: ProductionConflictItem[]
) {
  if (scheduleId) {
    await db
      .delete(productionPlanConflicts)
      .where(eq(productionPlanConflicts.scheduleId, scheduleId));
  }

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

export async function assignScheduleSlot(
  data: InsertProductionSchedule,
  user: { id: number; name: string },
  options?: { skipConflictCheck?: boolean }
) {
  const order = await getProductionOrder(data.orderId);
  if (!order) throw new Error("Заказ не найден");

  const subdivisionId = data.subdivisionId ?? order.subdivisionId;
  let conflicts: ProductionConflictItem[] = [];

  if (!options?.skipConflictCheck) {
    conflicts = await checkScheduleConflicts({
      subdivisionId,
      orderId: data.orderId,
      equipmentId: data.equipmentId,
      startTime: data.startTime,
      endTime: data.endTime,
      plannedQuantity: data.plannedQuantity ?? 0,
      productId: order.productId,
    });
  }

  const conflictStatus = summarizeConflictStatus(conflicts);
  if (conflictStatus === "blocked") {
    const err = new Error("Планирование заблокировано конфликтами");
    (err as Error & { conflicts: ProductionConflictItem[] }).conflicts = conflicts;
    throw err;
  }

  const [row] = await db
    .insert(productionSchedule)
    .values({
      ...data,
      subdivisionId,
      conflictStatus,
      assignedById: user.id,
      assignedByName: user.name,
      updatedAt: new Date(),
    })
    .returning();

  await persistScheduleConflicts(subdivisionId, row.id, data.orderId, data.equipmentId, conflicts);

  if (order.status === "draft" || order.status === "ready") {
    await updateOrderStatus(data.orderId, "planned");
  }

  return { slot: row, conflicts };
}

export async function updateScheduleSlot(
  id: number,
  data: Partial<InsertProductionSchedule>,
  user: { id: number; name: string },
  options?: { skipConflictCheck?: boolean }
) {
  const existing = await getScheduleSlot(id);
  if (!existing) return null;

  const merged = {
    subdivisionId: data.subdivisionId ?? existing.subdivisionId,
    orderId: data.orderId ?? existing.orderId,
    equipmentId: data.equipmentId ?? existing.equipmentId,
    startTime: data.startTime ?? existing.startTime,
    endTime: data.endTime ?? existing.endTime,
    plannedQuantity: data.plannedQuantity ?? existing.plannedQuantity,
  };

  const order = await getProductionOrder(merged.orderId);
  let conflicts: ProductionConflictItem[] = [];

  if (!options?.skipConflictCheck) {
    conflicts = await checkScheduleConflicts({
      subdivisionId: merged.subdivisionId,
      orderId: merged.orderId,
      equipmentId: merged.equipmentId,
      startTime: merged.startTime,
      endTime: merged.endTime,
      plannedQuantity: merged.plannedQuantity,
      scheduleId: id,
      productId: order?.productId,
    });
  }

  const conflictStatus = summarizeConflictStatus(conflicts);
  if (conflictStatus === "blocked") {
    const err = new Error("Изменение заблокировано конфликтами");
    (err as Error & { conflicts: ProductionConflictItem[] }).conflicts = conflicts;
    throw err;
  }

  const [row] = await db
    .update(productionSchedule)
    .set({
      ...data,
      conflictStatus,
      assignedById: user.id,
      assignedByName: user.name,
      updatedAt: new Date(),
    })
    .where(eq(productionSchedule.id, id))
    .returning();

  if (!row) return null;

  await persistScheduleConflicts(
    merged.subdivisionId,
    id,
    merged.orderId,
    merged.equipmentId,
    conflicts
  );

  return { slot: row, conflicts };
}

export async function cancelScheduleSlot(id: number) {
  const [row] = await db
    .update(productionSchedule)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(productionSchedule.id, id))
    .returning();
  return row ?? null;
}

export async function listFacts(filters?: {
  subdivisionId?: number;
  orderId?: number;
  equipmentId?: string;
  from?: Date;
  to?: Date;
}) {
  const conditions = [];
  if (filters?.subdivisionId) conditions.push(eq(productionFact.subdivisionId, filters.subdivisionId));
  if (filters?.orderId) conditions.push(eq(productionFact.orderId, filters.orderId));
  if (filters?.equipmentId) conditions.push(eq(productionFact.equipmentId, filters.equipmentId));

  if (filters?.from) {
    conditions.push(gte(productionFact.reportDate, filters.from.toISOString().slice(0, 10)));
  }
  if (filters?.to) {
    conditions.push(lte(productionFact.reportDate, filters.to.toISOString().slice(0, 10)));
  }

  return conditions.length === 0
    ? await db.select().from(productionFact).orderBy(desc(productionFact.reportDate))
    : await db
        .select()
        .from(productionFact)
        .where(and(...conditions))
        .orderBy(desc(productionFact.reportDate));
}

export async function createProductionFact(
  data: InsertProductionFact,
  user: { id: number; name: string },
  options?: { reserveMaterials?: boolean }
) {
  const factType = data.scheduleId ? "scheduled" : "ad_hoc";

  const [row] = await db
    .insert(productionFact)
    .values({
      ...data,
      factType: data.factType ?? factType,
      reportedById: user.id,
      reportedByName: user.name,
      updatedAt: new Date(),
    })
    .returning();

  if (data.scheduleId) {
    await db
      .update(productionSchedule)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(productionSchedule.id, data.scheduleId));
  }

  await recalculateOrderCompletedQuantity(row.orderId);

  const writeoff = await processFactMaterialWriteoff(row.id, row.subdivisionId, user);

  if (options?.reserveMaterials && row.producedQuantity > 0) {
    const order = await getProductionOrder(row.orderId);
    if (order) {
      await reserveMaterialsForQuantity(
        order.productId,
        row.subdivisionId,
        row.producedQuantity,
        row.orderId,
        user
      );
    }
  }

  try {
    const order = await getProductionOrder(row.orderId);
    const { recalculateToolingCyclesForProduct } = await import(
      "./production-tooling-cycle-service"
    );
    if (order) {
      await recalculateToolingCyclesForProduct(order.productId);
    } else {
      const { recalculateToolingCyclesForSubdivision } = await import(
        "./production-tooling-cycle-service"
      );
      await recalculateToolingCyclesForSubdivision(row.subdivisionId);
    }
  } catch (err) {
    console.error("tooling cycle sync after fact:", err);
  }

  if ((data.downtimeMinutes ?? 0) > 0 || data.downtimeReason) {
    await db.insert(productionDowntimes).values({
      subdivisionId: row.subdivisionId,
      factId: row.id,
      scheduleId: row.scheduleId,
      equipmentId: row.equipmentId,
      reasonType: "other",
      reasonText: data.downtimeReason,
      durationMinutes: data.downtimeMinutes ?? 0,
    });
  }

  return { fact: row, materialWriteoff: writeoff };
}

export async function addProductionDowntime(data: InsertProductionDowntime) {
  const [row] = await db.insert(productionDowntimes).values(data).returning();
  return row;
}

export async function countCatalogItems(subdivisionId: number) {
  const [productRows, toolingRows] = await Promise.all([
    listProducts({ subdivisionId }),
    db
      .select({ id: productionTooling.id })
      .from(productionTooling)
      .where(eq(productionTooling.subdivisionId, subdivisionId)),
  ]);

  return {
    productsTotal: productRows.length,
    toolingTotal: toolingRows.length,
  };
}

export async function getProductionKpiSummary(filters: {
  subdivisionId: number;
  from?: Date;
  to?: Date;
}) {
  const { subdivisionId, from, to } = filters;
  const periodFrom =
    from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodTo =
    to ??
    new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

  const [
    orders,
    schedule,
    facts,
    conflicts,
    materialShortageCount,
    catalogCounts,
  ] = await Promise.all([
    listProductionOrders({ subdivisionId }),
    listSchedule({ subdivisionId, from: periodFrom, to: periodTo }),
    listFacts({ subdivisionId, from: periodFrom, to: periodTo }),
    listPlanConflicts(subdivisionId, true),
    countMaterialShortages(subdivisionId),
    countCatalogItems(subdivisionId),
  ]);

  const planFact = orders.map((order) => {
    const orderFacts = facts.filter((f) => f.orderId === order.id);
    const factQty = orderFacts.reduce((s, f) => s + f.producedQuantity, 0);
    const target = order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity;
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: order.productId,
      planned: target,
      fact: factQty,
      defective: orderFacts.reduce((s, f) => s + f.defectiveQuantity, 0),
      variance: factQty - target,
    };
  });

  const equipmentIds = [...new Set(schedule.map((s) => s.equipmentId))];
  const equipmentLoad = equipmentIds.map((eqId) => {
    const slots = schedule.filter(
      (s) => s.equipmentId === eqId && ACTIVE_SCHEDULE_STATUSES.includes(s.status)
    );
    const totalMinutes = slots.reduce((sum, s) => {
      return sum + (s.endTime.getTime() - s.startTime.getTime()) / 60000;
    }, 0);
    return { equipmentId: eqId, slotCount: slots.length, plannedMinutes: totalMinutes };
  });

  const atRiskOrders = orders.filter((o) => {
    if (!o.desiredEndDate) return false;
    const end = new Date(o.desiredEndDate);
    const target = o.plannedQuantity > 0 ? o.plannedQuantity : o.requestedQuantity;
    if (o.completedQuantity >= target) return false;
    return end < new Date();
  });

  const maintenanceConflicts = conflicts.filter(
    (c) => c.conflictType === "maintenance_overlap" || c.conflictType === "repair_overlap"
  ).length;

  return {
    planFact,
    equipmentLoad,
    atRiskOrders,
    materialShortageCount,
    conflictCounts: {
      plan: conflicts.length,
      maintenance: maintenanceConflicts,
    },
    summary: {
      ordersTotal: orders.length,
      ordersInProgress: orders.filter((o) => o.status === "in_progress").length,
      productsTotal: catalogCounts.productsTotal,
      toolingTotal: catalogCounts.toolingTotal,
      scheduleSlots: schedule.length,
      factsRecorded: facts.length,
      totalProduced: facts.reduce((s, f) => s + f.producedQuantity, 0),
      totalDefective: facts.reduce((s, f) => s + f.defectiveQuantity, 0),
    },
  };
}

export async function getProductionAnalytics(filters: {
  subdivisionId: number;
  from?: Date;
  to?: Date;
}) {
  const { subdivisionId, from, to } = filters;
  const orders = await listProductionOrders({ subdivisionId });
  const schedule = await listSchedule({
    subdivisionId,
    from,
    to,
  });
  const facts = await listFacts({ subdivisionId, from, to });

  const planFact = orders.map((order) => {
    const orderFacts = facts.filter((f) => f.orderId === order.id);
    const factQty = orderFacts.reduce((s, f) => s + f.producedQuantity, 0);
    const target = order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity;
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: order.productId,
      planned: target,
      fact: factQty,
      defective: orderFacts.reduce((s, f) => s + f.defectiveQuantity, 0),
      variance: factQty - target,
    };
  });

  const equipmentIds = [...new Set(schedule.map((s) => s.equipmentId))];
  const equipmentLoad = equipmentIds.map((eqId) => {
    const slots = schedule.filter(
      (s) => s.equipmentId === eqId && ACTIVE_SCHEDULE_STATUSES.includes(s.status)
    );
    const totalMinutes = slots.reduce((sum, s) => {
      return sum + (s.endTime.getTime() - s.startTime.getTime()) / 60000;
    }, 0);
    return { equipmentId: eqId, slotCount: slots.length, plannedMinutes: totalMinutes };
  });

  const atRiskOrders = orders.filter((o) => {
    if (!o.desiredEndDate) return false;
    const end = new Date(o.desiredEndDate);
    const target = o.plannedQuantity > 0 ? o.plannedQuantity : o.requestedQuantity;
    if (o.completedQuantity >= target) return false;
    return end < new Date();
  });

  const materialShortages = await listMaterialsWithLowStock(subdivisionId);

  const downtimes = await db
    .select()
    .from(productionDowntimes)
    .where(eq(productionDowntimes.subdivisionId, subdivisionId));

  const maintenanceImpact = await db
    .select()
    .from(maintenanceRecords)
    .where(
      and(
        inArray(maintenanceRecords.status, ["scheduled", "in_progress", "overdue"]),
        gte(maintenanceRecords.scheduledDate, from ?? new Date(0)),
        lte(maintenanceRecords.scheduledDate, to ?? new Date("2099-12-31"))
      )
    );

  const subdivisionEquipment = await db
    .select()
    .from(equipment)
    .where(eq(equipment.subdivisionId, subdivisionId));

  const maintenanceByEquipment = maintenanceImpact.filter((m) =>
    subdivisionEquipment.some((e) => e.id === m.equipmentId)
  );

  const periodFrom =
    from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodTo =
    to ??
    new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

  const settings = await getProductionPlanningSettings(subdivisionId);
  const timeline = settings.displayConfig.timeline;

  const toirOverlay = await getScheduleToirOverlay(
    {
      subdivisionId,
      from: periodFrom,
      to: periodTo,
    },
    {
      showMaintenance: timeline.showMaintenanceOverlay,
      showRepair: timeline.showRepairOverlay,
      maintenanceDefaultHours: timeline.maintenanceDefaultHours,
      repairDefaultHours: timeline.repairDefaultHours,
    }
  );

  const overlayMinutes = (kind: "maintenance" | "repair") =>
    toirOverlay
      .filter((b) => b.kind === kind)
      .reduce(
        (sum, b) =>
          sum +
          (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 60000,
        0
      );

  const activeSchedule = schedule.filter((s) => ACTIVE_SCHEDULE_STATUSES.includes(s.status));
  const slotsWithToirConflict = activeSchedule.filter(
    (s) => s.conflictStatus === "blocked" || s.conflictStatus === "warning"
  ).length;
  const ordersAffectedByToir = new Set(
    activeSchedule
      .filter((s) => s.conflictStatus !== "none")
      .map((s) => s.orderId)
  ).size;

  const filteredDowntimes = downtimes.filter((d) => {
    if (!from && !to) return true;
    const created = d.createdAt;
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });

  const toirDowntimeMinutes = filteredDowntimes
    .filter((d) => d.reasonType === "maintenance" || d.reasonType === "repair")
    .reduce((sum, d) => sum + d.durationMinutes, 0);

  const plannedProductionMinutes = activeSchedule.reduce(
    (sum, s) => sum + (s.endTime.getTime() - s.startTime.getTime()) / 60000,
    0
  );

  const catalogCounts = await countCatalogItems(subdivisionId);

  return {
    planFact,
    equipmentLoad,
    atRiskOrders,
    materialShortages,
    downtimes: filteredDowntimes,
    maintenanceImpact: maintenanceByEquipment,
    toirOverlay,
    toirSummary: {
      maintenanceOverlayMinutes: Math.round(overlayMinutes("maintenance")),
      repairOverlayMinutes: Math.round(overlayMinutes("repair")),
      downtimeMinutesToir: toirDowntimeMinutes,
      slotsWithConflict: slotsWithToirConflict,
      ordersAffected: ordersAffectedByToir,
      plannedProductionMinutes: Math.round(plannedProductionMinutes),
      availabilityPercent:
        plannedProductionMinutes > 0
          ? Math.round(
              (100 *
                Math.max(
                  0,
                  plannedProductionMinutes -
                    overlayMinutes("maintenance") -
                    overlayMinutes("repair")
                )) /
                plannedProductionMinutes
            )
          : null,
    },
    summary: {
      ordersTotal: orders.length,
      ordersInProgress: orders.filter((o) => o.status === "in_progress").length,
      productsTotal: catalogCounts.productsTotal,
      toolingTotal: catalogCounts.toolingTotal,
      scheduleSlots: schedule.length,
      factsRecorded: facts.length,
      totalProduced: facts.reduce((s, f) => s + f.producedQuantity, 0),
      totalDefective: facts.reduce((s, f) => s + f.defectiveQuantity, 0),
    },
  };
}

export async function calculateOrderMaterialRequirements(orderId: number) {
  const order = await getProductionOrder(orderId);
  if (!order) return null;
  const quantity =
    order.plannedQuantity > 0
      ? order.plannedQuantity - order.completedQuantity
      : order.requestedQuantity - order.completedQuantity;
  const requirements = await calculateMaterialRequirements(
    order.productId,
    order.subdivisionId,
    Math.max(0, quantity)
  );
  return { orderId, quantity: Math.max(0, quantity), requirements };
}

export async function listPlanConflicts(subdivisionId: number, onlyUnresolved = true) {
  const conditions = [eq(productionPlanConflicts.subdivisionId, subdivisionId)];
  if (onlyUnresolved) {
    conditions.push(eq(productionPlanConflicts.isResolved, false));
  }

  return db
    .select()
    .from(productionPlanConflicts)
    .where(and(...conditions))
    .orderBy(desc(productionPlanConflicts.createdAt));
}

export async function resolvePlanConflict(id: number) {
  const [row] = await db
    .update(productionPlanConflicts)
    .set({ isResolved: true, resolvedAt: new Date() })
    .where(eq(productionPlanConflicts.id, id))
    .returning();
  return row ?? null;
}

export async function getProductionPlanningSettings(subdivisionId: number) {
  const [row] = await db
    .select()
    .from(productionPlanningSettings)
    .where(eq(productionPlanningSettings.subdivisionId, subdivisionId));

  const displayConfig = mergeProductionDisplayConfig(row?.displayConfig ?? undefined);

  return {
    subdivisionId,
    materialWriteoffMode: row?.materialWriteoffMode ?? "sync",
    timezone: row?.timezone ?? null,
    defaultShiftTemplateId: row?.defaultShiftTemplateId ?? null,
    displayConfig,
  };
}

export async function updateProductionPlanningSettings(
  subdivisionId: number,
  data: {
    materialWriteoffMode?: string;
    timezone?: string | null;
    defaultShiftTemplateId?: number | null;
    displayConfig?: Partial<ProductionDisplayConfig>;
  }
) {
  const [existing] = await db
    .select()
    .from(productionPlanningSettings)
    .where(eq(productionPlanningSettings.subdivisionId, subdivisionId));

  const currentDisplay = mergeProductionDisplayConfig(existing?.displayConfig ?? undefined);
  const displayConfig = data.displayConfig
    ? mergeProductionDisplayConfig(currentDisplay, data.displayConfig)
    : currentDisplay;

  const patch = {
    materialWriteoffMode: data.materialWriteoffMode ?? existing?.materialWriteoffMode ?? "sync",
    timezone: data.timezone !== undefined ? data.timezone : existing?.timezone ?? null,
    defaultShiftTemplateId:
      data.defaultShiftTemplateId !== undefined
        ? data.defaultShiftTemplateId
        : existing?.defaultShiftTemplateId ?? null,
    displayConfig,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(productionPlanningSettings)
      .set(patch)
      .where(eq(productionPlanningSettings.subdivisionId, subdivisionId));
  } else {
    await db.insert(productionPlanningSettings).values({
      subdivisionId,
      ...patch,
    });
  }

  return getProductionPlanningSettings(subdivisionId);
}
