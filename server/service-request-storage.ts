import { eq, desc, sql, and, gte, lte, isNull, isNotNull } from "drizzle-orm";
import { isoWeekToMonday, getIsoWeek } from "@shared/iso-week";
import { db } from "./db";
import {
  serviceRequests,
  requestTimeEntries,
  requestStatusHistory,
  requestComments,
  requestAuditLog,
  requestParts,
  requestCoexecutors,
  requestLinks,
  equipment,
  users,
  type ServiceRequest,
  type InsertServiceRequest,
  type RequestTimeEntry,
  type RequestComment,
  type RequestPart,
  type RequestLink,
  type RequestCoexecutor,
} from "../shared/schema";

export async function listServiceRequests(filters?: {
  status?: string;
  assigneeId?: number;
  equipmentId?: string;
}): Promise<ServiceRequest[]> {
  let query = db.select().from(serviceRequests).orderBy(desc(serviceRequests.createdAt));
  const rows = await query;
  return rows.filter((r) => {
    if (filters?.status && r.status !== filters.status) return false;
    if (filters?.assigneeId && r.assigneeId !== filters.assigneeId) return false;
    if (filters?.equipmentId && r.equipmentId !== filters.equipmentId) return false;
    return true;
  });
}

export async function getServiceRequestById(id: number): Promise<ServiceRequest | undefined> {
  const rows = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
  return rows[0];
}

export async function createServiceRequest(
  data: InsertServiceRequest
): Promise<ServiceRequest> {
  const [row] = await db.insert(serviceRequests).values(data).returning();
  return row;
}

export async function updateServiceRequest(
  id: number,
  data: Partial<InsertServiceRequest>
): Promise<ServiceRequest | undefined> {
  const [row] = await db
    .update(serviceRequests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(serviceRequests.id, id))
    .returning();
  return row;
}

export async function getEquipmentForRequest(equipmentId: string) {
  const rows = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
  return rows[0];
}

