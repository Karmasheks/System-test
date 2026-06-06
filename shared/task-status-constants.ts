export const TASK_STATUSES = ["pending", "in_progress", "completed", "overdue", "cancelled"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Ожидает",
  in_progress: "В работе",
  completed: "Завершена",
  overdue: "Просрочена",
  cancelled: "Отменена",
};

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status as TaskStatus] ?? status;
}
