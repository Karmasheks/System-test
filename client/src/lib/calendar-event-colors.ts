import type { TaskTypeCode } from "@shared/task-constants";

type ChipColors = { active: string; completed: string };

const COMPLETED =
  "bg-gray-100 text-gray-600 line-through border border-gray-300 opacity-90 dark:bg-gray-800/55 dark:text-gray-400 dark:border-gray-600";

const chip = (active: string, completed?: string): ChipColors => ({
  active,
  completed: completed ?? COMPLETED,
});

/** Мягкие, но различимые оттенки для календаря «План ТО и задач». */
export const calendarTaskTypeColors: Record<TaskTypeCode | "other", ChipColors> = {
  task: chip(
    "bg-sky-100 text-sky-950 border border-sky-400 dark:bg-sky-950/45 dark:text-sky-100 dark:border-sky-600"
  ),
  repair: chip(
    "bg-rose-100 text-rose-950 border border-rose-400 dark:bg-rose-950/45 dark:text-rose-100 dark:border-rose-600"
  ),
  diagnostics: chip(
    "bg-fuchsia-100 text-fuchsia-950 border border-fuchsia-400 dark:bg-fuchsia-950/45 dark:text-fuchsia-100 dark:border-fuchsia-600"
  ),
  maintenance: chip(
    "bg-emerald-100 text-emerald-950 border border-emerald-400 dark:bg-emerald-950/45 dark:text-emerald-100 dark:border-emerald-600"
  ),
  modernization: chip(
    "bg-violet-100 text-violet-950 border border-violet-400 dark:bg-violet-950/45 dark:text-violet-100 dark:border-violet-600"
  ),
  procurement: chip(
    "bg-yellow-100 text-yellow-950 border border-yellow-500 dark:bg-yellow-950/40 dark:text-yellow-100 dark:border-yellow-600"
  ),
  other: chip(
    "bg-zinc-200 text-zinc-800 border border-zinc-400 dark:bg-zinc-800/55 dark:text-zinc-200 dark:border-zinc-500"
  ),
};

export const calendarServiceRequestColors = chip(
  "bg-indigo-100 text-indigo-950 border border-indigo-400 dark:bg-indigo-950/45 dark:text-indigo-100 dark:border-indigo-600"
);

export const calendarRemarkColors = chip(
  "bg-orange-100 text-orange-950 border border-orange-400 dark:bg-orange-950/45 dark:text-orange-100 dark:border-orange-600"
);

export const calendarProductionColors = chip(
  "bg-teal-100 text-teal-950 border border-teal-400 dark:bg-teal-950/45 dark:text-teal-100 dark:border-teal-600"
);

export function getCalendarTaskChipClass(
  taskType: string | null | undefined,
  isCompleted: boolean
): string {
  const code = (taskType || "other") as TaskTypeCode;
  const colors = calendarTaskTypeColors[code] ?? calendarTaskTypeColors.other;
  return isCompleted ? colors.completed : colors.active;
}

export function getCalendarServiceRequestChipClass(isCompleted: boolean): string {
  return isCompleted ? calendarServiceRequestColors.completed : calendarServiceRequestColors.active;
}

export function getCalendarRemarkChipClass(isCompleted: boolean): string {
  return isCompleted ? calendarRemarkColors.completed : calendarRemarkColors.active;
}

export function getCalendarProductionChipClass(isCompleted: boolean): string {
  return isCompleted ? calendarProductionColors.completed : calendarProductionColors.active;
}

export function getCalendarMaintenanceChipClass(
  status: string,
  isCompleted: boolean
): string {
  if (isCompleted) return calendarTaskTypeColors.maintenance.completed;
  if (status === "postponed") {
    return "bg-amber-100 text-amber-950 border border-dashed border-amber-500 dark:bg-amber-950/45 dark:text-amber-100 dark:border-amber-600";
  }
  return calendarTaskTypeColors.maintenance.active;
}

/** Короткий swatch для легенды (только фон + рамка). */
export function calendarLegendSwatchClass(
  kind: keyof typeof calendarTaskTypeColors | "service_request" | "remark" | "production"
): string {
  if (kind === "service_request") return calendarServiceRequestColors.active;
  if (kind === "remark") return calendarRemarkColors.active;
  if (kind === "production") return calendarProductionColors.active;
  return calendarTaskTypeColors[kind].active;
}
