import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "./db";
import { maintenanceRecords, notifications, taskCoexecutors, tasks, type Task } from "@shared/schema";
import { storage } from "./storage";
import { findTaskByMaintenanceId } from "./maintenance-scheduling-service";
import {
  daysUntilDate,
  formatMaintenanceScheduledMessage,
  reminderRepeatIntervalMs,
  shouldNotifyMaintenanceSchedule,
  shouldNotifyTaskUpcoming,
  TASK_UPCOMING_NOTIFY_DAYS,
} from "@shared/notification-reminder-constants";

function isManagerRole(role: string): boolean {
  return role === "admin" || role === "marketing_manager";
}

function isMaintenanceTask(task: Task): boolean {
  return task.taskType === "maintenance" || task.maintenanceId != null;
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
export const REMINDER_SYNC_INTERVAL_MS = 15 * 60 * 1000;

async function hasRecentArchived(
  userId: number,
  type: string,
  repeatAfterMs: number,
  filters: { taskId?: number; messagePrefix?: string }
): Promise<boolean> {
  const conditions = [
    eq(notifications.userId, userId),
    eq(notifications.type, type),
    eq(notifications.isArchived, true),
  ];
  if (filters.taskId != null) {
    conditions.push(eq(notifications.taskId, filters.taskId));
  }
  if (filters.messagePrefix) {
    conditions.push(like(notifications.message, `${filters.messagePrefix}%`));
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(sql`COALESCE(${notifications.readAt}, ${notifications.createdAt})`))
    .limit(1);

  const last = rows[0];
  if (!last) return false;

  const dismissedAt = new Date(last.readAt ?? last.createdAt);
  if (Number.isNaN(dismissedAt.getTime())) return false;
  return Date.now() - dismissedAt.getTime() < repeatAfterMs;
}

async function hasActiveReminder(
  userId: number,
  type: string,
  filters: { taskId?: number; messagePrefix?: string }
): Promise<boolean> {
  const conditions = [
    eq(notifications.userId, userId),
    eq(notifications.type, type),
    eq(notifications.isArchived, false),
  ];
  if (filters.taskId != null) {
    conditions.push(eq(notifications.taskId, filters.taskId));
  }
  if (filters.messagePrefix) {
    conditions.push(like(notifications.message, `${filters.messagePrefix}%`));
  }

  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(...conditions))
    .limit(1);

  return rows.length > 0;
}

async function ensureTaskReminder(
  userId: number,
  task: Task,
  type: "task_overdue" | "task_upcoming",
  title: string,
  message: string,
  priority: "high" | "medium" | "low",
  daysUntil: number
): Promise<void> {
  const maintenance = isMaintenanceTask(task);
  const repeatAfterMs = reminderRepeatIntervalMs(daysUntil, {
    maintenance,
    overdue: type === "task_overdue",
  });

  if (await hasActiveReminder(userId, type, { taskId: task.id })) return;
  if (
    await hasRecentArchived(userId, type, repeatAfterMs, {
      taskId: task.id,
    })
  ) {
    return;
  }

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

async function ensureMaintenanceScheduleReminder(
  userId: number,
  record: typeof maintenanceRecords.$inferSelect,
  daysUntilTo: number
): Promise<void> {
  const messagePrefix = `maintenance_record:${record.id}|`;
  const repeatAfterMs = reminderRepeatIntervalMs(daysUntilTo, { maintenance: true });

  if (
    await hasActiveReminder(userId, "maintenance_scheduled", {
      messagePrefix,
    })
  ) {
    return;
  }
  if (
    await hasRecentArchived(userId, "maintenance_scheduled", repeatAfterMs, {
      messagePrefix,
    })
  ) {
    return;
  }

  await storage.createNotification({
    userId,
    title: "Запланировано ТО",
    message: formatMaintenanceScheduledMessage(
      record.id,
      record.equipmentName,
      record.maintenanceType,
      daysUntilTo
    ),
    type: "maintenance_scheduled",
    equipmentId: record.equipmentId,
    priority: daysUntilTo <= 7 ? "medium" : "low",
  });
}

const TERMINAL_MAINTENANCE_STATUSES = new Set(["completed", "cancelled"]);

async function syncMaintenanceScheduleReminders(userId: number, role: string): Promise<void> {
  if (!isManagerRole(role)) return;

  const records = await storage.getAllMaintenanceRecords();
  const today = new Date();

  for (const record of records) {
    if (TERMINAL_MAINTENANCE_STATUSES.has(record.status)) continue;

    const scheduled = new Date(record.scheduledDate);
    const daysUntilTo = daysUntilDate(scheduled, today);
    if (!shouldNotifyMaintenanceSchedule(daysUntilTo)) continue;

    const linkedTask = await findTaskByMaintenanceId(record.id);
    if (linkedTask && linkedTask.status !== "completed" && linkedTask.status !== "cancelled") {
      continue;
    }

    await ensureMaintenanceScheduleReminder(userId, record, daysUntilTo);
  }
}

export async function syncTaskReminderNotifications(
  userId: number,
  role: string
): Promise<void> {
  const now = new Date();
  const upcomingLimit = new Date(
    now.getTime() + TASK_UPCOMING_NOTIFY_DAYS * 24 * 60 * 60 * 1000
  );
  const relevantTasks = await getTasksForUserReminders(userId, role);

  for (const task of relevantTasks) {
    if (!task.dueDate) continue;
    const due = new Date(task.dueDate);
    const daysUntil = daysUntilDate(due, now);
    const maintenance = isMaintenanceTask(task);

    if (due < now) {
      await ensureTaskReminder(
        userId,
        task,
        "task_overdue",
        maintenance ? `Просрочено ТО (задача #${task.id})` : `Просрочена задача #${task.id}`,
        maintenance
          ? `${task.title} — просрочено на ${Math.abs(daysUntil)} дн.`
          : `${task.title} — просрочена на ${Math.abs(daysUntil)} дн.`,
        "high",
        daysUntil
      );
    } else if (due <= upcomingLimit && shouldNotifyTaskUpcoming(daysUntil)) {
      await ensureTaskReminder(
        userId,
        task,
        "task_upcoming",
        maintenance ? `Срок ТО (задача #${task.id})` : `Срок задачи #${task.id}`,
        daysUntil <= 0
          ? `${task.title} — срок сегодня`
          : `${task.title} — осталось ${daysUntil} дн.`,
        daysUntil <= 1 ? "high" : "medium",
        daysUntil
      );
    }
  }

  await syncMaintenanceScheduleReminders(userId, role);
}