export async function getTotalHoursForRequest(requestId: number): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${requestTimeEntries.hours}), 0)` })
    .from(requestTimeEntries)
    .where(eq(requestTimeEntries.requestId, requestId));
  return Number(rows[0]?.total ?? 0);
}

export async function getTimeEntries(requestId: number): Promise<RequestTimeEntry[]> {
  return db
    .select()
    .from(requestTimeEntries)
    .where(eq(requestTimeEntries.requestId, requestId))
    .orderBy(desc(requestTimeEntries.workDate));
}

export async function addTimeEntry(data: {
  requestId: number;
  userId: number;
  userName: string;
  hours: number;
  workDate: string;
  comment?: string;
}): Promise<RequestTimeEntry> {
  const [row] = await db
    .insert(requestTimeEntries)
    .values({
      requestId: data.requestId,
      userId: data.userId,
      userName: data.userName,
      hours: data.hours,
      workDate: data.workDate,
      comment: data.comment,
    })
    .returning();
  return row;
}

export async function addStatusHistory(data: {
  requestId: number;
  fromStatus: string | null;
  toStatus: string;
  changedById: number;
  changedByName: string;
  comment?: string;
}) {
  await db.insert(requestStatusHistory).values(data);
}

export async function getStatusHistory(requestId: number) {
  return db
    .select()
    .from(requestStatusHistory)
    .where(eq(requestStatusHistory.requestId, requestId))
    .orderBy(desc(requestStatusHistory.createdAt));
}

export async function addRequestComment(data: {
  requestId: number;
  authorId: number;
  authorName: string;
  body: string;
  attachments?: { name: string; url: string }[];
}): Promise<RequestComment> {
  const [row] = await db
    .insert(requestComments)
    .values({
      ...data,
      attachments: data.attachments ?? [],
    })
    .returning();
  return row;
}

export async function getRequestComments(requestId: number): Promise<RequestComment[]> {
  return db
    .select()
    .from(requestComments)
    .where(eq(requestComments.requestId, requestId))
    .orderBy(desc(requestComments.createdAt));
}

export async function addAuditLog(data: {
  requestId: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  comment: string;
  changedById: number;
  changedByName: string;
}) {
  await db.insert(requestAuditLog).values(data);
}

export async function getAssignableUsers() {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.isActive, true));
}

export async function getRequestParts(requestId: number): Promise<RequestPart[]> {
  return db
    .select()
    .from(requestParts)
    .where(eq(requestParts.requestId, requestId))
    .orderBy(desc(requestParts.createdAt));
}

export async function addRequestPart(data: {
  requestId: number;
  partName: string;
  partNumber?: string;
  quantityRequired: number;
  warehousePartId?: number;
  reservationId?: number;
}): Promise<RequestPart> {
  const [row] = await db.insert(requestParts).values(data).returning();
  return row;
}

export async function updateRequestPartReservation(
  partId: number,
  data: { warehousePartId: number; reservationId: number }
): Promise<RequestPart | undefined> {
  const [row] = await db
    .update(requestParts)
    .set(data)
    .where(eq(requestParts.id, partId))
    .returning();
  return row;
}

export async function updateRequestPartStatus(
  partId: number,
  status: string,
  quantityUsed?: number
): Promise<RequestPart | undefined> {
  const [row] = await db
    .update(requestParts)
    .set({
      status,
      ...(quantityUsed != null ? { quantityUsed } : {}),
    })
    .where(eq(requestParts.id, partId))
    .returning();
  return row;
}

export async function getCoexecutors(requestId: number): Promise<RequestCoexecutor[]> {
  return db.select().from(requestCoexecutors).where(eq(requestCoexecutors.requestId, requestId));
}

export async function addCoexecutor(data: {
  requestId: number;
  userId: number;
  userName: string;
}): Promise<RequestCoexecutor> {
  const existing = await getCoexecutors(data.requestId);
  if (existing.some((c) => c.userId === data.userId)) {
    throw new Error("Соисполнитель уже добавлен");
  }
  const [row] = await db.insert(requestCoexecutors).values(data).returning();
  return row;
}

export async function removeCoexecutor(id: number): Promise<boolean> {
  const result = await db.delete(requestCoexecutors).where(eq(requestCoexecutors.id, id)).returning();
  return result.length > 0;
}

export async function getRequestLinks(requestId: number): Promise<RequestLink[]> {
  return db
    .select()
    .from(requestLinks)
    .where(eq(requestLinks.requestId, requestId))
    .orderBy(desc(requestLinks.createdAt));
}

export async function addRequestLink(data: {
  requestId: number;
  title: string;
  description?: string;
  url: string;
}): Promise<RequestLink> {
  const [row] = await db.insert(requestLinks).values(data).returning();
  return row;
}

export async function removeRequestLink(id: number): Promise<boolean> {
  const result = await db.delete(requestLinks).where(eq(requestLinks.id, id)).returning();
  return result.length > 0;
}

export async function getHoursByUser(requestId: number): Promise<{ userId: number; userName: string; hours: number }[]> {
  const rows = await db
    .select({
      userId: requestTimeEntries.userId,
      userName: requestTimeEntries.userName,
      hours: sql<number>`sum(${requestTimeEntries.hours})`,
    })
    .from(requestTimeEntries)
    .where(eq(requestTimeEntries.requestId, requestId))
    .groupBy(requestTimeEntries.userId, requestTimeEntries.userName);
  return rows.map((r) => ({ ...r, hours: Number(r.hours) }));
}

export async function findWarehousePartForRequestPart(partName: string, partNumber?: string | null) {
  const { findWarehousePartByNameOrNumber } = await import("./warehouse-storage");
  return findWarehousePartByNameOrNumber(partName, partNumber);
}

/** Резерв на складе для позиций заявок, добавленных до интеграции со складом */
export async function backfillServiceRequestPartReservations(): Promise<number> {
  const { reservePartForWork } = await import("./part-reservation-service");
  const { isNull } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(requestParts)
    .where(isNull(requestParts.reservationId));

  let updated = 0;
  for (const rp of rows) {
    const request = await getServiceRequestById(rp.requestId);
    if (!request) continue;

    const warehousePart = await findWarehousePartForRequestPart(rp.partName, rp.partNumber);
    if (!warehousePart) continue;

    try {
      const reservation = await reservePartForWork(
        warehousePart.id,
        rp.quantityRequired,
        { id: request.assigneeId ?? request.requesterId, name: request.assigneeName ?? request.requesterName },
        {
          serviceRequestId: request.id,
          serviceRequestTitle: `Заявка #${request.id}`,
          equipmentId: request.equipmentId,
          equipmentName: request.equipmentName,
        }
      );
      await updateRequestPartReservation(rp.id, {
        warehousePartId: warehousePart.id,
        reservationId: reservation.id,
      });
      updated += 1;
    } catch {
      // недостаточно остатка или другая ошибка — пропускаем
    }
  }
  return updated;
}

