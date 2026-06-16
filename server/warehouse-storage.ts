import { db } from "./db";
import { storage } from "./storage";
import {
  warehouseCategories,
  warehouseParts,
  warehouseMovements,
  warehousePartComments,
  warehouseStockAlerts,
  warehouseAlertResolutions,
  notifications,
  users,
  type InsertWarehousePart,
} from "@shared/schema";
import { DEFAULT_WAREHOUSE_CATEGORIES, warehouseCategoryForBudget } from "@shared/warehouse-constants";
import { filterBySubdivisionScope, type SubdivisionScope } from "@shared/subdivision-scope";
import { eq, and, desc } from "drizzle-orm";
import { assertCanModifyComment } from "./comment-access";
import {
  backfillWriteOffBudgetEntries,
  enrichWarehouseMovement,
  enrichWarehouseMovements,
  recordWriteOffBudgetEntry,
} from "./warehouse-writeoff-service";

const NOTIFY_ROLES = ["admin", "manager", "engineer", "technician", "service_engineer", "operator"];

export async function seedWarehouseCategories() {
  for (const name of DEFAULT_WAREHOUSE_CATEGORIES) {
    await db
      .insert(warehouseCategories)
      .values({ name })
      .onConflictDoNothing({ target: warehouseCategories.name });
  }
}

export async function listWarehouseCategories() {
  return db.select().from(warehouseCategories).orderBy(warehouseCategories.name);
}

export async function createWarehouseCategory(name: string) {
  const [row] = await db.insert(warehouseCategories).values({ name }).returning();
  return row;
}

export async function findOrCreateWarehouseCategory(name: string) {
  const [existing] = await db
    .select()
    .from(warehouseCategories)
    .where(eq(warehouseCategories.name, name));
  if (existing) return existing;
  return createWarehouseCategory(name);
}

/** Создать позицию на складе из расхода (бюджет) */
export async function createWarehousePartFromBudget(
  input: {
    title: string;
    amount: number;
    budgetCategory?: string;
    warehouseCategoryId?: number | null;
    storageLocation?: string | null;
    notes?: string | null;
    initialQuantity?: number;
    externalLink?: string | null;
    subdivisionId?: number | null;
    subdivisionName?: string | null;
    equipmentId?: string | null;
    equipmentName?: string | null;
  },
  user: { id: number; name: string }
) {
  let category;
  if (input.warehouseCategoryId) {
    const [existing] = await db
      .select()
      .from(warehouseCategories)
      .where(eq(warehouseCategories.id, input.warehouseCategoryId));
    category =
      existing ??
      (await findOrCreateWarehouseCategory(
        warehouseCategoryForBudget(input.budgetCategory ?? "other")
      ));
  } else {
    category = await findOrCreateWarehouseCategory(
      warehouseCategoryForBudget(input.budgetCategory ?? "other")
    );
  }

  return createWarehousePart(
    {
      name: input.title.trim(),
      categoryId: category.id,
      categoryName: category.name,
      storageLocation: input.storageLocation ?? null,
      unitCost: input.amount,
      externalLink: input.externalLink ?? null,
      notes: input.notes ?? null,
      initialQuantity: input.initialQuantity ?? 1,
      minStock: 0,
      subdivisionId: input.subdivisionId ?? null,
      subdivisionName: input.subdivisionName ?? null,
      equipmentId: input.equipmentId ?? null,
      equipmentName: input.equipmentName ?? null,
    },
    user
  );
}

export async function listWarehouseParts(filters?: {
  categoryId?: number;
  equipmentId?: string;
  search?: string;
  lowStock?: boolean;
  subdivisionId?: number;
}) {
  let rows = await db.select().from(warehouseParts).orderBy(desc(warehouseParts.updatedAt));

  if (filters?.subdivisionId) {
    rows = rows.filter((r) => r.subdivisionId === filters.subdivisionId);
  }
  if (filters?.categoryId) {
    rows = rows.filter((r) => r.categoryId === filters.categoryId);
  }
  if (filters?.equipmentId) {
    rows = rows.filter((r) => !r.equipmentId || r.equipmentId === filters.equipmentId);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.sapNumber?.toLowerCase().includes(q) ?? false) ||
        (r.inventoryNumber?.toLowerCase().includes(q) ?? false)
    );
  }
  if (filters?.lowStock) {
    rows = rows.filter((r) => (r.quantity ?? 0) <= (r.minStock ?? 0));
  }
  return rows;
}

