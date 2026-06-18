import type { ProductionKpiSummary, CatalogCounts } from "@/hooks/use-production-planning";
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
  Package,
  Container,
} from "lucide-react";

type Props = {
  kpi: ProductionKpiSummary | undefined;
  catalogCounts?: CatalogCounts;
  loading?: boolean;
  countsLoading?: boolean;
};

type KpiItem = {
  label: string;
  value: string | number;
  icon: typeof ClipboardList;
  tone?: string;
};

export function PlanningKpiCards({ kpi, catalogCounts, loading, countsLoading }: Props) {
  const planFact = kpi?.planFact ?? [];
  const totalPlanned = planFact.reduce((s, r) => s + r.planned, 0);
  const totalFact = planFact.reduce((s, r) => s + r.fact, 0);
  const completionPct =
    totalPlanned > 0 ? Math.round((totalFact / totalPlanned) * 100) : 0;

  const equipmentLoad = kpi?.equipmentLoad ?? [];
  const maxMinutesPerWeek = equipmentLoad.length * 5 * 8 * 60;
  const totalPlannedMinutes = equipmentLoad.reduce((s, e) => s + e.plannedMinutes, 0);
  const loadPct =
    maxMinutesPerWeek > 0
      ? Math.min(100, Math.round((totalPlannedMinutes / maxMinutesPerWeek) * 100))
      : 0;

  const planConflicts = kpi?.conflictCounts.plan ?? 0;
  const maintenanceConflicts = kpi?.conflictCounts.maintenance ?? 0;

  const productsTotal =
    catalogCounts?.productsTotal ?? kpi?.summary.productsTotal ?? 0;
  const toolingTotal = catalogCounts?.toolingTotal ?? kpi?.summary.toolingTotal ?? 0;
  const catalogBusy = countsLoading ?? loading;

  const items: KpiItem[] = [
    {
      label: "Заказов",
      value: loading ? "—" : kpi?.summary.ordersTotal ?? 0,
      icon: Layers,
    },
    {
      label: "В работе",
      value: loading ? "—" : kpi?.summary.ordersInProgress ?? 0,
      icon: ClipboardList,
      tone: "text-blue-600",
    },
    {
      label: "Видов изд.",
      value: catalogBusy ? "—" : productsTotal,
      icon: Package,
      tone: "text-sky-600",
    },
    {
      label: "Оснастка/ПФ",
      value: catalogBusy ? "—" : toolingTotal,
      icon: Container,
      tone: "text-indigo-600",
    },
    {
      label: "С риском",
      value: loading ? "—" : kpi?.atRiskOrders?.length ?? 0,
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
      value: loading ? "—" : kpi?.summary.scheduleSlots ?? 0,
      icon: TrendingUp,
    },
    {
      label: "Выпущено",
      value: loading ? "—" : kpi?.summary.totalProduced ?? 0,
      icon: FileCheck,
      tone: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Брак",
      value: loading ? "—" : kpi?.summary.totalDefective ?? 0,
      icon: AlertCircle,
      tone: "text-red-600",
    },
    {
      label: "Факт записей",
      value: loading ? "—" : kpi?.summary.factsRecorded ?? 0,
      icon: FileCheck,
    },
    {
      label: "Нехватка",
      value: loading ? "—" : kpi?.materialShortageCount ?? 0,
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
