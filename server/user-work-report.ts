import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { tasks, serviceRequests, requestTimeEntries, users } from "../shared/schema";
import { taskStatusLabel } from "../shared/task-status-constants";
import { STATUS_LABELS } from "../shared/service-request-constants";

const OPEN_TASK_STATUSES = ["pending", "in_progress", "overdue"] as const;
const CLOSED_SR_STATUSES = ["closed", "cancelled", "duplicate", "not_needed"] as const;

export type UserWorkOpenTask = {
  id: number;
  title: string;
  status: string;
  statusLabel: string;
  dueDate: string | null;
  assigneeAssignedAt: string | null;
  assignedDurationHours: number | null;
  actualHours: number | null;
};

export type UserWorkOpenServiceRequest = {
  id: number;
  equipmentName: string;
  status: string;
  statusLabel: string;
  loggedHours: number;
};

export type UserWorkCompletedTask = {
  id: number;
  title: string;
  completedAt: string | null;
  completedBy: string | null;
  completionComment: string | null;
  assigneeAssignedAt: string | null;
  assignedDurationHours: number | null;
  actualHours: number;
};

export type UserWorkServiceRequestEntry = {
  requestId: number;
  equipmentName: string;
  hours: number;
};

export type UserWorkReportRow = {
  userId: number;
  userName: string;
  role: string;
  department: string | null;
  position: string | null;
  openTasks: UserWorkOpenTask[];
  openServiceRequests: UserWorkOpenServiceRequest[];
  completedTasksInPeriod: UserWorkCompletedTask[];
  serviceRequestEntriesInPeriod: UserWorkServiceRequestEntry[];
  openTasksCount: number;
  openServiceRequestsCount: number;
  taskHoursInPeriod: number;
  serviceRequestHoursInPeriod: number;
  totalHoursInPeriod: number;
};

export type UserWorkReport = {
  period: { from: string | null; to: string | null };
  users: UserWorkReportRow[];
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveTaskUserId(task: typeof tasks.$inferSelect): number | null {
  return task.assigneeId ?? task.completedById ?? task.userId ?? null;
}

function inPeriod(date: Date | null | undefined, from?: Date, to?: Date): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function hoursBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
}

function resolveAssignedAt(task: typeof tasks.$inferSelect): Date | null {
  return task.assigneeAssignedAt ?? task.openedAt ?? task.createdAt ?? null;
}

