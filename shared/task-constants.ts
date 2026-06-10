export const TASK_TYPES = [
  { code: "task", label: "Задача" },
  { code: "repair", label: "Ремонт" },
  { code: "diagnostics", label: "Диагностика" },
  { code: "maintenance", label: "ТО" },
  { code: "modernization", label: "Модернизация" },
  { code: "procurement", label: "Закупка" },
  { code: "other", label: "Прочее" },
] as const;

export type TaskTypeCode = (typeof TASK_TYPES)[number]["code"];

/** Быстрые типы при создании подзадачи */
export const SUBTASK_QUICK_TYPES = [
  { code: "task", label: "Задача" },
  { code: "repair", label: "Ремонт" },
  { code: "modernization", label: "Модернизация" },
  { code: "procurement", label: "Закупка" },
  { code: "other", label: "Прочее" },
] as const;

export function taskTypeLabel(
  code: string | null | undefined,
  customLabel?: string | null
): string {
  if (!code) return "—";
  if (code === "other" && customLabel?.trim()) return customLabel.trim();
  return TASK_TYPES.find((t) => t.code === code)?.label ?? code;
}

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочный",
  critical: "Критический",
};

export function taskPriorityLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return TASK_PRIORITY_LABELS[code] ?? code;
}
