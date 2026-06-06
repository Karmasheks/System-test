import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { isoWeekToMonday } from "@shared/iso-week";
import { db } from "./db";
import {
  contacts,
  suppliers,
  budgetEntries,
  documents,
  documentCategories,
  tasks,
  serviceRequests,
  remarks,
  equipment,
  type InsertContact,
  type InsertSupplier,
  type InsertBudgetEntry,
  type InsertDocument,
} from "../shared/schema";
import {
  filterBySubdivisionScope,
  type SubdivisionScope,
} from "@shared/subdivision-scope";
import {
  filterBudgetEntriesByScope,
  loadEquipmentSubdivisionMap,
} from "./subdivision-equipment-filter";

// --- Contacts ---
export async function listContacts(filters?: { equipmentId?: string }) {
  const q = db.select().from(contacts);
  if (filters?.equipmentId) {
    return q.where(eq(contacts.equipmentId, filters.equipmentId)).orderBy(asc(contacts.name));
  }
  return q.orderBy(asc(contacts.name));
}

export async function createContact(data: InsertContact) {
  const [row] = await db.insert(contacts).values(data).returning();
  return row;
}

export async function updateContact(id: number, data: Partial<InsertContact>) {
  const [row] = await db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
  return row;
}

export async function deleteContact(id: number) {
  const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
  return result.length > 0;
}

// --- Suppliers ---
export async function listSuppliers(filters?: { equipmentId?: string }) {
  const q = db.select().from(suppliers);
  if (filters?.equipmentId) {
    return q.where(eq(suppliers.equipmentId, filters.equipmentId)).orderBy(asc(suppliers.name));
  }
  return q.orderBy(asc(suppliers.name));
}

export async function createSupplier(data: InsertSupplier) {
  const [row] = await db.insert(suppliers).values(data).returning();
  return row;
}

export async function updateSupplier(id: number, data: Partial<InsertSupplier>) {
  const [row] = await db.update(suppliers).set(data).where(eq(suppliers.id, id)).returning();
  return row;
}

export async function deleteSupplier(id: number) {
  const result = await db.delete(suppliers).where(eq(suppliers.id, id)).returning();
  return result.length > 0;
}

// --- Budget ---
export async function listBudgetEntries(filters?: {
  equipmentId?: string;
  from?: string;
  to?: string;
  category?: string;
}) {
  const conditions = [];
  if (filters?.equipmentId) conditions.push(eq(budgetEntries.equipmentId, filters.equipmentId));
  if (filters?.category) conditions.push(eq(budgetEntries.category, filters.category));
  if (filters?.from) conditions.push(gte(budgetEntries.expenseDate, filters.from));
  if (filters?.to) conditions.push(lte(budgetEntries.expenseDate, filters.to));

  const q = db.select().from(budgetEntries);
  if (conditions.length) {
    return q.where(and(...conditions)).orderBy(desc(budgetEntries.expenseDate));
  }
  return q.orderBy(desc(budgetEntries.expenseDate));
}

export async function getBudgetEntryById(id: number) {
  const [row] = await db.select().from(budgetEntries).where(eq(budgetEntries.id, id));
  return row;
}

export async function createBudgetEntry(data: InsertBudgetEntry) {
  const [row] = await db.insert(budgetEntries).values(data).returning();
  return row;
}

export async function updateBudgetEntry(id: number, data: Partial<InsertBudgetEntry>) {
  const [row] = await db.update(budgetEntries).set(data).where(eq(budgetEntries.id, id)).returning();
  return row;
}

export async function deleteBudgetEntry(id: number) {
  await db
    .update(serviceRequests)
    .set({ budgetEntryId: null })
    .where(eq(serviceRequests.budgetEntryId, id));
  const result = await db.delete(budgetEntries).where(eq(budgetEntries.id, id)).returning();
  return result.length > 0;
}