export async function findWarehousePartByNameOrNumber(name: string, sapNumber?: string | null) {
  const rows = await db.select().from(warehouseParts);
  const bySap =
    sapNumber?.trim() &&
    rows.find((r) => r.sapNumber?.toLowerCase() === sapNumber.trim().toLowerCase());
  if (bySap) return bySap;
  const exact = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  if (exact) return exact;
  const partial = rows.find((r) => r.name.toLowerCase().includes(name.trim().toLowerCase()));
  return partial;
}

export async function getWarehousePart(id: number) {
  const [row] = await db.select().from(warehouseParts).where(eq(warehouseParts.id, id));
  return row;
}

export async function createWarehousePart(
  data: InsertWarehousePart & { initialQuantity?: number },
  user: { id: number; name: string }
) {
  const qty = data.initialQuantity ?? data.quantity ?? 0;
  const { initialQuantity: _iq, ...partData } = data;

  const [row] = await db
    .insert(warehouseParts)
    .values({
      ...partData,
      quantity: qty,
      createdById: user.id,
      createdByName: user.name,
      updatedAt: new Date(),
    })
    .returning();

  if (qty > 0) {
    await db.insert(warehouseMovements).values({
      partId: row.id,
      type: "in",
      quantity: qty,
      comment: "Начальный остаток",
      performedById: user.id,
      performedByName: user.name,
    });
  }

  try {
    await syncStockAlerts(row.id, qty, row.minStock ?? 0, row.name);
  } catch (err) {
    console.error("Stock alert sync failed (part saved):", err);
  }
  return row;
}

export async function updateWarehousePart(id: number, data: Partial<InsertWarehousePart>) {
  const existing = await getWarehousePart(id);
  if (!existing) return undefined;

  const [row] = await db
    .update(warehouseParts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(warehouseParts.id, id))
    .returning();

  try {
    await syncStockAlerts(row.id, row.quantity ?? 0, row.minStock ?? 0, row.name);
  } catch (err) {
    console.error("Stock alert sync failed (part updated):", err);
  }
  return row;
}

export async function deleteWarehousePart(id: number) {
  await db.delete(warehousePartComments).where(eq(warehousePartComments.partId, id));
  await db.delete(warehouseMovements).where(eq(warehouseMovements.partId, id));
  await db.delete(warehouseStockAlerts).where(eq(warehouseStockAlerts.partId, id));
  const result = await db.delete(warehouseParts).where(eq(warehouseParts.id, id)).returning();
  return result.length > 0;
}

export async function listWarehouseMovements(partId: number) {
  const part = await getWarehousePart(partId);
  const rows = await db
    .select()
    .from(warehouseMovements)
    .where(eq(warehouseMovements.partId, partId))
    .orderBy(desc(warehouseMovements.createdAt));

  if (part) {
    await backfillWriteOffBudgetEntries(rows, part);
  }

  const refreshed = part
    ? await db
        .select()
        .from(warehouseMovements)
        .where(eq(warehouseMovements.partId, partId))
        .orderBy(desc(warehouseMovements.createdAt))
    : rows;

  return enrichWarehouseMovements(refreshed);
}

