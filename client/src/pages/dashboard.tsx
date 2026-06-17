import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { emptyTaskStats, type Task, type TaskStats } from "@/types/api";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useToast } from "@/hooks/use-toast";
import { useRemarksData, type Remark } from "@/hooks/use-remarks-data";
import { useDailyInspections } from "@/hooks/use-daily-inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Settings,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Wrench,
  Eye,
  Activity,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, isWithinInterval, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { useCalendarStats, useBudgetSummary } from "@/hooks/use-asset-management";
import { taskTypeLabel } from "@shared/task-constants";
import { taskStatusLabel } from "@shared/task-status-constants";
import { useWarehouseDashboard, useWarehouseAlerts, useWarehouseMutations } from "@/hooks/use-warehouse";
import { useServiceRequests } from "@/hooks/use-service-requests";
import { warehouseAlertLabel } from "@shared/warehouse-constants";
import { WAREHOUSE_RESOLUTION_LABELS, WAREHOUSE_RESOLUTION_TYPES } from "@shared/task-source-constants";
import { buildRecentActivities } from "@/lib/recent-activities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WarehouseAlertWithPart } from "@/hooks/use-warehouse";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { SubdivisionsPanel } from "@/components/admin/subdivisions-panel";
import {
  equipmentIdsInScope,
  filterItemsBySubdivision,
  filterBySubdivisionScope,
  filterRemarksBySubdivisionScope,
} from "@/lib/subdivision-filter";

function computeTaskStats(tasks: Task[]): TaskStats {
  return {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    overdue: tasks.filter((t) => {
      if (!t.dueDate || t.status === "completed") return false;
      return new Date(t.dueDate) < new Date();
    }).length,
  };
}

function isRemarkOpen(status: Remark["status"]) {
  return status === "open" || status === "in_progress";
}

function remarkMatchesInspection(
  remark: Remark,
  inspection: { id?: number; equipmentId: string }
) {
  return (
    remark.inspectionId === inspection.id ||
    (remark.inspectionId == null && remark.equipmentId === inspection.equipmentId)
  );
}

/** Open inspection issues: prefer live remark status, not stale inspection.issuesCount */
function deriveInspectionIssuesFromRemarks(
  inspection: {
    id?: number;
    equipmentId: string;
    issues?: number;
    issuesCount?: number;
    checkResults?: string[];
  },
  remarks: Remark[]
): number {
  const inspectionRemarks = remarks.filter(
    (r) => r.type === "inspection" && remarkMatchesInspection(r, inspection)
  );
  const openCount = inspectionRemarks.filter((r) => isRemarkOpen(r.status)).length;
  if (openCount > 0) return openCount;
  if (inspectionRemarks.length > 0) return 0;

  if (typeof inspection.issuesCount === "number" && inspection.issuesCount > 0) {
    return inspection.issuesCount;
  }
  if (inspection.issues != null && inspection.issues > 0) return inspection.issues;
  if (inspection.checkResults?.length) {
    return inspection.checkResults.filter((r) => r === "issue" || r === "critical").length;
  }
  return 0;
}

function DashKpi({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
  className,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
  className?: string;
  valueClassName?: string;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-3 min-w-0",
        onClick && "hover:bg-accent/50 transition-colors text-left w-full",
        className
      )}
    >
      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground leading-snug text-multiline">{label}</span>
      </div>
      <p className={cn("text-lg font-bold tabular-nums leading-tight", valueClassName)}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug text-multiline">{hint}</p>}
    </Wrapper>
  );
}