export async function linkBudgetToServiceRequest(requestId: number, budgetEntryId: number | null) {
  const [request] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, requestId));
  if (!request) return undefined;

  if (request.budgetEntryId != null && request.budgetEntryId !== budgetEntryId) {
    await db
      .update(budgetEntries)
      .set({ serviceRequestId: null })
      .where(eq(budgetEntries.id, request.budgetEntryId));
  }

  if (budgetEntryId != null) {
    await db
      .update(budgetEntries)
      .set({ serviceRequestId: requestId })
      .where(eq(budgetEntries.id, budgetEntryId));
  }

  const [row] = await db
    .update(serviceRequests)
    .set({ budgetEntryId, updatedAt: new Date() })
    .where(eq(serviceRequests.id, requestId))
    .returning();
  return row;
}

export async function getBudgetSummary(
  equipmentId?: string,
  scope?: SubdivisionScope | null
) {
  let entries = await listBudgetEntries(
    equipmentId ? { equipmentId } : undefined
  );
  if (scope && !scope.viewAll) {
    const eqMap = await loadEquipmentSubdivisionMap();
    entries = filterBudgetEntriesByScope(entries, eqMap, scope);
  }
  const total = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
  const byCategory = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});
  return { total, count: entries.length, byCategory };
}

export async function getBudgetReport(filters?: {
  from?: string;
  to?: string;
  equipmentId?: string;
}) {
  const entries = await listBudgetEntries({
    equipmentId: filters?.equipmentId,
    from: filters?.from,
    to: filters?.to,
  });

  const total = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
  const byCategory = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  const byEquipmentMap = new Map<
    string,
    { equipmentId: string | null; equipmentName: string; total: number; count: number; byCategory: Record<string, number> }
  >();

  for (const e of entries) {
    const key = e.equipmentId ?? "__none__";
    const name = e.equipmentName ?? e.equipmentId ?? "Без привязки к оборудованию";
    const row = byEquipmentMap.get(key) ?? {
      equipmentId: e.equipmentId ?? null,
      equipmentName: name,
      total: 0,
      count: 0,
      byCategory: {},
    };
    row.total += e.amount ?? 0;
    row.count += 1;
    row.byCategory[e.category] = (row.byCategory[e.category] ?? 0) + e.amount;
    byEquipmentMap.set(key, row);
  }

  const byEquipment = [...byEquipmentMap.values()].sort((a, b) => b.total - a.total);

  return {
    period: { from: filters?.from ?? null, to: filters?.to ?? null },
    equipmentId: filters?.equipmentId ?? null,
    total,
    count: entries.length,
    byCategory,
    byEquipment,
    entries: entries.map((e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      category: e.category,
      equipmentId: e.equipmentId,
      equipmentName: e.equipmentName,
      expenseDate: e.expenseDate,
    })),
  };
}

// --- Documents ---
export async function listDocumentCategories() {
  return db.select().from(documentCategories).orderBy(asc(documentCategories.name));
}

export async function createDocumentCategory(name: string) {
  const [row] = await db.insert(documentCategories).values({ name }).returning();
  return row;
}

export async function listDocuments(filters?: { equipmentId?: string; category?: string }) {
  const conditions = [];
  if (filters?.equipmentId) conditions.push(eq(documents.equipmentId, filters.equipmentId));
  if (filters?.category) conditions.push(eq(documents.category, filters.category));
  const q = db.select().from(documents);
  if (conditions.length) {
    return q.where(and(...conditions)).orderBy(desc(documents.createdAt));
  }
  return q.orderBy(desc(documents.createdAt));
}

export async function createDocument(data: InsertDocument) {
  const [row] = await db.insert(documents).values(data).returning();
  return row;
}

export async function updateDocument(id: number, data: Partial<InsertDocument>) {
  const [row] = await db.update(documents).set(data).where(eq(documents.id, id)).returning();
  return row;
}

export async function deleteDocument(id: number) {
  const result = await db.delete(documents).where(eq(documents.id, id)).returning();
  return result.length > 0;
}