export async function addWarehouseMovement(
  partId: number,
  data: {
    type: "in" | "out";
    quantity: number;
    equipmentId?: string;
    equipmentName?: string;
    destination?: string;
    comment?: string;
    taskId?: number;
    taskTitle?: string;
    serviceRequestId?: number;
  },
  user: { id: number; name: string }
) {
  const part = await getWarehousePart(partId);
  if (!part) throw new Error("Запчасть не найдена");

  const delta = data.type === "in" ? data.quantity : -data.quantity;
  const newQty = (part.quantity ?? 0) + delta;
  if (newQty < 0) throw new Error("Недостаточно запчастей на складе");

  let taskTitle = data.taskTitle ?? null;
  if (data.taskId && !taskTitle) {
    const task = await storage.getTask(data.taskId);
    taskTitle = task?.title ?? null;
  }

  const [movement] = await db
    .insert(warehouseMovements)
    .values({
      partId,
      type: data.type,
      quantity: data.quantity,
      equipmentId: data.equipmentId ?? null,
      equipmentName: data.equipmentName ?? null,
      destination: data.destination ?? null,
      comment: data.comment ?? null,
      taskId: data.taskId ?? null,
      taskTitle,
      serviceRequestId: data.serviceRequestId ?? null,
      performedById: user.id,
      performedByName: user.name,
    })
    .returning();

  const [updated] = await db
    .update(warehouseParts)
    .set({ quantity: newQty, updatedAt: new Date() })
    .where(eq(warehouseParts.id, partId))
    .returning();

  if (movement.type === "out") {
    await recordWriteOffBudgetEntry(movement, part, user);
  }

  try {
    await syncStockAlerts(partId, newQty, updated.minStock ?? 0, updated.name);
  } catch (err) {
    console.error("Stock alert sync failed (movement saved):", err);
  }

  const enrichedMovement = await enrichWarehouseMovement(
    (await db
      .select()
      .from(warehouseMovements)
      .where(eq(warehouseMovements.id, movement.id))
      .limit(1))[0] ?? movement
  );

  return { movement: enrichedMovement, part: updated };
}

async function syncStockAlerts(partId: number, quantity: number, minStock: number, partName: string) {
  const activeAlerts = await db
    .select()
    .from(warehouseStockAlerts)
    .where(and(eq(warehouseStockAlerts.partId, partId), eq(warehouseStockAlerts.isResolved, false)));

  const needsZero = quantity <= 0;
  const needsMin = minStock > 0 && quantity > 0 && quantity <= minStock;

  const hasZero = activeAlerts.some((a) => a.alertType === "zero_stock");
  const hasMin = activeAlerts.some((a) => a.alertType === "min_stock");

  if (needsZero && !hasZero) {
    await createStockAlert(partId, "zero_stock", partName, quantity);
  } else if (!needsZero && hasZero) {
    await resolveAlertsByType(partId, "zero_stock");
  }

  if (needsMin && !hasMin) {
    await createStockAlert(partId, "min_stock", partName, quantity);
  } else if (!needsMin && hasMin) {
    await resolveAlertsByType(partId, "min_stock");
  }
}

async function createStockAlert(
  partId: number,
  alertType: "min_stock" | "zero_stock",
  partName: string,
  quantity: number
) {
  const [alert] = await db
    .insert(warehouseStockAlerts)
    .values({ partId, alertType })
    .returning();

  const title =
    alertType === "zero_stock"
      ? `Нет на складе: ${partName}`
      : `Низкий остаток: ${partName}`;
  const message =
    alertType === "zero_stock"
      ? `Запчасть «${partName}» закончилась (остаток: ${quantity}).`
      : `Запчасть «${partName}» ниже минимума (остаток: ${quantity}).`;

  await notifyWarehouseUsers(title, message, alertType, partId);
  return alert;
}

async function resolveAlertsByType(partId: number, alertType: string) {
  await db
    .update(warehouseStockAlerts)
    .set({ isResolved: true, resolvedAt: new Date() })
    .where(
      and(
        eq(warehouseStockAlerts.partId, partId),
        eq(warehouseStockAlerts.alertType, alertType),
        eq(warehouseStockAlerts.isResolved, false)
      )
    );

  await db
    .update(notifications)
    .set({ isArchived: true })
    .where(
      and(
        eq(notifications.warehousePartId, partId),
        eq(notifications.type, `warehouse_${alertType}`)
      )
    );
}

async function notifyWarehouseUsers(
  title: string,
  message: string,
  alertType: string,
  partId: number
) {
  const allUsers = await db.select().from(users).where(eq(users.isActive, true));
  const targets = allUsers.filter((u) => NOTIFY_ROLES.includes(u.role));

  for (const u of targets) {
    await storage.createNotification({
      userId: u.id,
      title,
      message,
      type: `warehouse_${alertType}`,
      warehousePartId: partId,
      priority: alertType === "zero_stock" ? "high" : "medium",
      isRead: false,
      isArchived: false,
    });
  }
}

