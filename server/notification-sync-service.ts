import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { notifications, taskCoexecutors, tasks, type Task } from "@shared/schema";
import { storage } from "./storage";

const REPEAT_AFTER_MS = 4 * 60 * 60 * 1000;
const UPCOMING_DAYS = 3;

function isManagerRole(role: string): boolean {
  return role === "admin" || role === "marketing_manager";
}

async function getTasksForUserReminders(userId: number, role: string): Promise<Task[]> {
  const allTasks = await storage.getAllTasks();
  const active = allTasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );

  if (isManagerRole(role)) {
    return active.filter((t) => t.dueDate);
  }

  const coexecRows = await db
    .select({ taskId: taskCoexecutors.taskId })
    .from(taskCoexecutors)
    .where(eq(taskCoexecutors.userId, userId));
  const coexecTaskIds = new Set(coexecRows.map((r) => r.taskId));

  return active.filter(
    (t) =>
      t.dueDate &&
      (t.assigneeId === userId ||
        t.createdById === userId ||
        coexecTaskIds.has(t.id))
  );
}

const lastReminderSyncByUser = new Map<number, number>();
const REMINDER_SYNC_INTERVAL_MS = 15 * 60 * 1000;

async function hasRecentArchivedForTask(
  userId: number,
  taskId: number
): Promise<boolean> {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.taskId, taskId),
        eq(notifications.isArchived, true)
      )
    )
    .orderBy(desc(sql`COALESCE(${notifications.readAt}, ${notifications.createdAt})`))
    .limit(1);

  const last = rows[0];
  if (!last) return false;

  const dismissedAt = new Date(last.readAt ?? last.createdAt);
  if (Number.isNaN(dismissedAt.getTime())) return false;
  return Date.now() - dismissedAt.getTime() < REPEAT_AFTER_MS;
}

async function hasActiveReminder(
  userId: number,
  taskId: number,
  type: string
): Promise<boolean> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.taskId, taskId),
        eq(notifications.type, type),
        eq(notifications.isArchived, false)
      )
    )
    .limit(1);

  return rows.length > 0;
}

async function ensureTaskReminder(
  userId: number,
  task: Task,
  type: "task_overdue" | "task_upcoming",
  title: string,
  message: string,
  priority: "high" | "medium" | "low"
): Promise<void> {
  if (await hasActiveReminder(userId, task.id, type)) return;
  if (await hasRecentArchivedForTask(userId, task.id)) return;

  await storage.createNotification({
    userId,
    title,
    message,
    type,
    taskId: task.id,
    equipmentId: task.equipmentId ?? undefined,
    priority,
  });
}

export async function syncTaskReminderNotifications(
  userId: number,
  role: string
): Promise<void> {
  const now = new Date();
  const upcomingLimit = new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000);
  const relevantTasks = await getTasksForUserReminders(userId, role);

  for (const task of relevantTasks) {
    if (!task.dueDate) continue;
    const due = new Date(task.dueDate);
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (due < now) {
      await ensureTaskReminder(
        userId,
        task,
        "task_overdue",
        `Просрочена задача #${task.id}`,
        `${task.title} — просрочена на ${Math.abs(daysUntil)} дн.`,
        "high"
      );
    } else if (due <= upcomingLimit) {
      await ensureTaskReminder(
        userId,
        task,
        "task_upcoming",
        `Срок задачи #${task.id}`,
        daysUntil <= 0
          ? `${task.title} — срок сегодня`
          : `${task.title} — осталось ${daysUntil} дн.`,
        daysUntil <= 1 ? "high" : "medium"
      );
    }
  }
}