function ScheduledWorkRow({
  task,
  equipmentLabel,
  overdue,
  onClick,
}: {
  task: Task;
  equipmentLabel: string;
  overdue?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-2 rounded-md border text-sm transition-colors hover:bg-accent/40",
        overdue && "border-red-200 bg-red-50/80 dark:bg-red-950/20 dark:border-red-900"
      )}
    >
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-multiline">{task.title}</p>
          <p className="text-xs text-muted-foreground text-multiline">
            {equipmentLabel} · {taskTypeLabel(task.taskType, task.maintenanceType)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs tabular-nums">
            {format(new Date(task.dueDate!), "dd.MM", { locale: ru })}
          </p>
          {overdue ? (
            <Badge variant="destructive" className="text-[10px] mt-0.5">Просрочено</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] mt-0.5">
              {taskStatusLabel(task.status)}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { isDashboardBlockVisible, isAdmin } = useAccessControl();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
    allowAllOption,
  } = useSubdivisionFilter();
  const { toast } = useToast();
  const { equipment: equipmentList, getActiveEquipment } = useEquipmentApi();
  const { remarks } = useRemarksData();
  const { getTodayInspections, refetch: refetchInspections } = useDailyInspections();
  const [, setLocation] = useLocation();

  // Загрузка статистики задач
  const { data: taskStats = emptyTaskStats, refetch: refetchTaskStats } = useQuery<TaskStats>({
    queryKey: ["/api/tasks/stats"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const calFrom = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const calTo = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const { data: calStats } = useCalendarStats(calFrom, calTo);
  const { data: budgetSummary } = useBudgetSummary(undefined, filterSubdivisionId, {
    enabled: filterSubdivisionId != null,
  });
  const { data: serviceRequests = [] } = useServiceRequests();
  const { data: warehouseStats } = useWarehouseDashboard();
  const { data: warehouseAlerts = [] } = useWarehouseAlerts();
  const { resolveAlert } = useWarehouseMutations();
  const [resolveAlertTarget, setResolveAlertTarget] = useState<WarehouseAlertWithPart | null>(null);
  const [resolveForm, setResolveForm] = useState({ resolutionType: "restocked", comment: "" });

  const scopedEquipment = useMemo(
    () => filterItemsBySubdivision(getActiveEquipment(), filterSubdivisionId),
    [equipmentList, filterSubdivisionId, getActiveEquipment]
  );

  const scopedEquipmentIds = useMemo(
    () => equipmentIdsInScope(getActiveEquipment(), filterSubdivisionId, null),
    [equipmentList, filterSubdivisionId, getActiveEquipment]
  );

  const scopedTasks = useMemo(
    () => filterBySubdivisionScope(tasks, filterSubdivisionId, scopedEquipmentIds),
    [tasks, filterSubdivisionId, scopedEquipmentIds]
  );

  const scopedTaskStats = useMemo(() => {
    if (filterSubdivisionId == null) return taskStats;
    return computeTaskStats(scopedTasks);
  }, [filterSubdivisionId, taskStats, scopedTasks]);

  const scopedRemarks = useMemo(() => {
    if (filterSubdivisionId == null) return remarks;
    return filterRemarksBySubdivisionScope(remarks, filterSubdivisionId, scopedEquipmentIds);
  }, [remarks, scopedEquipmentIds, filterSubdivisionId]);

  const maintenanceTasks = useMemo(
    () =>
      scopedTasks.filter(
        (t) => t.taskType === "maintenance" && t.dueDate
      ),
    [scopedTasks]
  );

  const repairTasks = useMemo(
    () => scopedTasks.filter((t) => t.taskType === "repair" && t.dueDate),
    [scopedTasks]
  );

  const scopedServiceRequests = useMemo(
    () => filterBySubdivisionScope(serviceRequests, filterSubdivisionId, scopedEquipmentIds),
    [serviceRequests, filterSubdivisionId, scopedEquipmentIds]
  );

  const scopedWarehouseAlerts = useMemo(
    () =>
      warehouseAlerts.filter((a) =>
        filterSubdivisionId == null
          ? true
          : a.part?.subdivisionId === filterSubdivisionId
      ),
    [warehouseAlerts, filterSubdivisionId]
  );

  const scopedCalStats = useMemo(() => {
    if (filterSubdivisionId == null && calStats) return calStats;
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const inMonth = (d: string | Date | null | undefined) => {
      if (!d) return false;
      const dt = new Date(d);
      return isWithinInterval(dt, { start: monthStart, end: monthEnd });
    };
    const taskEvents = scopedTasks.filter((t) => inMonth(t.dueDate));
    const remarkEvents = scopedRemarks.filter((r) => inMonth(r.createdAt));
    const srEvents = scopedServiceRequests.filter((r) =>
      inMonth(r.plannedDate ?? r.createdAt)
    );
    const completed = [
      ...taskEvents.filter((t) => t.status === "completed"),
      ...srEvents.filter((r) => ["done", "closed"].includes(r.status)),
    ].length;
    const pending = [
      ...taskEvents.filter((t) => t.status === "pending" || t.status === "in_progress"),
      ...remarkEvents.filter((r) => r.status === "open" || r.status === "in_progress"),
      ...srEvents.filter((r) => ["new", "assigned", "in_progress"].includes(r.status)),
    ].length;
    return {
      planned: taskEvents.length + remarkEvents.length + srEvents.length,
      completed,
      pending,
      total: taskEvents.length + remarkEvents.length + srEvents.length,
    };
  }, [
    filterSubdivisionId,
    calStats,
    scopedTasks,
    scopedRemarks,
    scopedServiceRequests,
  ]);

  const warehouseAlertCount =
    filterSubdivisionId != null
      ? scopedWarehouseAlerts.length
      : (warehouseStats?.unresolvedAlerts ?? scopedWarehouseAlerts.length);

  const upcomingTasks = useMemo(() => {
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);
    return scopedTasks
      .filter((task) => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        return dueDate >= now && dueDate <= threeDaysFromNow && task.status !== "completed";
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  }, [scopedTasks]);

  const equipmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const eq of equipmentList) {
      map.set(eq.id, eq.name);
    }
    return map;
  }, [equipmentList]);

  const overdueMaintenance = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return maintenanceTasks
      .filter((task) => {
        if (task.status === "completed" || task.status === "cancelled") return false;
        return new Date(task.dueDate!) < now;
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 3);
  }, [maintenanceTasks]);

  const upcomingMaintenance = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const horizon = addDays(now, 14);
    return maintenanceTasks
      .filter((task) => {
        const date = new Date(task.dueDate!);
        return date >= now && date <= horizon && task.status !== "completed";
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 4);
  }, [maintenanceTasks]);

  const overdueRepairs = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return repairTasks
      .filter((task) => {
        if (task.status === "completed" || task.status === "cancelled") return false;
        return new Date(task.dueDate!) < now;
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 3);
  }, [repairTasks]);

  const upcomingRepairs = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const horizon = addDays(now, 14);
    return repairTasks
      .filter((task) => {
        const date = new Date(task.dueDate!);
        return date >= now && date <= horizon && task.status !== "completed";
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 4);
  }, [repairTasks]);

  const todayInspectionsInScope = useMemo(() => {
    const today = getTodayInspections();
    return today.filter((i) => scopedEquipmentIds.has(i.equipmentId));
  }, [getTodayInspections, scopedEquipmentIds]);

  const dailyInspectionData = useMemo(() => {
    const equipmentTotal = scopedEquipment.length;
    const uniqueEquipmentIds = new Set(todayInspectionsInScope.map((i) => i.equipmentId));
    const deriveWorking = (inspection: (typeof todayInspectionsInScope)[0]) => {
      const ws = (inspection as { workingStatus?: string }).workingStatus;
      if (ws) return ws;
      const results = (inspection as { checkResults?: string[] }).checkResults;
      if (results?.some((r) => r === "critical")) return "not_working";
      if (results?.some((r) => r === "issue")) return "maintenance";
      return "working";
    };
    const totalInspected = uniqueEquipmentIds.size;
    return {
      total: equipmentTotal,
      inspected: totalInspected,
      notWorking: todayInspectionsInScope.filter((i) => deriveWorking(i) === "not_working").length,
      onMaintenance: todayInspectionsInScope.filter((i) => deriveWorking(i) === "maintenance").length,
      working: todayInspectionsInScope.filter((i) => deriveWorking(i) === "working").length,
      issues: todayInspectionsInScope.reduce(
        (sum, i) => sum + deriveInspectionIssuesFromRemarks(i, scopedRemarks),
        0
      ),
      progress:
        equipmentTotal > 0 ? Math.round((totalInspected / equipmentTotal) * 100) : 0,
    };
  }, [todayInspectionsInScope, scopedEquipment.length, scopedRemarks]);

  useEffect(() => {
    const handleTaskChange = () => {
      refetchTaskStats();
    };

    const handleInspectionChange = () => {
      refetchInspections();
    };

    window.addEventListener("taskUpdated", handleTaskChange);
    window.addEventListener("taskCreated", handleTaskChange);
    window.addEventListener("taskDeleted", handleTaskChange);
    window.addEventListener("dailyInspectionsUpdated", handleInspectionChange);

    return () => {
      window.removeEventListener("taskUpdated", handleTaskChange);
      window.removeEventListener("taskCreated", handleTaskChange);
      window.removeEventListener("taskDeleted", handleTaskChange);
      window.removeEventListener("dailyInspectionsUpdated", handleInspectionChange);
    };
  }, [refetchTaskStats, refetchInspections]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated()) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const activeEquipment = scopedEquipment;
  const typeCounts = activeEquipment.reduce<Record<string, number>>((acc, eq) => {
    const type = (eq.type || "Без типа").trim();
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const equipmentData = {
    total: activeEquipment.length,
    active: activeEquipment.filter((eq) => eq.status === "active").length,
    maintenance: activeEquipment.filter((eq) => eq.status === "maintenance").length,
    repair: activeEquipment.filter((eq) => eq.status === "repair").length,
    inactive: activeEquipment.filter((eq) => eq.status === "inactive").length,
    categories: typeCounts,
  };

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const monthLabel = format(new Date(), "LLLL yyyy", { locale: ru });
  const thisMonthMaintenance = maintenanceTasks.filter((task) =>
    isWithinInterval(new Date(task.dueDate!), { start: monthStart, end: monthEnd })
  );

  const thisMonthRepairs = repairTasks.filter((task) =>
    isWithinInterval(new Date(task.dueDate!), { start: monthStart, end: monthEnd })
  );

  const openRepairRequests = scopedServiceRequests.filter(
    (r) =>
      (r.requestType === "repair" || r.requestType === "diagnostics") &&
      !["closed", "cancelled", "duplicate", "not_needed"].includes(r.status)
  );

  const overdueWorkCount =
    maintenanceTasks.filter((t) => {
      if (t.status === "completed" || t.status === "cancelled" || !t.dueDate) return false;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return new Date(t.dueDate) < now;
    }).length +
    repairTasks.filter((t) => {
      if (t.status === "completed" || t.status === "cancelled" || !t.dueDate) return false;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return new Date(t.dueDate) < now;
    }).length;

  const maintenanceTypesThisMonth = thisMonthMaintenance.reduce<Record<string, number>>((acc, task) => {
    const typeLabel = taskTypeLabel(task.taskType, task.maintenanceType);
    acc[typeLabel] = (acc[typeLabel] || 0) + 1;
    return acc;
  }, {});

  const openRemarksCount = scopedRemarks.filter((r) => isRemarkOpen(r.status)).length;
  const openNonInspectionRemarksCount = scopedRemarks.filter(
    (r) => r.type !== "inspection" && isRemarkOpen(r.status)
  ).length;
  const criticalRemarksCount = scopedRemarks.filter(
    (r) =>
      r.priority === "critical" &&
      r.status !== "resolved" &&
      r.status !== "closed"
  ).length;

  const recentActivities = buildRecentActivities({
    remarks: scopedRemarks,
    tasks: scopedTasks,
    serviceRequests: scopedServiceRequests,
    inspectionSummary: {
      inspected: dailyInspectionData.inspected,
      total: dailyInspectionData.total,
    },
    limit: 6,
  });

  const hasAttentionAlerts =
    warehouseAlertCount > 0 ||
    dailyInspectionData.notWorking > 0 ||
    dailyInspectionData.issues > 0 ||
    openRemarksCount > 0 ||
    scopedTaskStats.overdue > 0 ||
    overdueWorkCount > 0;

  const taskEquipmentLabel = (equipmentId: string | null | undefined) =>
    equipmentId ? equipmentNameById.get(equipmentId) ?? equipmentId : "Без оборудования";

  const showPlanWork =
    isDashboardBlockVisible("dash_maintenance_types") ||
    isDashboardBlockVisible("dash_upcoming_tasks");
  const showMaintenanceTypesDetail =
    isDashboardBlockVisible("dash_maintenance_types") &&
    Object.keys(maintenanceTypesThisMonth).length > 0;
  const showEquipmentTypesDetail = isDashboardBlockVisible("dash_equipment_types");
  const showDetailsBlock = showEquipmentTypesDetail || showMaintenanceTypesDetail;
  const showRecentActivities = isDashboardBlockVisible("dash_recent_activities");
  const showInspection = isDashboardBlockVisible("dash_inspection_progress");
  const showTasksStats = isDashboardBlockVisible("dash_tasks_stats");
  const showLeftColumn = showPlanWork || showDetailsBlock || showRecentActivities;
  const showRightColumn = showInspection || showTasksStats;

  return (
    <>
      <Helmet>
        <title>Панель управления - Система управления оборудованием</title>
        <meta name="description" content="Общий обзор состояния оборудования, технического обслуживания и ежедневных осмотров" />
      </Helmet>
      <div className="p-4 lg:p-6 w-full min-w-0 space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Панель управления</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {user.name} · {format(new Date(), "d MMMM yyyy", { locale: ru })}
              {filterSubdivisionId != null && ` · ${filterLabel}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && <SubdivisionsPanel />}
            {showFilter && (
              <SubdivisionFilterSelect
                inline
                value={filterValue}
                onChange={setFilterValue}
                subdivisions={availableSubdivisions}
                showAll={allowAllOption}
                className="w-full sm:w-48 md:w-56"
              />
            )}
          </div>
        </div>

        {isDashboardBlockVisible("dash_main_metrics") && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <DashKpi
              icon={Settings}
              label="Оборудование"
              value={equipmentData.total}
              hint={`${equipmentData.active} активно`}
              onClick={() => setLocation("/equipment")}
            />
            <DashKpi
              icon={Calendar}
              label="На ТО"
              value={equipmentData.maintenance}
              valueClassName="text-emerald-600"
              onClick={() => setLocation("/equipment")}
            />
            <DashKpi
              icon={Wrench}
              label="В ремонте"
              value={equipmentData.repair}
              valueClassName="text-rose-600"
              hint={openRepairRequests.length > 0 ? `${openRepairRequests.length} заявок` : undefined}
              onClick={() => setLocation("/service-requests")}
            />
            <DashKpi
              icon={Eye}
              label="Осмотры"
              value={`${dailyInspectionData.inspected}/${dailyInspectionData.total}`}
              hint={`${dailyInspectionData.progress}% сегодня`}
              onClick={() => setLocation("/daily-inspection")}
            />
            <DashKpi
              icon={CheckCircle}
              label="Задачи"
              value={scopedTaskStats.pending + scopedTaskStats.inProgress}
              hint={
                scopedTaskStats.overdue > 0
                  ? `${scopedTaskStats.overdue} просрочено`
                  : `${scopedTaskStats.completed} выполнено`
              }
              valueClassName={scopedTaskStats.overdue > 0 ? "text-red-600" : undefined}
              onClick={() => setLocation("/tasks")}
            />
            <DashKpi
              icon={AlertTriangle}
              label="Замечания"
              value={openRemarksCount}
              hint={criticalRemarksCount > 0 ? `${criticalRemarksCount} критичных` : "открыты"}
              valueClassName={openRemarksCount > 0 ? "text-amber-600" : undefined}
              onClick={() => setLocation("/tasks?section=remarks")}
            />
          </div>
        )}

        {(isDashboardBlockVisible("dash_calendar_stats") ||
          (isDashboardBlockVisible("dash_budget_total") && filterSubdivisionId != null)) && (
          <div className="flex flex-wrap gap-2">
            {isDashboardBlockVisible("dash_calendar_stats") && (
              <Card className="flex-1 min-w-[200px]">
                <CardContent className="py-3 px-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium text-foreground">План {monthLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                    <span>
                      <span className="text-muted-foreground">план </span>
                      <strong>{scopedCalStats?.planned ?? 0}</strong>
                    </span>
                    <span>
                      <span className="text-muted-foreground">готово </span>
                      <strong className="text-green-600">{scopedCalStats?.completed ?? 0}</strong>
                    </span>
                    <span>
                      <span className="text-muted-foreground">ждут </span>
                      <strong className="text-orange-600">{scopedCalStats?.pending ?? 0}</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
            {isDashboardBlockVisible("dash_budget_total") && filterSubdivisionId != null && (
              <Card className="min-w-[140px]">
                <CardContent className="py-3 px-4">
                  <p className="text-[11px] text-muted-foreground">
                    Бюджет · {filterLabel}
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {(budgetSummary?.total ?? 0).toLocaleString("ru")} ₽
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {isDashboardBlockVisible("dash_attention") && hasAttentionAlerts && (
          <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1 mr-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Внимание
                </span>
                {warehouseAlertCount > 0 && isDashboardBlockVisible("dash_warehouse_alerts") && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLocation("/warehouse")}>
                    Склад: {warehouseAlertCount}
                  </Button>
                )}
                {dailyInspectionData.notWorking > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-200 text-red-700"
                    onClick={() => setLocation("/daily-inspection")}
                  >
                    Не работает: {dailyInspectionData.notWorking}
                  </Button>
                )}
                {dailyInspectionData.issues > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setLocation("/tasks?section=remarks")}
                  >
                    Проблемы осмотра: {dailyInspectionData.issues}
                  </Button>
                )}
                {openNonInspectionRemarksCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setLocation("/tasks?section=remarks")}
                  >
                    Замечания: {openNonInspectionRemarksCount}
                  </Button>
                )}
                {scopedTaskStats.overdue > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-200 text-red-700"
                    onClick={() => setLocation("/tasks")}
                  >
                    Просроченные задачи: {scopedTaskStats.overdue}
                  </Button>
                )}
                {overdueWorkCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-200 text-red-700"
                    onClick={() => setLocation("/schedule")}
                  >
                    Просрочено ТО/ремонт: {overdueWorkCount}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isDashboardBlockVisible("dash_warehouse_alerts") && warehouseAlertCount > 0 && (
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Склад ({warehouseAlertCount})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1.5">
              {scopedWarehouseAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 p-2 rounded-md border text-sm",
                    alert.alertType === "zero_stock"
                      ? "bg-red-50 border-red-200 dark:bg-red-950/30"
                      : "bg-amber-50 border-amber-200 dark:bg-amber-950/30"
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-multiline">{alert.part?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {warehouseAlertLabel(alert.alertType)} · {alert.part?.quantity ?? 0} / мин {alert.part?.minStock ?? 0}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setLocation("/warehouse")}>
                      Склад
                    </Button>
                    <Button
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        setResolveAlertTarget(alert);
                        setResolveForm({ resolutionType: "restocked", comment: "" });
                      }}
                    >
                      Решено
                    </Button>
                  </div>
                </div>
              ))}
              {warehouseAlertCount > 4 && (
                <Button variant="link" size="sm" className="h-7 px-0" onClick={() => setLocation("/warehouse")}>
                  Все оповещения ({warehouseAlertCount})
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {(showLeftColumn || showRightColumn) && (
        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            showLeftColumn && showRightColumn && "lg:grid-cols-12"
          )}
        >
          {showLeftColumn && (
          <div
            className={cn(
              "space-y-4",
              showRightColumn ? "lg:col-span-7" : "lg:col-span-12"
            )}
          >
              {showPlanWork && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold">План работ</CardTitle>
                    <div className="flex gap-2 text-xs">
                      {isDashboardBlockVisible("dash_main_metrics") && (
                        <>
                          <Badge variant="outline" className="text-emerald-700">
                            ТО {monthLabel}: {thisMonthMaintenance.length}
                          </Badge>
                          <Badge variant="outline" className="text-rose-700">
                            Ремонт: {thisMonthRepairs.length}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  {isDashboardBlockVisible("dash_maintenance_types") && (
                    <>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          ТО · 14 дней
                        </p>
                        <div className="space-y-1.5">
                          {overdueMaintenance.map((task) => (
                            <ScheduledWorkRow
                              key={`mo-${task.id}`}
                              task={task}
                              equipmentLabel={taskEquipmentLabel(task.equipmentId)}
                              overdue
                              onClick={() => setLocation("/schedule")}
                            />
                          ))}
                          {upcomingMaintenance.map((task) => (
                            <ScheduledWorkRow
                              key={task.id}
                              task={task}
                              equipmentLabel={taskEquipmentLabel(task.equipmentId)}
                              onClick={() => setLocation("/schedule")}
                            />
                          ))}
                          {overdueMaintenance.length === 0 && upcomingMaintenance.length === 0 && (
                            <p className="text-xs text-muted-foreground py-1">Нет запланированного ТО</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          Ремонт · 14 дней
                        </p>
                        <div className="space-y-1.5">
                          {overdueRepairs.map((task) => (
                            <ScheduledWorkRow
                              key={`ro-${task.id}`}
                              task={task}
                              equipmentLabel={taskEquipmentLabel(task.equipmentId)}
                              overdue
                              onClick={() => setLocation("/tasks")}
                            />
                          ))}
                          {upcomingRepairs.map((task) => (
                            <ScheduledWorkRow
                              key={task.id}
                              task={task}
                              equipmentLabel={taskEquipmentLabel(task.equipmentId)}
                              onClick={() => setLocation("/tasks")}
                            />
                          ))}
                          {overdueRepairs.length === 0 && upcomingRepairs.length === 0 && (
                            <p className="text-xs text-muted-foreground py-1">Нет запланированных ремонтов</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  {isDashboardBlockVisible("dash_upcoming_tasks") && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Задачи · 3 дня
                      </p>
                      <div className="space-y-1.5">
                        {upcomingTasks.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">Нет срочных задач</p>
                        ) : (
                          upcomingTasks.slice(0, 4).map((task) => (
                            <ScheduledWorkRow
                              key={task.id}
                              task={task}
                              equipmentLabel={taskEquipmentLabel(task.equipmentId)}
                              onClick={() => setLocation("/tasks")}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full h-8" onClick={() => setLocation("/schedule")}>
                    Календарь и план
                  </Button>
                </CardContent>
              </Card>
              )}

              {(showDetailsBlock || showRecentActivities) && (
              <div
                className={cn(
                  "grid gap-3",
                  showDetailsBlock && showRecentActivities && "grid-cols-1 sm:grid-cols-2"
                )}
              >
                {showDetailsBlock && (
                  <Card className="min-w-0">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm">Детализация</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-3 max-h-[220px] overflow-y-auto">
                      {showEquipmentTypesDetail && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            Оборудование по типам
                          </p>
                          <div className="space-y-1">
                            {Object.entries(equipmentData.categories)
                              .sort(([, a], [, b]) => b - a)
                              .slice(0, 6)
                              .map(([category, count]) => (
                                <div key={category} className="flex justify-between text-xs gap-2">
                                  <span className="text-multiline">{category}</span>
                                  <Badge variant="outline" className="shrink-0 h-5 text-[10px]">
                                    {count}
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {showMaintenanceTypesDetail && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 capitalize">
                            ТО по типам · {monthLabel}
                          </p>
                          <div className="space-y-1">
                            {Object.entries(maintenanceTypesThisMonth).map(([type, count]) => (
                              <div key={type} className="flex justify-between text-xs gap-2">
                                <span className="text-multiline">{type}</span>
                                <Badge variant="outline" className="shrink-0 h-5 text-[10px]">
                                  {count}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
                {showRecentActivities && (
                  <Card className="min-w-0">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        События
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-2 max-h-[220px] overflow-y-auto">
                      {recentActivities.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Нет недавних событий</p>
                      ) : (
                        recentActivities.map((activity) => (
                          <button
                            key={activity.id}
                            type="button"
                            disabled={!activity.link}
                            onClick={() => activity.link && setLocation(activity.link)}
                            className={cn(
                              "w-full text-left flex gap-2 rounded-md p-1.5 -mx-1.5",
                              activity.link && "hover:bg-accent/50"
                            )}
                          >
                            <activity.icon
                              className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", activity.color)}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-medium leading-snug text-multiline">
                                {activity.message}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{activity.time}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
              )}
          </div>
          )}

          {showRightColumn && (
          <div
            className={cn(
              "space-y-4",
              showLeftColumn ? "lg:col-span-5" : "lg:col-span-12"
            )}
          >
            {showInspection && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Осмотры · {format(new Date(), "d MMM", { locale: ru })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span>{dailyInspectionData.inspected} из {dailyInspectionData.total}</span>
                    <span className="text-muted-foreground">{dailyInspectionData.progress}%</span>
                  </div>
                  <Progress value={dailyInspectionData.progress} className="h-1.5" />
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-base font-bold tabular-nums">{dailyInspectionData.inspected}</p>
                      <p className="text-[10px] text-muted-foreground">осмотрено</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-blue-600">{dailyInspectionData.working}</p>
                      <p className="text-[10px] text-muted-foreground">работает</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-amber-600">{dailyInspectionData.onMaintenance}</p>
                      <p className="text-[10px] text-muted-foreground">на ТО</p>
                    </div>
                    <div>
                      <p className="text-base font-bold tabular-nums text-red-600">{dailyInspectionData.notWorking}</p>
                      <p className="text-[10px] text-muted-foreground">не работает</p>
                    </div>
                  </div>
                  {dailyInspectionData.issues > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-red-700 border-red-200"
                      onClick={() => setLocation("/tasks?section=remarks")}
                    >
                      Проблемы: {dailyInspectionData.issues}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8"
                    onClick={() => setLocation("/daily-inspection")}
                  >
                    Открыть осмотры
                  </Button>
                </CardContent>
              </Card>
            )}

            {showTasksStats && (
              <Card
                className="cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setLocation("/tasks")}
              >
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Задачи
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-4 gap-2 text-center mb-3">
                    <div>
                      <p className="text-lg font-bold">{scopedTaskStats.total}</p>
                      <p className="text-[10px] text-muted-foreground">всего</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-600">{scopedTaskStats.completed}</p>
                      <p className="text-[10px] text-muted-foreground">готово</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{scopedTaskStats.pending}</p>
                      <p className="text-[10px] text-muted-foreground">ожидают</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-600">{scopedTaskStats.overdue}</p>
                      <p className="text-[10px] text-muted-foreground">просрочено</p>
                    </div>
                  </div>
                  <Progress
                    value={
                      scopedTaskStats.total > 0
                        ? (scopedTaskStats.completed / scopedTaskStats.total) * 100
                        : 0
                    }
                    className="h-1.5"
                  />
                </CardContent>
              </Card>
            )}
          </div>
          )}
        </div>
        )}
      </div>
      <Dialog open={!!resolveAlertTarget} onOpenChange={(open) => !open && setResolveAlertTarget(null)}>
        {resolveAlertTarget ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Решение проблемы склада</DialogTitle>
          </DialogHeader>
          {resolveAlertTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {resolveAlertTarget.part?.name} — {warehouseAlertLabel(resolveAlertTarget.alertType)}
              </p>
              <div>
                <Label>Тип решения</Label>
                <Select
                  value={resolveForm.resolutionType}
                  onValueChange={(v) => setResolveForm((f) => ({ ...f, resolutionType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAREHOUSE_RESOLUTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {WAREHOUSE_RESOLUTION_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Комментарий</Label>
                <Textarea
                  rows={3}
                  value={resolveForm.comment}
                  onChange={(e) => setResolveForm((f) => ({ ...f, comment: e.target.value }))}
                  placeholder="Опишите, что было сделано..."
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Решит: {user?.name} · {format(new Date(), "dd.MM.yyyy HH:mm", { locale: ru })}
              </div>
              <Button
                className="w-full"
                disabled={resolveAlert.isPending}
                onClick={() => {
                  if (!resolveAlertTarget) return;
                  resolveAlert.mutate(
                    {
                      alertId: resolveAlertTarget.id,
                      resolutionType: resolveForm.resolutionType,
                      comment: resolveForm.comment,
                    },
                    {
                      onSuccess: () => {
                        setResolveAlertTarget(null);
                        toast({ title: "Проблема склада решена" });
                      },
                    }
                  );
                }}
              >
                Сохранить решение
              </Button>
            </div>
          )}
        </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}