export async function listUnresolvedStockAlerts() {
  const alerts = await db
    .select()
    .from(warehouseStockAlerts)
    .where(eq(warehouseStockAlerts.isResolved, false))
    .orderBy(desc(warehouseStockAlerts.createdAt));

  const result = [];
  for (const alert of alerts) {
    const part = await getWarehousePart(alert.partId);
    if (part) result.push({ ...alert, part });
  }
  return result;
}

export async function resolveStockAlert(
  alertId: number,
  user: { id: number; name: string },
  details?: { resolutionType?: string; comment?: string }
) {
  const [alert] = await db
    .select()
    .from(warehouseStockAlerts)
    .where(eq(warehouseStockAlerts.id, alertId));

  if (!alert || alert.isResolved) return undefined;

  const [resolved] = await db
    .update(warehouseStockAlerts)
    .set({
      isResolved: true,
      resolvedById: user.id,
      resolvedByName: user.name,
      resolvedAt: new Date(),
    })
    .where(eq(warehouseStockAlerts.id, alertId))
    .returning();

  if (details?.resolutionType) {
    await db.insert(warehouseAlertResolutions).values({
      alertId,
      partId: alert.partId,
      resolutionType: details.resolutionType,
      comment: details.comment ?? null,
      resolvedById: user.id,
      resolvedByName: user.name,
      statusChangedById: user.id,
      statusChangedByName: user.name,
    });
  }

  await db
    .update(notifications)
    .set({ isArchived: true })
    .where(
      and(
        eq(notifications.warehousePartId, alert.partId),
        eq(notifications.type, `warehouse_${alert.alertType}`)
      )
    );

  return resolved;
}

export async function listPartComments(partId: number) {
  return db
    .select()
    .from(warehousePartComments)
    .where(eq(warehousePartComments.partId, partId))
    .orderBy(warehousePartComments.createdAt);
}

export async function addPartComment(
  partId: number,
  body: string,
  user: { id: number; name: string }
) {
  const [row] = await db
    .insert(warehousePartComments)
    .values({
      partId,
      body,
      authorId: user.id,
      authorName: user.name,
    })
    .returning();
  return row;
}

export async function updatePartComment(
  partId: number,
  commentId: number,
  body: string,
  user: { id: number; role: string }
) {
  const [existing] = await db
    .select()
    .from(warehousePartComments)
    .where(eq(warehousePartComments.id, commentId));
  if (!existing || existing.partId !== partId) {
    throw new Error("Комментарий не найден");
  }
  assertCanModifyComment(existing.authorId, user);
  const [row] = await db
    .update(warehousePartComments)
    .set({ body: body.trim(), updatedAt: new Date() })
    .where(eq(warehousePartComments.id, commentId))
    .returning();
  return row;
}

export async function deletePartComment(
  partId: number,
  commentId: number,
  user: { id: number; role: string }
) {
  const [existing] = await db
    .select()
    .from(warehousePartComments)
    .where(eq(warehousePartComments.id, commentId));
  if (!existing || existing.partId !== partId) {
    throw new Error("Комментарий не найден");
  }
  assertCanModifyComment(existing.authorId, user);
  await db.delete(warehousePartComments).where(eq(warehousePartComments.id, commentId));
  return existing;
}

export async function getWarehouseDashboardStats() {
  const parts = await db.select().from(warehouseParts);
  const zeroStock = parts.filter((p) => (p.quantity ?? 0) <= 0);
  const lowStock = parts.filter(
    (p) => (p.quantity ?? 0) > 0 && (p.minStock ?? 0) > 0 && (p.quantity ?? 0) <= (p.minStock ?? 0)
  );
  const alerts = await listUnresolvedStockAlerts();
  return {
    totalParts: parts.length,
    zeroStockCount: zeroStock.length,
    lowStockCount: lowStock.length,
    unresolvedAlerts: alerts.length,
    zeroStockParts: zeroStock.slice(0, 10),
    lowStockParts: lowStock.slice(0, 10),
    alerts: alerts.slice(0, 10),
  };
}

