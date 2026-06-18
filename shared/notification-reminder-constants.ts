import { MAINTENANCE_TASK_LEAD_DAYS } from "./maintenance-scheduling-constants";

/** За сколько дней до срока задачи показывать напоминание в колокольчике. */
export const TASK_UPCOMING_NOTIFY_DAYS = 3;

/** За сколько дней до даты ТО напоминать в календаре (до появления задачи). */
export const MAINTENANCE_SCHEDULE_NOTIFY_DAYS = 14;

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysUntilDate(target: Date, now = new Date()): number {
  const t = startOfLocalDay(target);
  const n = startOfLocalDay(now);
  return Math.ceil((t.getTime() - n.getTime()) / MS_DAY);
}

/** Как часто повторять напоминание после закрытия пользователем. */
export function reminderRepeatIntervalMs(
  daysUntil: number,
  options?: { maintenance?: boolean; overdue?: boolean }
): number {
  if (options?.overdue || daysUntil < 0) return MS_DAY;
  if (daysUntil <= 0) return 12 * MS_HOUR;
  if (daysUntil <= 1) return 12 * MS_HOUR;
  if (daysUntil <= 3) return MS_DAY;
  if (daysUntil <= 7) return 3 * MS_DAY;
  return 5 * MS_DAY;
}

export function shouldNotifyTaskUpcoming(daysUntil: number): boolean {
  return daysUntil <= TASK_UPCOMING_NOTIFY_DAYS;
}

/** До появления задачи на ТО — только редкие напоминания о дате в календаре. */
export function shouldNotifyMaintenanceSchedule(daysUntilTo: number): boolean {
  return (
    daysUntilTo > MAINTENANCE_TASK_LEAD_DAYS &&
    daysUntilTo <= MAINTENANCE_SCHEDULE_NOTIFY_DAYS
  );
}

export function formatMaintenanceScheduledMessage(
  maintenanceRecordId: number,
  equipmentName: string,
  maintenanceType: string,
  daysUntilTo: number
): string {
  return `maintenance_record:${maintenanceRecordId}|${equipmentName} — ${maintenanceType} через ${daysUntilTo} дн.`;
}

export function parseMaintenanceScheduledMessage(message: string): string {
  const m = message.match(/^maintenance_record:\d+\|(.+)$/);
  return m?.[1] ?? message;
}
