import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { SubdivisionsPanel } from "@/components/admin/subdivisions-panel";
import { equipmentIdsInScope } from "@/lib/subdivision-filter";
import type { Task } from "@/types/api";
import type { Equipment as EquipmentRecord } from "@shared/schema";
import { useEquipmentData } from "@/hooks/use-equipment-data";
import { useRemarksData } from "@/hooks/use-remarks-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EquipmentStatusBadge } from "@/components/equipment-status-badge";
import { EQUIPMENT_STATUS_LABELS } from "@shared/equipment-status-constants";
import { Progress } from "@/components/ui/progress";

import { 
  Download, 
  FileText, 
  Calendar, 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Wrench,
  Settings,
  Eye,
  FileSpreadsheet,
  FileImage,
  Printer,
  Users,
  Wallet,
  Package,
  Activity
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { exportToPDF, exportToExcel, exportToCSV, ExportData } from "@/utils/reportExport";
import { downloadJson } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";
import { EmployeeWorkReportPanel } from "@/components/reports/employee-work-report-panel";
import { BudgetReportPanel } from "@/components/reports/budget-report-panel";
import { WarehouseReportPanel } from "@/components/reports/warehouse-report-panel";
import { ProductionReliabilityReportPanel } from "@/components/reports/production-reliability-report-panel";

export default function Reports() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { isAdmin } = useAccessControl();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
    allowAllOption,
  } = useSubdivisionFilter();
  const { equipment: equipmentData } = useEquipmentData();
  const { remarks } = useRemarksData();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Загрузка данных по задачам
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: !!user,
  });

  // Состояния фильтрации
  const [selectedTab, setSelectedTab] = useState("overview");
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reportLoading, setReportLoading] = useState(false);

  const equipmentWithSubdivision = equipmentData as (EquipmentRecord & { subdivisionId?: number | null })[];

  const scopedEquipment = useMemo(() => {
    if (filterSubdivisionId == null) return equipmentWithSubdivision;
    return equipmentWithSubdivision.filter((e) => e.subdivisionId === filterSubdivisionId);
  }, [equipmentWithSubdivision, filterSubdivisionId]);

  const scopedEquipmentIds = useMemo(
    () => equipmentIdsInScope(equipmentWithSubdivision, filterSubdivisionId, null),
    [equipmentWithSubdivision, filterSubdivisionId]
  );

  const scopedTasks = useMemo(() => {
    if (filterSubdivisionId == null) return tasks;
    return tasks.filter((t) => t.subdivisionId === filterSubdivisionId);
  }, [tasks, filterSubdivisionId]);

  const scopedRemarks = useMemo(
    () =>
      remarks.filter(
        (r) =>
          scopedEquipmentIds.has(r.equipmentId) ||
          (r as { subdivisionId?: number }).subdivisionId === filterSubdivisionId
      ),
    [remarks, scopedEquipmentIds, filterSubdivisionId]
  );

  const scopedMaintenanceTasks = useMemo(
    () =>
      scopedTasks.filter(
        (t) => t.taskType === "maintenance" && t.dueDate && scopedEquipmentIds.has(t.equipmentId ?? "")
      ),
    [scopedTasks, scopedEquipmentIds]
  );

  const scopedMaintenance = useMemo(
    () =>
      scopedMaintenanceTasks.map((task) => {
        const eq = scopedEquipment.find((e) => e.id === task.equipmentId);
        return {
          id: task.id,
          equipmentId: task.equipmentId ?? "",
          equipmentName: eq?.name ?? task.equipmentId ?? "",
          maintenanceType: task.maintenanceType || "ТО",
          status:
            task.status === "pending"
              ? "scheduled"
              : task.status === "in_progress"
                ? "in_progress"
                : task.status,
          scheduledDate: task.dueDate,
          completedDate: task.completedAt,
          responsible: task.assigneeName ?? "",
          notes: task.description ?? "",
          duration: "",
          priority: task.priority ?? "medium",
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        };
      }),
    [scopedMaintenanceTasks, scopedEquipment]
  );

  const scopedTaskStats = useMemo(
    () => ({
      total: scopedTasks.length,
      pending: scopedTasks.filter((t) => t.status === "pending").length,
      inProgress: scopedTasks.filter((t) => t.status === "in_progress").length,
      completed: scopedTasks.filter((t) => t.status === "completed").length,
      overdue: scopedTasks.filter((t) => {
        if (!t.dueDate || t.status === "completed") return false;
        return new Date(t.dueDate) < new Date();
      }).length,
    }),
    [scopedTasks]
  );

  const equipmentTypes = useMemo(() => {
    const types = new Set(scopedEquipment.map((e) => e.type).filter(Boolean));
    return Array.from(types).sort();
  }, [scopedEquipment]);

  const reportData = useMemo(() => {
    const filtered = scopedEquipment.filter((item) => {
      if (equipmentFilter !== "all" && item.type !== equipmentFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      return true;
    });
    const statusCounts = {
      active: filtered.filter((item) => item.status === "active").length,
      maintenance: filtered.filter((item) => item.status === "maintenance").length,
      repair: filtered.filter((item) => item.status === "repair").length,
      inactive: filtered.filter((item) => item.status === "inactive").length,
    };
    const typeDistribution = scopedEquipment.reduce(
      (acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    return { total: filtered.length, statusCounts, typeDistribution, filtered };
  }, [scopedEquipment, equipmentFilter, statusFilter]);

  const inspectionData = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    const todayInspections = scopedRemarks.filter((remark) => {
      const remarkDate = new Date(remark.createdAt);
      return remark.type === "inspection" && remarkDate >= todayStart && remarkDate <= todayEnd;
    });
    const inspectedEquipmentIds = new Set(todayInspections.map((remark) => remark.equipmentId));
    const inspected = inspectedEquipmentIds.size;
    const issues = todayInspections.length;
    const criticalIssues = todayInspections.filter((remark) => remark.priority === "critical").length;
    return {
      totalInspections: scopedEquipment.length,
      completed: inspected,
      pending: scopedEquipment.length - inspected,
      issues,
      criticalIssues,
    };
  }, [scopedRemarks, scopedEquipment]);

  const maintenanceData = useMemo(() => {
    const today = new Date();
    const planned = scopedMaintenance.filter((record) => record.status === "scheduled").length;
    const completed = scopedMaintenance.filter((record) => record.status === "completed").length;
    const inProgress = scopedMaintenance.filter((record) => record.status === "in_progress").length;
    const overdue = scopedMaintenance.filter((record) => {
      if (!record.scheduledDate || record.status !== "scheduled") return false;
      return new Date(record.scheduledDate) < today;
    }).length;
    const byType = scopedMaintenance.reduce(
      (acc, record) => {
        acc[record.maintenanceType] = (acc[record.maintenanceType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const total = planned + completed + inProgress;
    const efficiency = total > 0 ? Math.round((completed / total) * 100) : 0;
    const completedWithDuration = scopedMaintenance.filter(
      (r) => r.status === "completed" && r.duration
    );
    const avgDuration =
      completedWithDuration.length > 0
        ? Math.round(
            (completedWithDuration.reduce((sum, r) => {
              const match = String(r.duration).match(/(\d+)/);
              return sum + (match ? Number(match[1]) : 0);
            }, 0) /
              completedWithDuration.length) *
              10
          ) / 10
        : 0;
    return { planned, completed, overdue, inProgress, byType, efficiency, avgDuration };
  }, [scopedMaintenance]);

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

  const handleExport = async (exportFormat: string) => {
    setReportLoading(true);

    const exportData: ExportData = {
      tasks: scopedTasks || [],
      remarks: scopedRemarks || [],
      maintenance: scopedMaintenance || [],
      equipment: scopedEquipment || [],
    };

    const reportTitle = `Отчёт системы управления оборудованием за период ${format(dateRange.from, "d MMM", { locale: ru })} — ${format(dateRange.to, "d MMM yyyy", { locale: ru })}`;

    try {
      switch (exportFormat) {
        case "csv":
          exportToCSV(exportData, reportTitle);
          break;
        case "excel":
          exportToExcel(exportData, reportTitle);
          break;
        case "pdf":
          await exportToPDF(exportData, reportTitle);
          break;
        case "json":
          downloadJson(
            {
              ...exportData,
              summary: {
                totalEquipment: scopedEquipment.length,
                totalTasks: scopedTasks.length,
                totalRemarks: scopedRemarks.length,
                totalMaintenance: scopedMaintenance.length,
                subdivisionFilter: filterLabel,
                generatedAt: new Date().toISOString(),
                period: {
                  from: dateRange.from,
                  to: dateRange.to,
                },
              },
            },
            `full_report_${format(new Date(), "dd-MM-yyyy")}.json`
          );
          break;
      }
      toast({
        title: "Отчёт сформирован",
        description: "Файл загружен на ваш компьютер",
      });
    } catch (error) {
      toast({
        title: "Ошибка экспорта",
        description: error instanceof Error ? error.message : "Не удалось сформировать отчёт",
        variant: "destructive",
      });
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Отчеты и аналитика - Система управления оборудованием</title>
        <meta name="description" content="Подробные отчеты по оборудованию, техническому обслуживанию и эффективности работы" />
      </Helmet>

      <div className="p-4 lg:p-6 w-full min-w-0">
        <div className="w-full min-w-0">
              {/* Заголовок и фильтры */}
              <div className="mb-8">
                <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      Отчеты и аналитика
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                      Анализ работы оборудования за период {format(dateRange.from, "d MMM", { locale: ru })} —{" "}
                      {format(dateRange.to, "d MMM yyyy", { locale: ru })}
                    </p>
                    {filterSubdivisionId != null && (
                      <p className="text-sm text-primary-600 dark:text-primary-400 mt-1">
                        Подразделение: {filterLabel}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 items-center">
                    {isAdmin && <SubdivisionsPanel />}
                    <Button 
                      variant="outline" 
                      onClick={() => window.location.reload()}
                      disabled={reportLoading}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${reportLoading ? 'animate-spin' : ''}`} />
                      Обновить
                    </Button>
                    
                    <Select onValueChange={handleExport}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Экспорт отчета" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excel">
                          <div className="flex items-center">
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Excel файл (рекомендуется)
                          </div>
                        </SelectItem>
                        <SelectItem value="csv">
                          <div className="flex items-center">
                            <FileImage className="mr-2 h-4 w-4" />
                            CSV для Excel (UTF-8)
                          </div>
                        </SelectItem>
                        <SelectItem value="pdf">
                          <div className="flex items-center">
                            <FileText className="mr-2 h-4 w-4" />
                            PDF (кириллица)
                          </div>
                        </SelectItem>
                        <SelectItem value="json">
                          <div className="flex items-center">
                            <Download className="mr-2 h-4 w-4" />
                            JSON данные
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Панель фильтров */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Filter className="h-5 w-5" />
                      Фильтры отчета
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      {showFilter && (
                        <SubdivisionFilterSelect
                          value={filterValue}
                          onChange={setFilterValue}
                          subdivisions={availableSubdivisions}
                          showAll={allowAllOption}
                        />
                      )}
                      <div>
                        <Label>Тип оборудования</Label>
                        <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все типы</SelectItem>
                            {equipmentTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Статус</Label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все статусы</SelectItem>
                            <SelectItem value="active">Активное</SelectItem>
                            <SelectItem value="maintenance">{EQUIPMENT_STATUS_LABELS.maintenance}</SelectItem>
                            <SelectItem value="repair">{EQUIPMENT_STATUS_LABELS.repair}</SelectItem>
                            <SelectItem value="inactive">Неактивное</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      

                      
                      <div>
                        <Label>Период</Label>
                        <Select onValueChange={(value) => {
                          const today = new Date();
                          switch (value) {
                            case 'week':
                              setDateRange({ from: addDays(today, -7), to: today });
                              break;
                            case 'month':
                              setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
                              break;
                            case 'quarter':
                              setDateRange({ from: subMonths(today, 3), to: today });
                              break;
                            case 'year':
                              setDateRange({ from: subMonths(today, 12), to: today });
                              break;
                          }
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите период" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="week">Последняя неделя</SelectItem>
                            <SelectItem value="month">Текущий месяц</SelectItem>
                            <SelectItem value="quarter">Последние 3 месяца</SelectItem>
                            <SelectItem value="year">Последний год</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Основные метрики */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Settings className="h-10 w-10 text-blue-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Всего оборудования</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{reportData.total}</p>
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            <span className="text-green-600">{reportData.statusCounts.active} активно</span>
                          </div>
                          {reportData.statusCounts.maintenance > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <Clock className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600">
                                {reportData.statusCounts.maintenance} {EQUIPMENT_STATUS_LABELS.maintenance.toLowerCase()}
                              </span>
                            </div>
                          )}
                          {reportData.statusCounts.repair > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <Wrench className="h-3 w-3 text-rose-600" />
                              <span className="text-rose-600">
                                {reportData.statusCounts.repair} {EQUIPMENT_STATUS_LABELS.repair.toLowerCase()}
                              </span>
                            </div>
                          )}
                          {reportData.statusCounts.inactive > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <XCircle className="h-3 w-3 text-red-600" />
                              <span className="text-red-600">{reportData.statusCounts.inactive} неактивно</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Calendar className="h-10 w-10 text-green-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">ТО в мае</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{maintenanceData.planned}</p>
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            <span className="text-green-600">{maintenanceData.completed} выполнено</span>
                          </div>
                          {maintenanceData.inProgress > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <Clock className="h-3 w-3 text-blue-600" />
                              <span className="text-blue-600">{maintenanceData.inProgress} в процессе</span>
                            </div>
                          )}
                          {maintenanceData.overdue > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <AlertTriangle className="h-3 w-3 text-red-600" />
                              <span className="text-red-600">{maintenanceData.overdue} просрочено</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Eye className="h-10 w-10 text-purple-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Ежедневные осмотры</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                          {inspectionData.completed}/{inspectionData.totalInspections}
                        </p>
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-2 text-xs">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            <span className="text-green-600">{Math.round((inspectionData.completed / inspectionData.totalInspections) * 100)}% завершено</span>
                          </div>
                          {inspectionData.issues > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <AlertTriangle className="h-3 w-3 text-yellow-600" />
                              <span className="text-yellow-600">{inspectionData.issues} проблем</span>
                            </div>
                          )}
                          {inspectionData.criticalIssues > 0 && (
                            <div className="flex items-center gap-2 text-xs">
                              <XCircle className="h-3 w-3 text-red-600" />
                              <span className="text-red-600">{inspectionData.criticalIssues} критических</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <TrendingUp className="h-10 w-10 text-orange-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Эффективность ТО</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{maintenanceData.efficiency}%</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1 text-blue-600" />
                            {maintenanceData.avgDuration}ч среднее время
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Табы с детальными отчетами */}
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
                <TabsList className="flex w-full flex-wrap h-auto gap-1">
                  <TabsTrigger value="overview" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Обзор
                  </TabsTrigger>
                  <TabsTrigger value="equipment" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Оборудование
                  </TabsTrigger>
                  <TabsTrigger value="maintenance" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Техобслуживание
                  </TabsTrigger>
                  <TabsTrigger value="inspections" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Осмотры
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Задачи
                  </TabsTrigger>
                  <TabsTrigger value="remarks" className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Замечания
                  </TabsTrigger>
                  <TabsTrigger value="user-work" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Работы сотрудников
                  </TabsTrigger>
                  <TabsTrigger value="budget" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Затраты
                  </TabsTrigger>
                  <TabsTrigger value="warehouse" className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Склад
                  </TabsTrigger>
                  <TabsTrigger value="production-reliability" className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    OEE / MTBF / MTTR
                  </TabsTrigger>
                </TabsList>

                {/* Вкладка "Обзор" */}
                <TabsContent value="overview">
                  <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Распределение по типам оборудования</CardTitle>
                        <CardDescription>
                          Общее количество единиц оборудования по категориям
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(reportData.typeDistribution).map(([type, count]) => (
                            <div key={type}>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium">{type}</span>
                                <span className="text-sm text-gray-600 dark:text-gray-400">{count} ед.</span>
                              </div>
                              <Progress 
                                value={(count / reportData.total) * 100} 
                                className="h-3"
                              />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Вкладка "Оборудование" */}
                <TabsContent value="equipment">
                  <Card>
                    <CardHeader>
                      <CardTitle>Список оборудования</CardTitle>
                      <CardDescription>
                        Показано {reportData.filtered.length} из {equipmentData.length} единиц оборудования
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">ID</th>
                              <th className="text-left p-2">Название</th>
                              <th className="text-left p-2">Тип</th>
                              <th className="text-left p-2">Статус</th>
                              <th className="text-left p-2">Ответственный</th>
                              <th className="text-left p-2">Последнее ТО</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.filtered.map((item) => (
                              <tr key={item.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="p-2 font-mono text-sm">{item.id}</td>
                                <td className="p-2 font-medium">{item.name}</td>
                                <td className="p-2 text-sm">{item.type}</td>
                                <td className="p-2">
                                  <EquipmentStatusBadge status={item.status} compact />
                                </td>
                                <td className="p-2 text-sm">{item.responsible}</td>
                                <td className="p-2 text-sm">{item.lastMaintenance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Вкладка "Техобслуживание" */}
                <TabsContent value="maintenance">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Статистика ТО</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span>Запланировано</span>
                            <span className="font-bold">{maintenanceData.planned}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Выполнено</span>
                            <span className="font-bold text-green-600">{maintenanceData.completed}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>В процессе</span>
                            <span className="font-bold text-blue-600">{maintenanceData.inProgress}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Просрочено</span>
                            <span className="font-bold text-red-600">{maintenanceData.overdue}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>ТО по типам</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(maintenanceData.byType).map(([type, count]) => (
                            <div key={type}>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium">{type}</span>
                                <span className="text-sm text-gray-600">{count}</span>
                              </div>
                              <Progress 
                                value={(count / maintenanceData.planned) * 100} 
                                className="h-2"
                              />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Вкладка "Осмотры" */}
                <TabsContent value="inspections">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Прогресс осмотров</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center">
                          <div className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                            {Math.round((inspectionData.completed / inspectionData.totalInspections) * 100)}%
                          </div>
                          <Progress 
                            value={(inspectionData.completed / inspectionData.totalInspections) * 100} 
                            className="mb-4"
                          />
                          <div className="text-sm text-gray-600">
                            {inspectionData.completed} из {inspectionData.totalInspections} завершено
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Обнаруженные проблемы</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span>Всего проблем</span>
                            <Badge variant="outline">{inspectionData.issues}</Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Критические</span>
                            <Badge variant="destructive">{inspectionData.criticalIssues}</Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Требуют внимания</span>
                            <Badge variant="secondary">{inspectionData.issues - inspectionData.criticalIssues}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Статус по оборудованию</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span>Проверено</span>
                            <span className="font-bold text-green-600">{inspectionData.completed}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Ожидает проверки</span>
                            <span className="font-bold text-orange-600">{inspectionData.pending}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Всего единиц</span>
                            <span className="font-bold">{inspectionData.totalInspections}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Вкладка "Задачи" */}
                <TabsContent value="tasks">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Статистика задач</CardTitle>
                        <CardDescription>
                          Общие показатели выполнения задач
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="h-5 w-5 text-blue-600" />
                              <span className="font-medium">Всего задач</span>
                            </div>
                            <span className="text-2xl font-bold text-blue-600">{scopedTaskStats.total}</span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Clock className="h-5 w-5 text-orange-600" />
                              <span className="font-medium">В работе</span>
                            </div>
                            <span className="text-2xl font-bold text-orange-600">{scopedTaskStats.inProgress}</span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-5 w-5 text-yellow-600" />
                              <span className="font-medium">Ожидают</span>
                            </div>
                            <span className="text-2xl font-bold text-yellow-600">{scopedTaskStats.pending}</span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600" />
                              <span className="font-medium">Завершены</span>
                            </div>
                            <span className="text-2xl font-bold text-green-600">{scopedTaskStats.completed}</span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-red-600" />
                              <span className="font-medium">Просрочены</span>
                            </div>
                            <span className="text-2xl font-bold text-red-600">{scopedTaskStats.overdue}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Эффективность выполнения</CardTitle>
                        <CardDescription>
                          Показатели производительности
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Процент выполнения</span>
                              <span className="text-sm font-bold">
                                {scopedTaskStats.total > 0 ? Math.round((scopedTaskStats.completed / scopedTaskStats.total) * 100) : 0}%
                              </span>
                            </div>
                            <Progress 
                              value={scopedTaskStats.total > 0 ? (scopedTaskStats.completed / scopedTaskStats.total) * 100 : 0} 
                              className="h-3"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Активные задачи</span>
                              <span className="text-sm font-bold">
                                {scopedTaskStats.total > 0 ? Math.round(((scopedTaskStats.pending + scopedTaskStats.inProgress) / scopedTaskStats.total) * 100) : 0}%
                              </span>
                            </div>
                            <Progress 
                              value={scopedTaskStats.total > 0 ? ((scopedTaskStats.pending + scopedTaskStats.inProgress) / scopedTaskStats.total) * 100 : 0} 
                              className="h-3"
                            />
                          </div>
                          
                          <div className="pt-4 border-t">
                            <div className="grid grid-cols-2 gap-4 text-center">
                              <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Средний рейтинг</p>
                                <p className="text-2xl font-bold text-blue-600">4.2</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Время выполнения</p>
                                <p className="text-2xl font-bold text-green-600">2.5д</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>Детальный список задач</CardTitle>
                        <CardDescription>
                          Все задачи за выбранный период
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Array.isArray(tasks) && tasks.length > 0 ? tasks.map((task: any) => (
                            <div key={task.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{task.title}</h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{task.description}</p>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                    <span>Создал: {task.createdBy || 'Система'}</span>
                                    {task.dueDate && (
                                      <span>Срок: {format(new Date(task.dueDate), 'dd.MM.yyyy', { locale: ru })}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Badge variant={
                                    task.priority === 'urgent' ? 'destructive' :
                                    task.priority === 'high' ? 'destructive' :
                                    task.priority === 'medium' ? 'default' : 'secondary'
                                  }>
                                    {task.priority === 'low' && 'Низкий'}
                                    {task.priority === 'medium' && 'Средний'}
                                    {task.priority === 'high' && 'Высокий'}
                                    {task.priority === 'urgent' && 'Срочный'}
                                  </Badge>
                                  <Badge variant={
                                    task.status === 'completed' ? 'default' :
                                    task.status === 'in_progress' ? 'secondary' :
                                    task.status === 'overdue' ? 'destructive' : 'outline'
                                  }>
                                    {task.status === 'pending' && 'Ожидает'}
                                    {task.status === 'in_progress' && 'В работе'}
                                    {task.status === 'completed' && 'Завершено'}
                                    {task.status === 'overdue' && 'Просрочено'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          )) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              Задачи за выбранный период не найдены
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Вкладка "Замечания" */}
                <TabsContent value="remarks">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Статистика замечаний</CardTitle>
                        <CardDescription>
                          Общие показатели по замечаниям
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <FileText className="h-5 w-5 text-blue-600" />
                              <span className="font-medium">Всего замечаний</span>
                            </div>
                            <span className="text-2xl font-bold text-blue-600">{remarks.length}</span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <XCircle className="h-5 w-5 text-red-600" />
                              <span className="font-medium">Открытые</span>
                            </div>
                            <span className="text-2xl font-bold text-red-600">
                              {remarks.filter(r => r.status === 'open').length}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Clock className="h-5 w-5 text-orange-600" />
                              <span className="font-medium">В работе</span>
                            </div>
                            <span className="text-2xl font-bold text-orange-600">
                              {remarks.filter(r => r.status === 'in_progress').length}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600" />
                              <span className="font-medium">Решены</span>
                            </div>
                            <span className="text-2xl font-bold text-green-600">
                              {remarks.filter(r => r.status === 'resolved').length}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Анализ по источникам</CardTitle>
                        <CardDescription>
                          Откуда поступают замечания
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Ежедневные осмотры</span>
                              <span className="text-sm font-bold">
                                {remarks.filter(r => r.source === 'daily_inspection').length}
                              </span>
                            </div>
                            <Progress 
                              value={remarks.length > 0 ? (remarks.filter(r => r.source === 'daily_inspection').length / remarks.length) * 100 : 0} 
                              className="h-3"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Техническое обслуживание</span>
                              <span className="text-sm font-bold">
                                {remarks.filter(r => r.source === 'maintenance').length}
                              </span>
                            </div>
                            <Progress 
                              value={remarks.length > 0 ? (remarks.filter(r => r.source === 'maintenance').length / remarks.length) * 100 : 0} 
                              className="h-3"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Ручной ввод</span>
                              <span className="text-sm font-bold">
                                {remarks.filter(r => r.source === 'manual' || !r.source).length}
                              </span>
                            </div>
                            <Progress 
                              value={remarks.length > 0 ? (remarks.filter(r => r.source === 'manual' || !r.source).length / remarks.length) * 100 : 0} 
                              className="h-3"
                            />
                          </div>

                          <div className="pt-4 border-t">
                            <div className="grid grid-cols-2 gap-4 text-center">
                              <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Скорость решения</p>
                                <p className="text-2xl font-bold text-green-600">85%</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Среднее время</p>
                                <p className="text-2xl font-bold text-blue-600">1.2д</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle>Детальный список замечаний</CardTitle>
                        <CardDescription>
                          Все замечания за выбранный период
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {remarks.length > 0 ? remarks.map((remark: any) => (
                            <div key={remark.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{remark.title}</h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{remark.description}</p>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                    <span>Источник: {
                                      remark.source === 'daily_inspection' ? 'Ежедневный осмотр' :
                                      remark.source === 'maintenance' ? 'ТО' : 'Ручной ввод'
                                    }</span>
                                    <span>Создано: {format(new Date(remark.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })}</span>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Badge variant={
                                    remark.severity === 'critical' ? 'destructive' :
                                    remark.severity === 'high' ? 'destructive' :
                                    remark.severity === 'medium' ? 'default' : 'secondary'
                                  }>
                                    {remark.severity === 'low' && 'Низкая'}
                                    {remark.severity === 'medium' && 'Средняя'}
                                    {remark.severity === 'high' && 'Высокая'}
                                    {remark.severity === 'critical' && 'Критическая'}
                                  </Badge>
                                  <Badge variant={
                                    remark.status === 'resolved' ? 'default' :
                                    remark.status === 'in_progress' ? 'secondary' : 'outline'
                                  }>
                                    {remark.status === 'open' && 'Открыто'}
                                    {remark.status === 'in_progress' && 'В работе'}
                                    {remark.status === 'resolved' && 'Решено'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          )) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              Замечания за выбранный период не найдены
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="user-work">
                  <EmployeeWorkReportPanel />
                </TabsContent>

                <TabsContent value="budget">
                  <BudgetReportPanel />
                </TabsContent>

                <TabsContent value="warehouse">
                  <WarehouseReportPanel />
                </TabsContent>

                <TabsContent value="production-reliability">
                  <ProductionReliabilityReportPanel />
                </TabsContent>
              </Tabs>
        </div>
      </div>
    </>
  );
}