export type CalendarEvent = {
  id: string;
  sourceType: "maintenance" | "task" | "service_request" | "remark" | "inspection" | (string & {});
  sourceId: number;
  title: string;
  date: string;
  status: string;
  equipmentId?: string | null;
  equipmentName?: string | null;
  isCompleted: boolean;
  isPending: boolean;
};

function parseDateRange(from?: string, to?: string) {
  const fromDate = from
    ? new Date(`${from}T00:00:00`)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to
    ? new Date(`${to}T23:59:59.999`)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);
  return { fromDate, toDate };
}

export async function getCalendarEvents(
  from?: string,
  to?: string,
  equipmentId?: string,
  scope?: SubdivisionScope | null
) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const events: CalendarEvent[] = [];

  let allTasks = await db.select().from(tasks);
  if (scope && !scope.viewAll) {
    allTasks = filterBySubdivisionScope(allTasks, scope);
  }
  for (const t of allTasks) {
    if (equipmentId && t.equipmentId !== equipmentId) continue;
    if (!t.dueDate) continue;
    const dt = new Date(t.dueDate);
    if (dt < fromDate || dt > toDate) continue;
    const done = t.status === "completed";
    events.push({
      id: `task-${t.id}`,
      sourceType: "task",
      sourceId: t.id,
      title: t.title,
      date: dt.toISOString(),
      status: t.status,
      equipmentId: t.equipmentId,
      equipmentName: null,
      isCompleted: done,
      isPending: !done && (t.status === "pending" || t.status === "in_progress"),
    });
  }

  let allRemarks = await db.select().from(remarks);
  if (scope && !scope.viewAll) {
    allRemarks = filterBySubdivisionScope(allRemarks, scope);
  }
  for (const r of allRemarks) {
    if (equipmentId && r.equipmentId !== equipmentId) continue;
    const dt = new Date(r.createdAt);
    if (dt < fromDate || dt > toDate) continue;
    const done = r.status === "resolved";
    if (done) continue;
    events.push({
      id: `remark-${r.id}`,
      sourceType: "remark",
      sourceId: r.id,
      title: r.title,
      date: dt.toISOString(),
      status: r.status,
      equipmentId: r.equipmentId,
      equipmentName: r.equipmentName,
      isCompleted: false,
      isPending: r.status === "open" || r.status === "in_progress",
    });
  }

  let requests = await db.select().from(serviceRequests);
  if (scope && !scope.viewAll) {
    requests = filterBySubdivisionScope(requests, scope);
  }
  for (const r of requests) {
    if (equipmentId && r.equipmentId !== equipmentId) continue;
    const done = ["done", "closed"].includes(r.status);
    let dateSrc = r.plannedDate ?? null;
    if (!dateSrc && r.plannedWeek) {
      dateSrc = isoWeekToMonday(r.plannedWeek);
    }
    if (!dateSrc) dateSrc = r.closedAt ?? r.createdAt;
    if (!dateSrc) continue;
    const dt = new Date(dateSrc);
    if (dt < fromDate || dt > toDate) continue;
    const pending = ["new", "assigned", "in_progress", "waiting_parts", "user_review"].includes(r.status);
    if (!r.plannedDate && !r.plannedWeek && !done) continue;
    events.push({
      id: `sr-${r.id}`,
      sourceType: "service_request",
      sourceId: r.id,
      title: `Заявка #${r.id} — ${r.equipmentName}`,
      date: dt.toISOString(),
      status: r.status,
      equipmentId: r.equipmentId,
      equipmentName: r.equipmentName,
      isCompleted: done,
      isPending: pending && !done,
    });
  }

  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getCalendarStats(
  from?: string,
  to?: string,
  equipmentId?: string,
  scope?: SubdivisionScope | null
) {
  const events = await getCalendarEvents(from, to, equipmentId, scope);
  const pendingEvents = events.filter((e) => e.isPending);
  return {
    total: events.length,
    planned: pendingEvents.length,
    completed: events.filter((e) => e.isCompleted).length,
    pending: pendingEvents.filter((e) => e.status === "pending" || e.status === "scheduled").length,
    byType: {
      tasks: events.filter((e) => e.sourceType === "task").length,
      serviceRequests: events.filter((e) => e.sourceType === "service_request").length,
      remarks: events.filter((e) => e.sourceType === "remark").length,
    },
  };
}

