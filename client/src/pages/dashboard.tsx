import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { emptyTaskStats, type Task, type TaskStats } from "@/types/api";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useToast } from "@/hooks/use-toast";
import { useRemarksData } from "@/hooks/use-remarks-data";
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
  Users, 
  Wrench,
  Eye,
  TrendingUp,
  Activity,
  BarChart3,
  XCircle,
  Package
} from "lucide-react";
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
  const { data: budgetSummary } = useBudgetSummary();
  const { data: serviceRequests = [] } = useServiceRequests();
  const { data: warehouseStats } = useWarehouseDashboard();
  const { data: warehouseAlerts = [] } = useWarehouseAlerts();
  const { resolveAlert } = useWarehouseMutations();
  const [resolveAlertTarget, setResolveAlertTarget] = useState<WarehouseAlertWithPart | null>(null);
  const [resolveForm, setResolveForm] = useState({ resolutionType: "restocked", comment: "" });

  const { data: usersList = [] } = useQuery<{ id: number; subdivisionId?: number | null }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const scopedEquipment = useMemo(
    () => filterItemsBySubdivision(getActiveEquipment(), filterSubdivisionId),
    [equipmentList, filterSubdivisionId, getActiveEquipment]
  );

  const scopedEquipmentIds = useMemo(
    () => equipmentIdsInScope(getActiveEquipment(), filterSubdivisionId, null),
    [equipmentList, filterSubdivisionId, getActiveEquipment]
  );

  const scopedTasks = useMemo(
    () => filterItemsBySubdivision(tasks, filterSubdivisionId),
    [tasks, filterSubdivisionId]
  );

  const scopedTaskStats = useMemo(() => {
    if (filterSubdivisionId == null) return taskStats;
    return computeTaskStats(scopedTasks);
  }, [filterSubdivisionId, taskStats, scopedTasks]);

  const scopedRemarks = useMemo(
    () =>
      remarks.filter(
        (r) =>
          scopedEquipmentIds.has(r.equipmentId) ||
          (r as { subdivisionId?: number }).subdivisionId === filterSubdivisionId
      ),
    [remarks, scopedEquipmentIds, filterSubdivisionId]
  );

  const maintenanceTasks = useMemo(
    () =>
      scopedTasks.filter(
        (t) => t.taskType === "maintenance" && t.dueDate
      ),
    [scopedTasks]
  );

  const scopedServiceRequests = useMemo(
    () => filterItemsBySubdivision(serviceRequests, filterSubdivisionId),
    [serviceRequests, filterSubdivisionId]
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

  const scopedUsers = useMemo(() => {
    if (filterSubdivisionId == null) return usersList;
    return usersList.filter((u) => u.subdivisionId === filterSubdivisionId);
  }, [usersList, filterSubdivisionId]);

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
      .slice(0, 6);
  }, [maintenanceTasks]);

  const todayInspectionsInScope = useMemo(() => {
    const today = getTodayInspections();
    return today.filter((i) => scopedEquipmentIds.has(i.equipmentId));
  }, [getTodayInspections, scopedEquipmentIds]);

  const dailyInspectionData = useMemo(() => {
    const equipmentTotal = scopedEquipment.length;
    const uniqueEquipmentIds = new Set(todayInspectionsInScope.map((i) => i.equipmentId));
    const deriveIssues = (inspection: (typeof todayInspectionsInScope)[0]) => {
      if (inspection.issues != null && inspection.issues > 0) return inspection.issues;
      const results = (inspection as { checkResults?: string[] }).checkResults;
      if (results?.length) return results.filter((r) => r === "issue" || r === "critical").length;
      return 0;
    };
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
      issues: todayInspectionsInScope.reduce((sum, i) => sum + deriveIssues(i), 0),
      progress:
        equipmentTotal > 0 ? Math.round((totalInspected / equipmentTotal) * 100) : 0,
    };
  }, [todayInspectionsInScope, scopedEquipment.length]);

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
    inactive: activeEquipment.filter((eq) => eq.status === "inactive").length,
    categories: typeCounts,
  };

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const monthLabel = format(new Date(), "LLLL yyyy", { locale: ru });
  const thisMonthMaintenance = maintenanceTasks.filter((task) =>
    isWithinInterval(new Date(task.dueDate!), { start: monthStart, end: monthEnd })
  );

  const maintenanceTypesThisMonth = thisMonthMaintenance.reduce<Record<string, number>>((acc, task) => {
    const typeLabel = taskTypeLabel(task.taskType, task.maintenanceType);
    acc[typeLabel] = (acc[typeLabel] || 0) + 1;
    return acc;
  }, {});

  const usersData = {
    total: scopedUsers.length,
    onlineToday: scopedUsers.length > 0 ? 1 : 0,
  };

  const openRemarksCount = scopedRemarks.filter((r) => r.status === "open").length;
  const criticalRemarksCount = scopedRemarks.filter((r) => r.priority === "critical" && r.status === "open").length;

  const recentActivities = buildRecentActivities({
    remarks: scopedRemarks,
    tasks: scopedTasks,
    serviceRequests: scopedServiceRequests,
    inspectionSummary: {
      inspected: dailyInspectionData.inspected,
      total: dailyInspectionData.total,
    },
    limit: 8,
  });

  return (
    <>
      <Helmet>
        <title>Панель управления - Система управления оборудованием</title>
        <meta name="description" content="Общий обзор состояния оборудования, технического обслуживания и ежедневных осмотров" />
      </Helmet>
      <div className="p-6">
        <div className="mb-8 flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Панель управления
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Добро пожаловать, {user.name}! Сегодня {format(new Date(), "d MMMM yyyy", { locale: ru })}
            </p>
            {filterSubdivisionId != null && (
              <p className="text-sm text-primary-600 dark:text-primary-400 mt-1">
                Фильтр: {filterLabel}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {isAdmin && <SubdivisionsPanel />}
            {showFilter && (
              <SubdivisionFilterSelect
                value={filterValue}
                onChange={setFilterValue}
                subdivisions={availableSubdivisions}
                className="w-52"
              />
            )}
          </div>
        </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {isDashboardBlockVisible("dash_calendar_stats") && (
          <>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Календарь: запланировано</p><p className="text-xl font-bold">{scopedCalStats?.planned ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Календарь: выполнено</p><p className="text-xl font-bold text-green-600">{scopedCalStats?.completed ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Календарь: ожидают</p><p className="text-xl font-bold text-orange-600">{scopedCalStats?.pending ?? 0}</p></CardContent></Card>
          </>
        )}
        {isDashboardBlockVisible("dash_budget_total") && (
          <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Бюджет (всего)</p><p className="text-xl font-bold">{(budgetSummary?.total ?? 0).toLocaleString("ru")} ₽</p></CardContent></Card>
        )}
      </div>

      {isDashboardBlockVisible("dash_warehouse_alerts") && warehouseAlertCount > 0 && (
        <Card className="mb-8 border-amber-300 dark:border-amber-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Package className="w-5 h-5" />
              Склад: требует внимания ({warehouseAlertCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {scopedWarehouseAlerts.slice(0, 8).map((alert) => (
              <div
                key={alert.id}
                className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded border ${
                  alert.alertType === "zero_stock"
                    ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                    : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
                }`}
              >
                <div>
                  <p className="font-medium">{alert.part?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {warehouseAlertLabel(alert.alertType)} · остаток: {alert.part?.quantity ?? 0} · мин: {alert.part?.minStock ?? 0}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLocation("/warehouse")}>
                    Открыть склад
                  </Button>
                  <Button
                    size="sm"
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
          </CardContent>
        </Card>
      )}

      {/* Основные метрики */}
      {isDashboardBlockVisible("dash_main_metrics") && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Общее оборудование */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Settings className="h-10 w-10 text-blue-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Всего оборудования</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{equipmentData.total}</p>
                        <p className="text-sm text-green-600">
                          {equipmentData.active} активно, {equipmentData.maintenance} на ТО
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ТО на месяц */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Wrench className="h-10 w-10 text-green-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 capitalize">
                          ТО за {monthLabel}
                        </p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                          {thisMonthMaintenance.length}
                        </p>
                        <p className="text-sm text-blue-600">
                          {thisMonthMaintenance.filter((t) => t.status === "completed").length} выполнено,{" "}
                          {thisMonthMaintenance.filter((t) => t.status === "in_progress").length} в процессе
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Ежедневные осмотры */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Eye className="h-10 w-10 text-purple-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Осмотры сегодня</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                          {dailyInspectionData.inspected}/{dailyInspectionData.total}
                        </p>
                        <p className="text-sm text-purple-600">
                          {dailyInspectionData.progress}% завершено
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Пользователи */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Users className="h-10 w-10 text-orange-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Пользователи</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{usersData.total}</p>
                        <p className="text-sm text-orange-600">
                          {usersData.onlineToday} активен сегодня
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
      )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {isDashboardBlockVisible("dash_inspection_progress") && (
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Ежедневные осмотры - {format(new Date(), 'd MMMM', { locale: ru })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Общий прогресс</span>
                        <span className="text-sm text-gray-600">{dailyInspectionData.inspected} из {dailyInspectionData.total}</span>
                      </div>
                      <Progress value={dailyInspectionData.progress} className="w-full" />
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <CheckCircle className="h-6 w-6 text-green-600" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dailyInspectionData.inspected}</p>
                          <p className="text-sm text-gray-600">Осмотрено</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Settings className="h-6 w-6 text-blue-600" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dailyInspectionData.working}</p>
                          <p className="text-sm text-gray-600">Работает</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <Clock className="h-6 w-6 text-yellow-600" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dailyInspectionData.onMaintenance}</p>
                          <p className="text-sm text-gray-600">На ТО</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-2">
                            <XCircle className="h-6 w-6 text-red-600" />
                          </div>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dailyInspectionData.notWorking}</p>
                          <p className="text-sm text-gray-600">Не работает</p>
                        </div>
                      </div>

                      {dailyInspectionData.issues > 0 && (
                        <div 
                          className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                          onClick={() => {
                            setLocation("/tasks");
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('navigateToRemarks'));
                            }, 100);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                            <span className="font-medium text-red-800 dark:text-red-200">
                              Обнаружено проблем: {dailyInspectionData.issues}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                )}

                {isDashboardBlockVisible("dash_tasks_stats") && (
                <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation("/tasks")}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Статистика задач
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scopedTaskStats.total}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Всего задач</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-600">{scopedTaskStats.completed}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Выполнено</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>В ожидании: {scopedTaskStats.pending}</span>
                          <span>В работе: {scopedTaskStats.inProgress}</span>
                        </div>
                        {scopedTaskStats.overdue > 0 && (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm">Просрочено: {scopedTaskStats.overdue}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-2">
                        <Progress 
                          value={scopedTaskStats.total > 0 ? (scopedTaskStats.completed / scopedTaskStats.total) * 100 : 0} 
                          className="h-2"
                        />
                        <p className="text-xs text-gray-500 mt-1 text-center">
                          {scopedTaskStats.total > 0 ? Math.round((scopedTaskStats.completed / scopedTaskStats.total) * 100) : 0}% завершено
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                )}

                {isDashboardBlockVisible("dash_upcoming_tasks") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Ближайшие задачи (3 дня)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {upcomingTasks.length === 0 ? (
                        <div className="text-center py-4">
                          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Нет задач на ближайшие 3 дня</p>
                        </div>
                      ) : (
                        upcomingTasks.slice(0, 5).map((task: any) => (
                          <div
                            key={task.id}
                            className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                            onClick={() => setLocation("/tasks")}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                  {task.title}
                                </h4>
                                {task.equipmentId && (
                                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                    <Wrench className="h-3 w-3" />
                                    Оборудование: {(() => {
                                      const eq = activeEquipment.find((e) => e.id === task.equipmentId);
                                      return eq ? eq.name : task.equipmentId;
                                    })()}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge 
                                    variant={
                                      task.priority === 'urgent' ? 'destructive' :
                                      task.priority === 'high' ? 'default' :
                                      'secondary'
                                    }
                                    className="text-xs"
                                  >
                                    {task.priority === 'urgent' ? 'Срочно' :
                                     task.priority === 'high' ? 'Высокий' :
                                     task.priority === 'medium' ? 'Средний' : 'Низкий'}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {format(new Date(task.dueDate), 'dd.MM.yyyy', { locale: ru })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      
                      {upcomingTasks.length > 5 && (
                        <div className="text-center pt-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setLocation("/tasks")}
                          >
                            Показать все ({upcomingTasks.length})
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {isDashboardBlockVisible("dash_maintenance_types") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      Ближайшие ТО (14 дней)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {overdueMaintenance.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Просрочено в календаре ({overdueMaintenance.length})
                          </p>
                          {overdueMaintenance.map((task) => (
                            <div
                              key={`overdue-${task.id}`}
                              className="p-2 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 cursor-pointer"
                              onClick={() => setLocation("/schedule")}
                            >
                              <div className="flex justify-between gap-2 text-sm">
                                <div className="min-w-0">
                                  <p className="font-medium truncate text-red-900 dark:text-red-100">{task.title}</p>
                                  <p className="text-xs text-red-700 dark:text-red-300 truncate">
                                    {task.equipmentId
                                      ? equipmentNameById.get(task.equipmentId) ?? task.equipmentId
                                      : "Без оборудования"}
                                    {" · "}
                                    {taskTypeLabel(task.taskType, task.maintenanceType)}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-red-700 dark:text-red-300">
                                    {format(new Date(task.dueDate!), "dd.MM", { locale: ru })}
                                  </p>
                                  <Badge variant="destructive" className="text-[10px] mt-1">
                                    Просрочено
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {upcomingMaintenance.length === 0 && overdueMaintenance.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Нет запланированного ТО на ближайшие 2 недели
                        </p>
                      ) : (
                        upcomingMaintenance.map((task) => (
                          <div
                            key={task.id}
                            className="p-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                            onClick={() => setLocation("/schedule")}
                          >
                            <div className="flex justify-between gap-2 text-sm">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{task.title}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {task.equipmentId
                                    ? equipmentNameById.get(task.equipmentId) ?? task.equipmentId
                                    : "Без оборудования"}
                                  {" · "}
                                  {taskTypeLabel(task.taskType, task.maintenanceType)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs">
                                  {format(new Date(task.dueDate!), "dd.MM", { locale: ru })}
                                </p>
                                <Badge variant="outline" className="text-[10px] mt-1">
                                  {taskStatusLabel(task.status)}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setLocation("/schedule")}>
                        План ТО и задач
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                )}

                {isDashboardBlockVisible("dash_maintenance_types") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 capitalize">
                      <BarChart3 className="h-5 w-5" />
                      ТО по типам ({monthLabel})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.keys(maintenanceTypesThisMonth).length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет записей ТО за этот месяц</p>
                      ) : (
                        Object.entries(maintenanceTypesThisMonth).map(([type, count]) => (
                          <div key={type} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{type}</span>
                            <Badge variant="outline">{count}</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
                )}

                {isDashboardBlockVisible("dash_equipment_types") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Оборудование по типам
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {Object.keys(equipmentData.categories).length === 0 ? (
                        <p className="text-sm text-muted-foreground">Оборудование не добавлено</p>
                      ) : (
                        Object.entries(equipmentData.categories)
                          .sort(([, a], [, b]) => b - a)
                          .map(([category, count]) => (
                            <div key={category} className="flex justify-between items-center">
                              <span className="text-sm font-medium">{category}</span>
                              <Badge variant="outline">{count}</Badge>
                            </div>
                          ))
                      )}
                    </div>
                  </CardContent>
                </Card>
                )}

                {isDashboardBlockVisible("dash_recent_activities") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Последние события
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recentActivities.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Пока нет событий — создайте оборудование, задачи или ТО
                        </p>
                      ) : (
                        recentActivities.map((activity) => (
                          <div
                            key={activity.id}
                            className={`flex items-start gap-3 ${activity.link ? "cursor-pointer hover:bg-accent/50 rounded-md p-1 -m-1" : ""}`}
                            onClick={() => activity.link && setLocation(activity.link)}
                          >
                            <activity.icon className={`h-5 w-5 mt-0.5 shrink-0 ${activity.color}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {activity.message}
                              </p>
                              <p className="text-xs text-muted-foreground">{activity.time}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
                )}
              </div>

              {isDashboardBlockVisible("dash_attention") &&
              (dailyInspectionData.issues > 0 || dailyInspectionData.notWorking > 0 || openRemarksCount > 0) && (
                <Card className="mt-8">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                      Требует внимания
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {dailyInspectionData.notWorking > 0 && (
                        <div 
                          className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                          onClick={() => setLocation("/daily-inspection")}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <XCircle className="h-5 w-5 text-red-600" />
                            <span className="font-medium text-red-800 dark:text-red-200">Неработающее оборудование</span>
                          </div>
                          <p className="text-2xl font-bold text-red-600">{dailyInspectionData.notWorking}</p>
                          <p className="text-sm text-red-600">ед. оборудования</p>
                        </div>
                      )}

                      {openRemarksCount > 0 && (
                        <div 
                          className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                          onClick={() => setLocation("/remarks")}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                            <span className="font-medium text-yellow-800 dark:text-yellow-200">Открытые замечания</span>
                          </div>
                          <p className="text-2xl font-bold text-yellow-600">{openRemarksCount}</p>
                          <p className="text-sm text-yellow-600">
                            требуют решения
                            {criticalRemarksCount > 0 && (
                              <span className="text-red-600 font-semibold ml-2">
                                ({criticalRemarksCount} критичных)
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
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