/** Заполняет plannedDate из plannedWeek для существующих заявок */
export async function backfillPlannedDates(): Promise<number> {
  const rows = await db
    .select()
    .from(serviceRequests)
    .where(and(isNotNull(serviceRequests.plannedWeek), isNull(serviceRequests.plannedDate)));

  let updated = 0;
  for (const row of rows) {
    if (!row.plannedWeek) continue;
    const monday = isoWeekToMonday(row.plannedWeek);
    if (!monday) continue;
    await db
      .update(serviceRequests)
      .set({ plannedDate: monday, updatedAt: new Date() })
      .where(eq(serviceRequests.id, row.id));
    updated += 1;
  }
  return updated;
}

export async function getPlanningByWeek(plannedWeek?: string) {
  const week = plannedWeek || getIsoWeek(new Date());
  const rows = await db.select().from(serviceRequests).orderBy(serviceRequests.plannedWeek);
  return rows.filter((r) => {
    if (!r.plannedWeek) return false;
    if (r.plannedWeek !== week) return false;
    return !["cancelled", "duplicate", "not_needed", "closed"].includes(r.status);
  });
}

export async function getEngineerWorkload(plannedWeek: string) {
  const requests = await getPlanningByWeek(plannedWeek);
  const workload: Record<string, { name: string; plannedHours: number; count: number }> = {};
  for (const r of requests) {
    if (!r.assigneeName) continue;
    const key = String(r.assigneeId ?? r.assigneeName);
    if (!workload[key]) {
      workload[key] = { name: r.assigneeName, plannedHours: 0, count: 0 };
    }
    workload[key].plannedHours += r.plannedHours ?? 0;
    workload[key].count += 1;
  }
  return Object.values(workload);
}

export async function getMonthlyClosedReport(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  const rows = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.status, "closed"),
        gte(serviceRequests.closedAt, start),
        lte(serviceRequests.closedAt, end)
      )
    )
    .orderBy(desc(serviceRequests.closedAt));

  const report = [];
  for (const r of rows) {
    const [entries, hoursByUser] = await Promise.all([
      getTimeEntries(r.id),
      getHoursByUser(r.id),
    ]);
    report.push({
      id: r.id,
      equipmentName: r.equipmentName,
      equipmentId: r.equipmentId,
      requestType: r.requestType,
      assigneeName: r.assigneeName,
      requesterName: r.requesterName,
      totalHours: entries.reduce((s, e) => s + e.hours, 0),
      hoursByUser,
      completionComment: r.completionComment,
      closedAt: r.closedAt,
    });
  }
  return report;
}

export async function findRequestByJiraKey(jiraKey: string): Promise<ServiceRequest | undefined> {
  const rows = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.jiraIssueKey, jiraKey));
  return rows[0];
}

export async function getRequestsByEquipmentId(equipmentId: string): Promise<ServiceRequest[]> {
  return db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.equipmentId, equipmentId))
    .orderBy(desc(serviceRequests.createdAt));
}