export async function getReportsData(from?: string, to?: string, equipmentId?: string) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const budgetList = await listBudgetEntries({
    equipmentId,
    from: fromStr,
    to: toStr,
  });
  const budgetTotal = budgetList.reduce((s, e) => s + e.amount, 0);

  const allTasks = await db.select().from(tasks);
  const maintTasks = allTasks.filter((t) => t.taskType === "maintenance" && t.dueDate);
  const maintInRange = maintTasks.filter((t) => {
    if (equipmentId && t.equipmentId !== equipmentId) return false;
    const d = new Date(t.dueDate!);
    return d >= fromDate && d <= toDate;
  });
  const maintCompleted = maintInRange.filter((t) => t.status === "completed");
  const maintOverdue = maintInRange.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "cancelled" &&
      new Date(t.dueDate!) < new Date()
  );
  const tasksInRange = allTasks.filter((t) => {
    if (equipmentId && t.equipmentId && t.equipmentId !== equipmentId) return false;
    const d = t.completedAt ? new Date(t.completedAt) : t.dueDate ? new Date(t.dueDate) : null;
    if (!d) return false;
    return d >= fromDate && d <= toDate;
  });
  const resolvedTasks = tasksInRange.filter((t) => t.status === "completed");

  const eqList = equipmentId
    ? await db.select().from(equipment).where(eq(equipment.id, equipmentId))
    : await db.select().from(equipment);
  const downtimeEquipment = eqList.filter(
    (e) => e.status === "maintenance" || e.status === "inactive"
  );

  const openRequests = await db.select().from(serviceRequests);
  const requestsInRange = openRequests.filter((r) => {
    if (equipmentId && r.equipmentId !== equipmentId) return false;
    const d = new Date(r.createdAt);
    return d >= fromDate && d <= toDate;
  });
  const closedRequests = requestsInRange.filter((r) =>
    ["closed", "done"].includes(r.status)
  );

  const calendarStats = await getCalendarStats(fromStr, toStr, equipmentId);

  return {
    period: { from: fromStr, to: toStr },
    monthly: {
      budgetTotal,
      budgetCount: budgetList.length,
      maintenanceScheduled: maintInRange.length,
      maintenanceCompleted: maintCompleted.length,
      tasksResolved: resolvedTasks.length,
      serviceRequestsClosed: closedRequests.length,
    },
    downtime: {
      equipmentInMaintenance: downtimeEquipment.length,
      overdueMaintenance: maintOverdue.length,
      equipmentList: downtimeEquipment.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
      })),
    },
    resolvedTasks: {
      count: resolvedTasks.length,
      items: resolvedTasks.slice(0, 50).map((t) => ({
        id: t.id,
        title: t.title,
        completedAt: t.completedAt,
        equipmentId: t.equipmentId,
      })),
    },
    maintenance: {
      scheduled: maintInRange.filter((t) => t.status === "pending" || t.status === "in_progress").length,
      completed: maintCompleted.length,
      overdue: maintOverdue.length,
      items: maintInRange.slice(0, 50).map((t) => ({
        id: t.id,
        equipmentName: t.equipmentId,
        type: t.maintenanceType,
        scheduledDate: t.dueDate,
        status: t.status,
      })),
    },
    calendar: calendarStats,
    budgetByCategory: budgetList.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {}),
  };
}

export async function seedDefaultDocumentCategories() {
  const existing = await db.select().from(documentCategories).limit(1);
  if (existing.length > 0) return;
  await db.insert(documentCategories).values([
    { name: "instruction" },
    { name: "documentation" },
    { name: "invoice" },
  ]);
}
