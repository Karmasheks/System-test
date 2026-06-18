/** За сколько дней до даты ТО формируется задача на выполнение. */
export const MAINTENANCE_TASK_LEAD_DAYS = 3;

export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Дата задачи на ТО = дата ТО минус lead days. */
export function maintenanceTaskDueDate(scheduledDate: Date): Date {
  const d = startOfLocalDay(scheduledDate);
  d.setDate(d.getDate() - MAINTENANCE_TASK_LEAD_DAYS);
  return d;
}

/** Задача на ТО создаётся, когда наступил день lead (T−3). */
export function shouldCreateMaintenanceTaskNow(scheduledDate: Date): boolean {
  const today = startOfLocalDay(new Date());
  const due = maintenanceTaskDueDate(scheduledDate);
  return today >= due;
}

export function formatMaintenanceDateRu(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}
