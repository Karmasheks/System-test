import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const TOOLING_STATUS_LABELS: Record<string, string> = {
  ok: "Исправная",
  in_production: "В работе / выпуск",
  maintenance_completed: "Выполнено ТО",
  storage: "Хранение на складе",
  conservation: "На консервации",
  repair: "ПФ на доработке",
  testing: "Испытания",
  maintenance_due: "Требуется ТО",
  on_maintenance: "На ТО",
  decommissioned: "Списана",
};

/** Цвета статуса в списке и карточке (как в реестре Excel). */
export const TOOLING_STATUS_CLASS: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100",
  in_production: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-100",
  maintenance_completed: "bg-lime-100 text-lime-900 border-lime-300 dark:bg-lime-950 dark:text-lime-100",
  storage: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100",
  conservation: "bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-950 dark:text-amber-100",
  repair: "bg-yellow-100 text-yellow-900 border-yellow-400 dark:bg-yellow-950 dark:text-yellow-100",
  testing: "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950 dark:text-violet-100",
  maintenance_due: "bg-orange-100 text-orange-950 border-orange-400 dark:bg-orange-950 dark:text-orange-100",
  on_maintenance: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100",
  decommissioned: "bg-gray-200 text-gray-700 border-gray-400 dark:bg-gray-800 dark:text-gray-300",
};

export function toolingStatusLabel(status: string): string {
  return TOOLING_STATUS_LABELS[status] ?? status;
}

export function toolingStatusClass(status: string): string {
  return TOOLING_STATUS_CLASS[status] ?? "bg-muted text-foreground border-border";
}

export function percentUsageClass(percent: number | null): string {
  if (percent == null) return "";
  if (percent >= 90) return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100";
  if (percent >= 70) return "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100";
  return "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100";
}

export function plannedDateClass(isoDate: string | Date | null | undefined): string {
  if (!isoDate) return "";
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = (target.getTime() - today.getTime()) / (86400000);
  if (diffDays < 0) return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100";
  if (diffDays <= 14) return "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100";
  return "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100";
}

/** Цвет даты «След. ТО»: красный при просрочке по наработке или по дате. */
export function nextMaintenanceDateClass(
  isoDate: string | Date | null | undefined,
  maintenanceDue?: boolean
): string {
  if (maintenanceDue) return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100";
  return plannedDateClass(isoDate);
}

export function ToolingStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", toolingStatusClass(status))}>
      {toolingStatusLabel(status)}
    </Badge>
  );
}

export function PercentCell({
  value,
  suffix = "%",
}: {
  value: number | null;
  suffix?: string;
}) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-center text-xs tabular-nums",
        percentUsageClass(value)
      )}
    >
      {value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
      {suffix}
    </span>
  );
}