export async function getUserWorkReport(options?: {
  from?: Date;
  to?: Date;
}): Promise<UserWorkReport> {
  const from = options?.from;
  const to = options?.to;

  const [allUsers, allTasks, allRequests] = await Promise.all([
    db.select().from(users).where(eq(users.isActive, true)),
    db.select().from(tasks),
    db.select().from(serviceRequests),
  ]);

  const timeConditions = [];
  if (from) timeConditions.push(gte(requestTimeEntries.workDate, toDateStr(from)));
  if (to) timeConditions.push(lte(requestTimeEntries.workDate, toDateStr(to)));

  const timeRows = await db
    .select({
      userId: requestTimeEntries.userId,
      requestId: requestTimeEntries.requestId,
      hours: sql<number>`sum(${requestTimeEntries.hours})`,
    })
    .from(requestTimeEntries)
    .where(timeConditions.length > 0 ? and(...timeConditions) : undefined)
    .groupBy(requestTimeEntries.userId, requestTimeEntries.requestId);

  const srHoursByUser = new Map<number, number>();
  const srEntriesByUser = new Map<number, UserWorkServiceRequestEntry[]>();
  const requestById = new Map(allRequests.map((r) => [r.id, r]));

  for (const row of timeRows) {
    const hours = Number(row.hours);
    srHoursByUser.set(row.userId, (srHoursByUser.get(row.userId) ?? 0) + hours);

    const request = requestById.get(row.requestId);
    const list = srEntriesByUser.get(row.userId) ?? [];
    list.push({
      requestId: row.requestId,
      equipmentName: request?.equipmentName ?? `#${row.requestId}`,
      hours,
    });
    srEntriesByUser.set(row.userId, list);
  }

  const allLoggedHoursByRequest = new Map<number, number>();
  if (allRequests.some((r) => !CLOSED_SR_STATUSES.includes(r.status as (typeof CLOSED_SR_STATUSES)[number]))) {
    const loggedRows = await db
      .select({
        requestId: requestTimeEntries.requestId,
        hours: sql<number>`sum(${requestTimeEntries.hours})`,
      })
      .from(requestTimeEntries)
      .groupBy(requestTimeEntries.requestId);

    for (const row of loggedRows) {
      allLoggedHoursByRequest.set(row.requestId, Number(row.hours));
    }
  }

  const usersReport: UserWorkReportRow[] = allUsers.map((user) => {
    const now = new Date();
    const openTasks = allTasks
      .filter(
        (t) =>
          t.assigneeId === user.id &&
          OPEN_TASK_STATUSES.includes(t.status as (typeof OPEN_TASK_STATUSES)[number])
      )
      .map((t) => {
        const assignedAt = resolveAssignedAt(t);
        return {
          id: t.id,
          title: t.title,
          status: t.status,
          statusLabel: taskStatusLabel(t.status),
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
          assigneeAssignedAt: assignedAt ? assignedAt.toISOString() : null,
          assignedDurationHours: assignedAt ? hoursBetween(assignedAt, now) : null,
          actualHours: t.actualHours,
        };
      });

    const openServiceRequests = allRequests
      .filter(
        (r) =>
          r.assigneeId === user.id &&
          !CLOSED_SR_STATUSES.includes(r.status as (typeof CLOSED_SR_STATUSES)[number])
      )
      .map((r) => ({
        id: r.id,
        equipmentName: r.equipmentName,
        status: r.status,
        statusLabel: STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status,
        loggedHours: allLoggedHoursByRequest.get(r.id) ?? 0,
      }));

    const completedTasksInPeriod = allTasks
      .filter((t) => {
        if (t.status !== "completed") return false;
        const ownerId = resolveTaskUserId(t);
        if (ownerId !== user.id) return false;
        if (!from && !to) return true;
        return inPeriod(t.completedAt, from, to);
      })
      .map((t) => {
        const assignedAt = resolveAssignedAt(t);
        const completedAt = t.completedAt ?? null;
        return {
          id: t.id,
          title: t.title,
          completedAt: completedAt ? completedAt.toISOString() : null,
          completedBy: t.completedBy ?? null,
          completionComment: t.completionComment ?? null,
          assigneeAssignedAt: assignedAt ? assignedAt.toISOString() : null,
          assignedDurationHours:
            assignedAt && completedAt ? hoursBetween(assignedAt, completedAt) : null,
          actualHours: t.actualHours ?? 0,
        };
      });

    const taskHoursInPeriod = completedTasksInPeriod.reduce((sum, t) => sum + t.actualHours, 0);
    const serviceRequestHoursInPeriod = srHoursByUser.get(user.id) ?? 0;

    return {
      userId: user.id,
      userName: user.name,
      role: user.role,
      department: user.department,
      position: user.position,
      openTasks,
      openServiceRequests,
      completedTasksInPeriod,
      serviceRequestEntriesInPeriod: srEntriesByUser.get(user.id) ?? [],
      openTasksCount: openTasks.length,
      openServiceRequestsCount: openServiceRequests.length,
      taskHoursInPeriod,
      serviceRequestHoursInPeriod,
      totalHoursInPeriod: Math.round((taskHoursInPeriod + serviceRequestHoursInPeriod) * 10) / 10,
    };
  });

  usersReport.sort((a, b) => {
    const openA = a.openTasksCount + a.openServiceRequestsCount;
    const openB = b.openTasksCount + b.openServiceRequestsCount;
    if (openB !== openA) return openB - openA;
    return b.totalHoursInPeriod - a.totalHoursInPeriod;
  });

  return {
    period: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
    users: usersReport,
  };
}