function parseReportDateRange(from?: string, to?: string) {
  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
  return { fromDate, toDate };
}

function warehouseStockStatus(quantity: number, minStock: number): "zero" | "low" | "ok" {
  if (quantity <= 0) return "zero";
  if (minStock > 0 && quantity <= minStock) return "low";
  return "ok";
}

export async function getWarehouseReport(filters?: {
  from?: string;
  to?: string;
  subdivisionId?: number;
  scope?: SubdivisionScope;
}) {
  const { fromDate, toDate } = parseReportDateRange(filters?.from, filters?.to);

  let parts = await db.select().from(warehouseParts);
  if (filters?.scope) {
    parts = filterBySubdivisionScope(parts, filters.scope);
  }
  if (filters?.subdivisionId != null) {
    parts = parts.filter((p) => p.subdivisionId === filters.subdivisionId);
  }
  const partIds = new Set(parts.map((p) => p.id));
  const partById = new Map(parts.map((p) => [p.id, p]));

  let movements = await db
    .select()
    .from(warehouseMovements)
    .orderBy(desc(warehouseMovements.createdAt));
  movements = movements.filter((m) => partIds.has(m.partId));
  if (fromDate || toDate) {
    movements = movements.filter((m) => {
      const d = new Date(m.createdAt);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }

  const zeroStock = parts.filter((p) => (p.quantity ?? 0) <= 0);
  const lowStock = parts.filter(
    (p) =>
      (p.quantity ?? 0) > 0 &&
      (p.minStock ?? 0) > 0 &&
      (p.quantity ?? 0) <= (p.minStock ?? 0)
  );
  const alerts = (await listUnresolvedStockAlerts()).filter((a) => partIds.has(a.partId));

  const incomingQuantity = movements
    .filter((m) => m.type === "in")
    .reduce((sum, m) => sum + (m.quantity ?? 0), 0);
  const outgoingQuantity = movements
    .filter((m) => m.type === "out")
    .reduce((sum, m) => sum + (m.quantity ?? 0), 0);
  const estimatedStockValue = parts.reduce(
    (sum, p) => sum + (p.quantity ?? 0) * (p.unitCost ?? 0),
    0
  );

  return {
    period: { from: filters?.from ?? null, to: filters?.to ?? null },
    subdivisionId: filters?.subdivisionId ?? null,
    summary: {
      totalParts: parts.length,
      zeroStockCount: zeroStock.length,
      lowStockCount: lowStock.length,
      unresolvedAlerts: alerts.length,
      movementsCount: movements.length,
      incomingQuantity: Math.round(incomingQuantity * 100) / 100,
      outgoingQuantity: Math.round(outgoingQuantity * 100) / 100,
      estimatedStockValue: Math.round(estimatedStockValue * 100) / 100,
    },
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name,
      categoryName: p.categoryName,
      quantity: p.quantity,
      minStock: p.minStock,
      reservedQuantity: p.reservedQuantity,
      unitCost: p.unitCost,
      equipmentName: p.equipmentName,
      subdivisionName: p.subdivisionName,
      storageLocation: p.storageLocation,
      stockStatus: warehouseStockStatus(p.quantity ?? 0, p.minStock ?? 0),
    })),
    movements: movements.slice(0, 300).map((m) => ({
      id: m.id,
      partId: m.partId,
      partName: partById.get(m.partId)?.name ?? "",
      type: m.type,
      typeLabel: m.type === "in" ? "Приход" : "Списание",
      quantity: m.quantity,
      equipmentName: m.equipmentName,
      destination: m.destination,
      comment: m.comment,
      performedByName: m.performedByName,
      createdAt: m.createdAt,
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      partId: a.partId,
      partName: a.part?.name ?? "",
      alertType: a.alertType,
      quantity: a.part?.quantity ?? 0,
      minStock: a.part?.minStock ?? 0,
      createdAt: a.createdAt,
    })),
  };
}
