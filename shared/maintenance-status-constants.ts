export const MAINTENANCE_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "overdue",
  "cancelled",
  "unplanned",
  "postponed",
] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scheduled: "Запланировано",
  in_progress: "В работе",
  completed: "Выполнено",
  overdue: "Просрочено",
  cancelled: "Отменено",
  unplanned: "Не запланировано",
  postponed: "Отложено",
};

export function maintenanceStatusLabel(status: string): string {
  return MAINTENANCE_STATUS_LABELS[status as MaintenanceStatus] ?? status;
}
