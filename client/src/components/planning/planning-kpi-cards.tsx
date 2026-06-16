import type { ProductionAnalytics } from "@/hooks/use-production-planning";
import type { ProductionPlanConflict } from "@shared/schema";
import {
  AlertTriangle,
  Factory,
  PackageX,
  Percent,
  Wrench,
  ClipboardList,
  Layers,
  FileCheck,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

type Props = {
  analytics: ProductionAnalytics | undefined;
  conflicts: ProductionPlanConflict[] | undefined;
  loading?: boolean;
};

type KpiItem = {
  label: string;
  value: string | number;
  icon: typeof ClipboardList;
  tone?: string;
};

export function PlanningKpiCards({ analytics, conflicts, loading }: Props) {
  const planFact = analytics?.planFact ?? [];
  const totalPlanned = planFact.reduce((s, r) => s + r.planned, 0);
  const totalFact = planFact.reduce((s, r) => s + r.fact, 0);
  const completionPct =
    totalPlanned > 0 ? Math.round((totalFact / totalPlanned) * 100) : 0;

  const equipmentLoad = analytics?.equipmentLoad ?? [];
  const maxMinutesPerWeek = equipmentLoad.length * 5 * 8 * 60;
  const totalPlannedMinutes = equipmentLoad.reduce((s, e) => s + e.plannedMinutes, 0);
  const loadPct =
    maxMinutesPerWeek > 0
      ? Math.min(100, Math.round((totalPlannedMinutes / maxMinutesPerWeek) * 100))
      : 0;

  const maintenanceConflicts =
    conflicts?.filter(
      (c) =>
        !c.isResolved &&
        (c.conflictType === "maintenance_overlap" || c.conflictType === "repair_overlap")
    ).length ?? 0;

  const planConflicts = conflicts?.filter((c) => !c.isResolved).length ?? 0;

  const items: KpiItem[] = [
    {
      label: "Заказов",
      value: loading ? "—" : analytics?.summary.ordersTotal ?? 0,
      icon: Layers,
    },
    {
      label: "В работе",
      value: loading ? "—" : analytics?.summary.ordersInProgress ?? 0,
      icon: ClipboardList,
      tone: "text-blue-600",
    },
    {
      label: "С риском",
      value: loading ? "—" : analytics?.atRiskOrders?.length ?? 0,
      icon: AlertTriangle,
      tone: "text-orange-600",
    },
    {
      label: "План %",
      value: loading ? "—" : `${completionPct}%`,
      icon: Percent,
      tone: "text-emerald-600",
    },
    {
      label: "Загрузка",
      value: loading ? "—" : `${loadPct}%`,
      icon: Factory,
      tone: "text-violet-600",
    },
    {
      label: "Слотов",
      value: loading ? "—" : analytics?.summary.scheduleSlots ?? 0,
      icon: TrendingUp,
    },
    {
      label: "Выпущено",
      value: loading ? "—" : analytics?.summary.totalProduced ?? 0,
      icon: FileCheck,
      tone: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Брак",
      value: loading ? "—" : analytics?.summary.totalDefective ?? 0,
      icon: AlertCircle,
      tone: "text-red-600",
    },
    {
      label: "Факт записей",
      value: loading ? "—" : analytics?.summary.factsRecorded ?? 0,
      icon: FileCheck,
    },
    {
      label: "Нехватка",
      value: loading ? "—" : analytics?.materialShortages?.length ?? 0,
      icon: PackageX,
      tone: "text-red-600",
    },
    {
      label: "Конфликты",
      value: loading ? "—" : planConflicts,
      icon: Wrench,
      tone: planConflicts > 0 ? "text-amber-600" : undefined,
    },
    {
      label: "ТОиР",
      value: loading ? "—" : maintenanceConflicts,
      icon: Wrench,
      tone: maintenanceConflicts > 0 ? "text-amber-600" : undefined,
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-1.5 rounded-md border bg-card/80 px-2 py-1 text-xs shadow-sm"
        >
          <item.icon className={`h-3.5 w-3.5 shrink-0 ${item.tone ?? "text-muted-foreground"}`} />
          <span className="text-muted-foreground whitespace-nowrap">{item.label}</span>
          <span className="font-semibold tabular-nums whitespace-nowrap">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
