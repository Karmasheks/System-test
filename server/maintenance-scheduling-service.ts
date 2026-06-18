import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { maintenanceRecords, tasks, type Task } from "@shared/schema";
import {
  formatMaintenanceDateRu,
  maintenanceTaskDueDate,
  shouldCreateMaintenanceTaskNow,
} from "@shared/maintenance-scheduling-constants";
import {
  createTaskFromMaintenance,
  findTaskBySource,
} from "./task-orchestration-service";

type AuthUser = { id: number; name: string };

const SYSTEM_USER: AuthUser = { id: 0, name: "Система" };

const TERMINAL_MAINTENANCE_STATUSES = new Set(["completed", "cancelled"]);

const ACTIVE_SCHEDULE_STATUSES = new Set([
  "scheduled",
  "in_progress",
  "overdue",
  "unplanned",
  "postponed",
]);

/** Обновляет поле «Следующее ТО» на карточке оборудования из календаря. */
export async function syncEquipmentNextMaintenance(equipmentId: string): Promise<void> {
  const records = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.equipmentId, equipmentId));

  const todayMs = startOfDayMs(new Date());
  const upcoming = records
    .filter((r) => ACTIVE_SCHEDULE_STATUSES.has(r.status))
    .filter((r) => startOfDayMs(new Date(r.scheduledDate)) >= todayMs)
    .sort(
      (a, b) =>
        startOfDayMs(new Date(a.scheduledDate)) - startOfDayMs(new Date(b.scheduledDate))
    );

  const nextText =
    upcoming.length > 0
      ? formatMaintenanceDateRu(new Date(upcoming[0].scheduledDate))
      : "-";

  await storage.updateEquipment(equipmentId, { nextMaintenance: nextText });
}

export async function afterMaintenanceScheduleChange(equipmentId: string): Promise<void> {
  if (!equipmentId) return;
  await syncEquipmentNextMaintenance(equipmentId);
}

export async function findTaskByMaintenanceId(maintenanceId: number): Promise<Task | undefined> {
  const bySource = await findTaskBySource("maintenance", maintenanceId);
  if (bySource) return bySource;
  const [byFk] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.maintenanceId, maintenanceId))
    .limit(1);
  return byFk;
}

async function syncLinkedTaskDueDate(
  maintenanceId: number,
  scheduledDate: Date,
  user: AuthUser,
  historyComment?: string
): Promise<Task | null> {
  const task = await findTaskByMaintenanceId(maintenanceId);
  if (!task) return null;

  const newDue = maintenanceTaskDueDate(scheduledDate);
  const updates: Partial<Task> = { dueDate: newDue };
  await storage.updateTask(task.id, updates);

  if (historyComment) {
    await storage.createTaskStatusHistory({
      taskId: task.id,
      fromStatus: task.status,
      toStatus: task.status,
      changedById: user.id,
      changedByName: user.name,
      comment: historyComment,
    });
  }

  return { ...task, ...updates };
}

/**
 * Создаёт или синхронизирует задачу на ТО (dueDate = scheduledDate − lead days).
 * Задача появляется не раньше чем за MAINTENANCE_TASK_LEAD_DAYS до даты ТО.
 */
export async function ensureMaintenanceTask(
  record: typeof maintenanceRecords.$inferSelect,
  user: AuthUser
): Promise<Task | null> {
  if (TERMINAL_MAINTENANCE_STATUSES.has(record.status)) {
    return null;
  }

  const scheduled = new Date(record.scheduledDate);
  const existing = await findTaskByMaintenanceId(record.id);

  if (existing) {
    const expectedDue = maintenanceTaskDueDate(scheduled);
    const currentDue = existing.dueDate ? new Date(existing.dueDate) : null;
    if (
      !currentDue ||
      startOfDayMs(currentDue) !== startOfDayMs(expectedDue)
    ) {
      await storage.updateTask(existing.id, { dueDate: expectedDue });
    }
    return existing;
  }

  if (!shouldCreateMaintenanceTaskNow(scheduled)) {
    return null;
  }

  return createTaskFromMaintenance(record, user);
}

function startOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Сканирует записи ТО и создаёт задачи, когда наступил срок lead. */
export async function runMaintenanceTaskScheduler(): Promise<number> {
  const records = await storage.getAllMaintenanceRecords();
  let created = 0;

  for (const record of records) {
    if (TERMINAL_MAINTENANCE_STATUSES.has(record.status)) continue;
    const existing = await findTaskByMaintenanceId(record.id);
    if (existing) continue;
    if (!shouldCreateMaintenanceTaskNow(new Date(record.scheduledDate))) continue;

    try {
      const task = await createTaskFromMaintenance(record, SYSTEM_USER);
      if (task) created += 1;
    } catch (err) {
      console.error(`maintenance scheduler: record #${record.id}`, err);
    }
  }

  return created;
}

export async function rescheduleMaintenance(
  maintenanceId: number,
  newScheduledDate: Date,
  reason: string,
  user: AuthUser
): Promise<typeof maintenanceRecords.$inferSelect> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("Укажите причину переноса");
  }

  const existing = await storage.getMaintenanceRecord(maintenanceId);
  if (!existing) {
    throw new Error("Запись о техобслуживании не найдена");
  }

  if (TERMINAL_MAINTENANCE_STATUSES.has(existing.status)) {
    throw new Error("Нельзя перенести завершённое или отменённое ТО");
  }

  const oldDate = new Date(existing.scheduledDate);
  const historyComment = `Перенос с ${formatMaintenanceDateRu(oldDate)} на ${formatMaintenanceDateRu(
    newScheduledDate
  )}. Причина: ${trimmedReason}`;

  await storage.createMaintenanceStatusHistory({
    maintenanceRecordId: maintenanceId,
    fromStatus: existing.status,
    toStatus: "postponed",
    changedById: user.id,
    changedByName: user.name,
    comment: historyComment,
  });

  const record = await storage.updateMaintenanceRecord(maintenanceId, {
    scheduledDate: newScheduledDate,
    status: "postponed",
    lastModifiedById: user.id,
    lastModifiedByName: user.name,
    updatedAt: new Date(),
  });

  if (!record) {
    throw new Error("Запись о техобслуживании не найдена");
  }

  const taskHistory = `Перенос ТО. ${historyComment}`;
  const linkedTask = await findTaskByMaintenanceId(maintenanceId);

  if (linkedTask) {
    await syncLinkedTaskDueDate(maintenanceId, newScheduledDate, user, taskHistory);
  } else {
    await ensureMaintenanceTask(record, user);
    const task = await findTaskByMaintenanceId(maintenanceId);
    if (task) {
      await storage.createTaskStatusHistory({
        taskId: task.id,
        fromStatus: task.status,
        toStatus: task.status,
        changedById: user.id,
        changedByName: user.name,
        comment: taskHistory,
      });
    }
  }

  if (record.equipmentId) {
    await afterMaintenanceScheduleChange(record.equipmentId);
    const { syncToirAndRecalculateProduction } = await import("./production-toir-integration-service");
    await syncToirAndRecalculateProduction(record.equipmentId, {
      id: user.id,
      name: user.name,
    });
  }

  return record;
}

export async function onMaintenanceScheduledDateChanged(
  record: typeof maintenanceRecords.$inferSelect,
  previousScheduledDate: Date,
  user: AuthUser
): Promise<void> {
  if (
    startOfDayMs(new Date(record.scheduledDate)) === startOfDayMs(previousScheduledDate)
  ) {
    return;
  }

  await ensureMaintenanceTask(record, user);
  const task = await findTaskByMaintenanceId(record.id);
  if (task) {
    const comment = `Дата ТО изменена: ${formatMaintenanceDateRu(previousScheduledDate)} → ${formatMaintenanceDateRu(
      new Date(record.scheduledDate)
    )}`;
    await syncLinkedTaskDueDate(record.id, new Date(record.scheduledDate), user, comment);
  }
  if (record.equipmentId) {
    await afterMaintenanceScheduleChange(record.equipmentId);
  }
}
