import { eq } from "drizzle-orm";
import { db } from "./db";
import { tasks, users } from "../shared/schema";
import { taskStatusLabel } from "../shared/task-status-constants";

const OPEN_TASK_STATUSES = ["pending", "in_progress", "overdue"] as const;

export type EmployeeWorkOpenTask = {
  id: number;
  title: string;
  status: string;
  statusLabel: string;
  createdAt: string | null;
  assigneeAssignedAt: string | null;
  assignedDurationHours: number | null;
};

export type EmployeeWorkCompletedTask = {
  id: number;
  title: string;
  status: string;
  statusLabel: string;
  completionComment: string | null;
  createdAt: string | null;
  assigneeAssignedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  actualHours: number;
  assignedDurationHours: number | null;
};

export type EmployeeWorkReport = {
  userId: number;
  userName: string;
  department: string | null;
  position: string | null;
  period: { from: string | null; to: string | null };
  summary: {
    openTasksCount: number;
    completedTasksCount: number;
    completedTasksToday: number;
    totalHoursInPeriod: number;
    totalHoursToday: number;
  };
  openTasks: EmployeeWorkOpenTask[];
  completedTasks: EmployeeWorkCompletedTask[];
};

import { normalizeActualHours } from "@shared/task-hours";

function parseHours(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  try {
    return normalizeActualHours(value);
  } catch {
    return 0;
  }
}

function hoursBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
}

function resolveAssignedAt(task: typeof tasks.$inferSelect): Date | null {
  return task.assigneeAssignedAt ?? task.openedAt ?? task.createdAt ?? null;
}

function inPeriod(date: Date | null | undefined, from?: Date, to?: Date): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export async function getEmployeeWorkReport(options: {
  userId: number;
  from?: Date;
  to?: Date;
}): Promise<EmployeeWorkReport | null> {
  const { userId, from, to } = options;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  const allTasks = await db.select().from(tasks);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const userTasks = allTasks.filter((t) => t.assigneeId === userId);

  const openTasks: EmployeeWorkOpenTask[] = userTasks
    .filter((t) => OPEN_TASK_STATUSES.includes(t.status as (typeof OPEN_TASK_STATUSES)[number]))
    .map((t) => {
      const assignedAt = resolveAssignedAt(t);
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        statusLabel: taskStatusLabel(t.status),
        createdAt: t.createdAt ? t.createdAt.toISOString() : null,
        assigneeAssignedAt: assignedAt ? assignedAt.toISOString() : null,
        assignedDurationHours: assignedAt ? hoursBetween(assignedAt, now) : null,
      };
    })
    .sort((a, b) => {
      const aTime = a.assigneeAssignedAt ? new Date(a.assigneeAssignedAt).getTime() : 0;
      const bTime = b.assigneeAssignedAt ? new Date(b.assigneeAssignedAt).getTime() : 0;
      return bTime - aTime;
    });

  const completedTasks: EmployeeWorkCompletedTask[] = userTasks
    .filter((t) => {
      if (t.status !== "completed") return false;
      if (!from && !to) return true;
      return inPeriod(t.completedAt, from, to);
    })
    .map((t) => {
      const assignedAt = resolveAssignedAt(t);
      const completedAt = t.completedAt ?? null;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        statusLabel: taskStatusLabel(t.status),
        completionComment: t.completionComment ?? null,
        createdAt: t.createdAt ? t.createdAt.toISOString() : null,
        assigneeAssignedAt: assignedAt ? assignedAt.toISOString() : null,
        completedAt: completedAt ? completedAt.toISOString() : null,
        completedBy: t.completedBy ?? null,
        actualHours: parseHours(t.actualHours),
        assignedDurationHours:
          assignedAt && completedAt ? hoursBetween(assignedAt, completedAt) : null,
      };
    })
    .sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

  const completedToday = userTasks.filter(
    (t) => t.status === "completed" && inPeriod(t.completedAt, todayStart, todayEnd)
  );

  const totalHoursInPeriod = completedTasks.reduce((sum, t) => sum + t.actualHours, 0);
  const totalHoursToday = completedToday.reduce((sum, t) => sum + parseHours(t.actualHours), 0);

  return {
    userId: user.id,
    userName: user.name,
    department: user.department,
    position: user.position,
    period: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
    summary: {
      openTasksCount: openTasks.length,
      completedTasksCount: completedTasks.length,
      completedTasksToday: completedToday.length,
      totalHoursInPeriod: Math.round(totalHoursInPeriod * 10) / 10,
      totalHoursToday: Math.round(totalHoursToday * 10) / 10,
    },
    openTasks,
    completedTasks,
  };
}
