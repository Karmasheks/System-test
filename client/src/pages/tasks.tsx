import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { PageHelmet } from "@/components/page-helmet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Clock, 
  AlertTriangle, 
  Plus,
  Filter,
  Bell,
  Wrench,
  User,
  FileText,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { filterItemsBySubdivision } from "@/lib/subdivision-filter";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { useToast } from "@/hooks/use-toast";
import { useRemarksData } from "@/hooks/use-remarks-data";
import { useTaskDialog, type TaskRecord } from "@/hooks/use-task-dialog";
import { useMyWorkParams, myWorkPageSubtitle, type MyWorkSection, type MyWorkScope } from "@/hooks/use-my-work-params";
import { useServiceRequests, useServiceRequestMeta } from "@/hooks/use-service-requests";
import { STATUS_LABELS, type ServiceRequestStatus } from "@shared/service-request-constants";
import { serviceRequestStatusColors } from "@/lib/badge-colors";
import { taskPriorityColors, taskStatusColors, badgeGreen, badgeBlue, badgeYellow, badgeRed } from "@/lib/badge-colors";
import { taskTypeLabel } from "@shared/task-constants";
import { TASK_SOURCE_LABELS, type TaskSourceType } from "@shared/task-source-constants";
import { TASK_STATUS_LABELS, taskStatusLabel } from "@shared/task-status-constants";
import type { Equipment } from "@shared/schema";

type Task = TaskRecord & {
  lastModifiedBy?: string;
  completedBy?: string;
  completedAt?: string;
  createdBy?: string;
  createdById?: number | null;
  assigneeName?: string | null;
  openedByName?: string;
  openedAt?: string;
  sourceType?: TaskSourceType | string | null;
  sourceId?: number | null;
  serviceRequestId?: number | null;
  maintenanceId?: number | null;
  parentTaskId?: number | null;
  subdivisionId?: number | null;
};

export default function TasksPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { canCreateTasks, canProcessTasks, canViewCreatedTasks, canViewModule } = useAccessControl();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
  } = useSubdivisionFilter();
  const { data: subdivisions = [] } = useSubdivisions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { remarks } = useRemarksData();
  const { openCreate, openEdit } = useTaskDialog();
  const { scope, section, setMyWork } = useMyWorkParams();
  const search = useSearch();
  const openedTaskFromUrl = useRef<string | null>(null);

  useEffect(() => {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    const params = new URLSearchParams(raw);
    const taskId = params.get("task") || params.get("highlight");
    if (!taskId || !user) return;

    const openKey = `${taskId}:${params.get("comment") ?? ""}`;
    if (openedTaskFromUrl.current === openKey) return;

    (async () => {
      try {
        const res = await apiRequest("GET", `/api/tasks/${taskId}`);
        if (!res.ok) return;
        const task = (await res.json()) as Task;
        openedTaskFromUrl.current = openKey;
        openEdit(task);
      } catch {
        // ignore invalid task link
      }
    })();
  }, [search, user, openEdit]);

  const canViewTasks = canViewModule("tasks");
  const canViewRequests = canViewModule("service_requests");
  const canViewAllScope = canViewTasks || canViewRequests;
  const showCreatedTab = canViewCreatedTasks();
  const showTasksSection =
    scope === "all"
      ? canViewTasks
      : scope === "created"
        ? showCreatedTab
        : canViewTasks || scope === "assigned";
  const showRequestsSection =
    scope === "all"
      ? canViewRequests
      : canViewRequests || scope === "assigned" || scope === "created";

  const showTasksContent = section === "tasks" || section === "maintenance";
  const showRequestsContent = section === "requests";
  const showRemarksContent = section === "remarks";

  const [filterPriority, setFilterPriority] = useState("all");
  const [remarksFilter, setRemarksFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('open');
  const [tasksFilter, setTasksFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [requestsFilter, setRequestsFilter] = useState("all");

  // Слушаем событие навигации на вкладку замечаний с Dashboard
  useEffect(() => {
    const handleNavigateToRemarks = () => {
      setMyWork({ section: "remarks" });
    };

    window.addEventListener('navigateToRemarks', handleNavigateToRemarks);
    
    return () => {
      window.removeEventListener('navigateToRemarks', handleNavigateToRemarks);
    };
  }, [setMyWork]);

  // Загрузка задач
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['/api/tasks', scope],
    queryFn: async () => {
      const url = scope === "all" ? "/api/tasks" : `/api/tasks?scope=${scope}`;
      const res = await apiRequest('GET', url);
      return res.json();
    },
    enabled: !!user && showTasksContent && showTasksSection,
  });

  const { data: requests = [], isLoading: requestsLoading } = useServiceRequests({
    scope: scope === "all" ? undefined : scope,
    status: requestsFilter !== "all" ? requestsFilter : undefined,
    enabled: section === "requests" && showRequestsSection,
  });
  const { data: meta } = useServiceRequestMeta();

  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ['/api/equipment']
  });

  const typeLabel = (code: string) =>
    meta?.types?.find((t: { code: string; label: string }) => t.code === code)?.label ?? code;

  const requestStatusColors: Partial<Record<ServiceRequestStatus, string>> = serviceRequestStatusColors;

  const scopeTitle =
    scope === "created"
      ? "Создано мной"
      : scope === "all"
        ? "Все"
        : "Назначено мне";

  const sectionTitle =
    section === "tasks"
      ? "Задачи"
      : section === "requests"
        ? "Сервисные заявки"
        : section === "maintenance"
          ? "Техобслуживание (ТО)"
          : "Замечания";

  useEffect(() => {
    if (scope === "all" && !canViewAllScope) {
      setMyWork({ scope: "assigned", section: "tasks" });
    }
  }, [scope, canViewAllScope, setMyWork]);

  useEffect(() => {
    if (scope === "created" && !showCreatedTab) {
      setMyWork({ scope: "assigned", section: "tasks" });
    }
  }, [scope, showCreatedTab, setMyWork]);

  // Удаление задачи
  const deleteTask = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Задача удалена", description: "Задача успешно удалена" });
    },
  });

  const canOpenTask = (task: Task) =>
    canProcessTasks() ||
    (showCreatedTab && task.createdById === user?.id);

  const handleEdit = (task: Task) => {
    if (!canOpenTask(task)) return;
    openEdit(task);
  };

  const handleDelete = (id: number) => {
    if (confirm("Вы уверены, что хотите удалить эту задачу?")) {
      deleteTask.mutate(id);
    }
  };

  // Функции для работы с замечаниями
  const createTaskFromRemark = async (remark: any) => {
    try {
      await apiRequest('POST', '/api/tasks', {
        title: `Задача из замечания: ${remark.title}`,
        description: remark.description,
        priority: remark.priority,
        status: "pending",
        taskType: "other",
        equipmentId: remark.equipmentId,
        userId: user?.id,
        createdBy: user?.name || 'Неизвестный пользователь',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      window.dispatchEvent(new CustomEvent('taskCreated'));
      toast({ title: "Задача создана", description: "Задача успешно создана из замечания" });
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось создать задачу",
        variant: "destructive",
      });
    }
  };

  const updateRemarkStatus = useMutation({
    mutationFn: async ({ remarkId, status }: { remarkId: string, status: string }) => {
      const updateData = {
        status,
        lastModifiedBy: user?.name || 'Неизвестный пользователь',
        ...(status === 'resolved' && { resolvedBy: user?.name || 'Неизвестный пользователь' })
      };
      const response = await apiRequest('PUT', `/api/remarks/${remarkId}`, updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/remarks'] });
      // Обновляем уведомления и данные замечаний
      window.dispatchEvent(new CustomEvent('remarksUpdated'));
      window.dispatchEvent(new CustomEvent('remarkStatusChanged'));
      toast({
        title: "Статус обновлен",
        description: "Статус замечания успешно изменен"
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить статус замечания",
        variant: "destructive"
      });
    }
  });

  const handleRemarkStatusChange = (remarkId: string, status: string) => {
    updateRemarkStatus.mutate({ remarkId, status });
  };

  // Фильтрация задач
  const isOverdue = (task: Task) => {
    return task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';
  };

  const hasReminder = (task: Task) => {
    return task.reminderDate && new Date(task.reminderDate) <= new Date();
  };


  const categoryTasks = useMemo(() => {
    if (section === "maintenance") {
      return tasks.filter((t) => t.taskType === "maintenance");
    }
    return tasks;
  }, [tasks, section]);

  const subdivisionName = (id: number | null | undefined) =>
    id ? subdivisions.find((s) => s.id === id)?.name ?? `#${id}` : null;

  const scopedTasks = useMemo(
    () => filterItemsBySubdivision(categoryTasks, filterSubdivisionId),
    [categoryTasks, filterSubdivisionId]
  );

  const filteredTasks = scopedTasks.filter((task: Task) => {
    const statusMatch = tasksFilter === "all" || task.status === tasksFilter;
    const priorityMatch = filterPriority === "all" || task.priority === filterPriority;
    return statusMatch && priorityMatch;
  });

  const filteredRemarks = remarks.filter((remark) => {
    return remarksFilter === "all" || remark.status === remarksFilter;
  });

  const myTaskStats = useMemo(() => {
    const total = categoryTasks.length;
    const completed = categoryTasks.filter((t) => t.status === "completed").length;
    const pending = categoryTasks.filter((t) => t.status === "pending").length;
    const inProgress = categoryTasks.filter((t) => t.status === "in_progress").length;
    const overdue = categoryTasks.filter((t) => isOverdue(t)).length;
    return { total, completed, pending, inProgress, overdue };
  }, [categoryTasks]);

  // Счетчики для активных элементов

  // Функции стилизации
  const getPriorityColor = (priority: string) =>
    taskPriorityColors[priority] ?? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200";

  const getStatusColor = (status: string) =>
    taskStatusColors[status] ?? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200";

  const scopeOptions: { value: MyWorkScope; label: string; hidden?: boolean }[] = [
    { value: "assigned", label: "Назначено мне" },
    { value: "created", label: "Создано мной", hidden: !showCreatedTab },
    { value: "all", label: "Все", hidden: !canViewAllScope },
  ];

  const sectionOptions: { value: MyWorkSection; label: string; hidden?: boolean }[] = [
    { value: "tasks", label: "Задачи", hidden: !canViewTasks },
    { value: "requests", label: "Заявки", hidden: !canViewRequests },
    { value: "maintenance", label: "ТО", hidden: !canViewTasks },
    { value: "remarks", label: "Замечания" },
  ];

  return (
    <>
      <PageHelmet title="Задачи и заявки — StarLine" />
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Задачи и заявки
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {myWorkPageSubtitle(scope, section)}
              </p>
            </div>

            {canCreateTasks() && section !== "remarks" && (
              <Button onClick={() => openCreate()}>
                <Plus className="w-4 h-4 mr-2" />
                Создать задачу
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-4 space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Область
                </p>
                <Tabs
                  value={scope}
                  onValueChange={(value) =>
                    setMyWork({ scope: value as MyWorkScope })
                  }
                >
                  <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
                    {scopeOptions
                      .filter((o) => !o.hidden)
                      .map((o) => (
                        <TabsTrigger
                          key={o.value}
                          value={o.value}
                          className="text-xs sm:text-sm data-[state=active]:bg-background"
                        >
                          {o.label}
                        </TabsTrigger>
                      ))}
                  </TabsList>
                </Tabs>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Раздел
                </p>
                <Tabs
                  value={section}
                  onValueChange={(value) =>
                    setMyWork({ section: value as MyWorkSection })
                  }
                >
                  <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
                    {sectionOptions
                      .filter((o) => !o.hidden)
                      .map((o) => (
                        <TabsTrigger
                          key={o.value}
                          value={o.value}
                          className="text-xs sm:text-sm data-[state=active]:bg-background"
                        >
                          {o.label}
                        </TabsTrigger>
                      ))}
                  </TabsList>
                </Tabs>
              </div>

              <p className="text-xs text-muted-foreground border-t pt-3">
                Сейчас: <span className="font-medium text-foreground">{sectionTitle}</span>
                {section !== "remarks" && (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground">{scopeTitle}</span>
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          {showTasksContent && showTasksSection && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="px-3 py-1">
                  Всего: {myTaskStats.total}
                </Badge>
                <Badge variant="outline" className="px-3 py-1 border-orange-300 text-orange-700 dark:text-orange-300">
                  Активные: {myTaskStats.pending + myTaskStats.inProgress}
                </Badge>
                <Badge variant="outline" className="px-3 py-1 border-green-300 text-green-700 dark:text-green-300">
                  Выполнено: {myTaskStats.completed}
                </Badge>
                {myTaskStats.overdue > 0 && (
                  <Badge variant="outline" className="px-3 py-1 border-red-300 text-red-700 dark:text-red-300">
                    Просрочено: {myTaskStats.overdue}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Select
                  value={tasksFilter}
                  onValueChange={(value: "all" | "pending" | "in_progress" | "completed") =>
                    setTasksFilter(value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    <SelectItem value="pending">{TASK_STATUS_LABELS.pending}</SelectItem>
                    <SelectItem value="in_progress">{TASK_STATUS_LABELS.in_progress}</SelectItem>
                    <SelectItem value="completed">{TASK_STATUS_LABELS.completed}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Приоритет" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все приоритеты</SelectItem>
                    <SelectItem value="low">Низкий</SelectItem>
                    <SelectItem value="medium">Средний</SelectItem>
                    <SelectItem value="high">Высокий</SelectItem>
                    <SelectItem value="urgent">Срочный</SelectItem>
                  </SelectContent>
                </Select>

                {showFilter && (
                  <SubdivisionFilterSelect
                    value={filterValue}
                    onChange={setFilterValue}
                    subdivisions={availableSubdivisions}
                    className="w-full sm:w-56"
                  />
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {isLoading ? (
                        <div className="col-span-full text-center py-8">
                          <p className="text-gray-500 dark:text-gray-400">Загрузка задач...</p>
                        </div>
                      ) : filteredTasks.length === 0 ? (
                        <div className="col-span-full text-center py-8">
                          <p className="text-gray-500 dark:text-gray-400">Задач не найдено</p>
                        </div>
                      ) : (
                        filteredTasks.map((task: Task) => (
                          <Card
                            key={task.id}
                            className="relative cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => canOpenTask(task) && handleEdit(task)}
                          >
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <CardTitle className="text-lg">{task.title}</CardTitle>
                                <div className="flex gap-1">
                                  {hasReminder(task) && (
                                    <Bell className="w-4 h-4 text-yellow-500" />
                                  )}
                                  {isOverdue(task) && (
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {task.sourceType && (
                                  <Badge variant="secondary">
                                    {TASK_SOURCE_LABELS[task.sourceType as TaskSourceType] ?? task.sourceType}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="border-gray-300 dark:border-gray-600">
                                  {taskTypeLabel(task.taskType, task.maintenanceType)}
                                </Badge>
                                <Badge className={getPriorityColor(task.priority)}>
                                  {task.priority === "low" && "Низкий"}
                                  {task.priority === "medium" && "Средний"}
                                  {task.priority === "high" && "Высокий"}
                                  {task.priority === "urgent" && "Срочный"}
                                </Badge>
                                <Badge className={getStatusColor(task.status)}>
                                  {taskStatusLabel(task.status)}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              {task.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                                  {task.description}
                                </p>
                              )}
                              
                              <div className="space-y-2 text-sm">
                                {task.dueDate && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    <span>Срок: {format(new Date(task.dueDate), "dd.MM.yyyy", { locale: ru })}</span>
                                  </div>
                                )}
                                
                                {task.equipmentId && (
                                  <div className="flex items-center gap-2">
                                    <Wrench className="w-4 h-4" />
                                    <span>Оборудование: {(() => {
                                      const eq = equipment.find((e: any) => e.id === task.equipmentId);
                                      return eq ? eq.name : task.equipmentId;
                                    })()}</span>
                                  </div>
                                )}

                                {task.subdivisionId && (
                                  <div className="flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4" />
                                    <span>Подразделение: {subdivisionName(task.subdivisionId)}</span>
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4" />
                                  <span>Создал: {(task as Task).createdBy ?? "—"} · {task.createdAt ? format(new Date(task.createdAt), "dd.MM.yyyy HH:mm", { locale: ru }) : ""}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4" />
                                  <span>
                                    Исполнитель: {(task as Task).assigneeName ?? "не назначен"}
                                  </span>
                                </div>

                                {(task as Task).openedByName && (
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    <span>В работу: {(task as Task).openedByName} · {(task as Task).openedAt ? format(new Date((task as Task).openedAt!), "dd.MM.yyyy HH:mm", { locale: ru }) : ""}</span>
                                  </div>
                                )}
                                
                                {task.lastModifiedBy && (
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    <span>Изменил: {task.lastModifiedBy}</span>
                                  </div>
                                )}
                                
                                {task.completedBy && task.status === 'completed' && (
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    <span>Завершил: {task.completedBy}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex gap-2 mt-4">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleEdit(task)}
                                >
                                  Изменить
                                </Button>
                                
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleDelete(task.id)}
                                >
                                  Удалить
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
            </>
          )}

          {showTasksContent && !showTasksSection && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Нет доступа к этому разделу.
              </CardContent>
            </Card>
          )}

          {showRequestsContent && showRequestsSection && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{sectionTitle}</h2>
                </div>
                <Select value={requestsFilter} onValueChange={setRequestsFilter}>
                  <SelectTrigger className="w-full sm:w-64">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Статус заявки" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Найдено: {requests.length}</CardTitle>
                </CardHeader>
                <CardContent>
                        {requestsLoading ? (
                          <p className="text-muted-foreground">Загрузка...</p>
                        ) : requests.length === 0 ? (
                          <p className="text-muted-foreground">Заявок не найдено</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-muted-foreground">
                                  <th className="py-2 pr-4">№</th>
                                  <th className="py-2 pr-4">Оборудование</th>
                                  <th className="py-2 pr-4">Тип</th>
                                  <th className="py-2 pr-4">Статус</th>
                                  <th className="py-2 pr-4">Исполнитель</th>
                                  <th className="py-2 pr-4">Заявитель</th>
                                  <th className="py-2 pr-4">Создана</th>
                                </tr>
                              </thead>
                              <tbody>
                                {requests.map((r) => (
                                  <tr
                                    key={r.id}
                                    className="border-b hover:bg-muted/50 cursor-pointer"
                                    onClick={() => setLocation(`/service-requests/${r.id}`)}
                                  >
                                    <td className="py-3 pr-4">
                                      <span className="text-blue-600 font-medium">#{r.id}</span>
                                    </td>
                                    <td className="py-3 pr-4">{r.equipmentName}</td>
                                    <td className="py-3 pr-4">{typeLabel(r.requestType)}</td>
                                    <td className="py-3 pr-4">
                                      <Badge
                                        className={
                                          requestStatusColors[r.status as ServiceRequestStatus] ?? ""
                                        }
                                      >
                                        {STATUS_LABELS[r.status as ServiceRequestStatus] ?? r.status}
                                      </Badge>
                                    </td>
                                    <td className="py-3 pr-4">{r.assigneeName ?? "—"}</td>
                                    <td className="py-3 pr-4">{r.requesterName ?? "—"}</td>
                                    <td className="py-3 pr-4">
                                      {format(new Date(r.createdAt), "d MMM yyyy", { locale: ru })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
            </div>
          )}

          {showRequestsContent && !showRequestsSection && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Нет доступа к сервисным заявкам.
              </CardContent>
            </Card>
          )}

          {showRemarksContent && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{sectionTitle}</h2>
                </div>
                <Select
                  value={remarksFilter}
                  onValueChange={(value: "all" | "open" | "in_progress" | "resolved") =>
                    setRemarksFilter(value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    <SelectItem value="open">Открыто</SelectItem>
                    <SelectItem value="in_progress">В работе</SelectItem>
                    <SelectItem value="resolved">Решено</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredRemarks.length === 0 ? (
                        <div className="col-span-full text-center py-8">
                          <p className="text-gray-500 dark:text-gray-400">
                            {remarksFilter === 'all' ? 'Замечаний не найдено' : 
                             remarksFilter === 'open' ? 'Открытых замечаний не найдено' :
                             remarksFilter === 'in_progress' ? 'Замечаний в работе не найдено' :
                             'Решенных замечаний не найдено'}
                          </p>
                        </div>
                      ) : (
                        filteredRemarks.map((remark: any) => (
                          <Card key={remark.id} className="relative">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <CardTitle className="text-lg">{remark.title}</CardTitle>
                                <Badge className={getPriorityColor(remark.priority)}>
                                  {remark.priority === 'critical' ? 'Критично' :
                                   remark.priority === 'high' ? 'Высокий' :
                                   remark.priority === 'medium' ? 'Средний' : 'Низкий'}
                                </Badge>
                              </div>
                              <div className="flex gap-2">
                                <Badge className={
                                  remark.status === 'resolved' ? badgeGreen :
                                  remark.status === 'in_progress' ? badgeBlue :
                                  badgeYellow
                                }>
                                  {remark.status === 'resolved' ? 'Решено' :
                                   remark.status === 'in_progress' ? 'В работе' : 'Открыто'}
                                </Badge>
                                <Badge variant="outline">
                                  {remark.type === 'inspection' ? 'Осмотр' : 
                                   remark.type === 'maintenance' ? 'ТО' : 'Ручное'}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                                {remark.description}
                              </p>
                              
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <Wrench className="w-4 h-4" />
                                  <span>Оборудование: {remark.equipmentName}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  <span>Создано: {format(new Date(remark.createdAt), "dd.MM.yyyy", { locale: ru })}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4" />
                                  <span>Создал: {remark.reportedBy}</span>
                                </div>
                                {remark.lastModifiedBy && (
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    <span>Изменил: {remark.lastModifiedBy}</span>
                                  </div>
                                )}
                                {remark.resolvedBy && remark.status === 'resolved' && (
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4" />
                                    <span>Решил: {remark.resolvedBy}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex gap-2 mt-4">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => createTaskFromRemark(remark)}
                                  disabled={remark.status === 'resolved' || !canCreateTasks()}
                                >
                                  Создать задачу
                                </Button>
                                
                                <Select onValueChange={(value) => handleRemarkStatusChange(remark.id, value)}>
                                  <SelectTrigger className="w-32">
                                    <SelectValue placeholder="Статус" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open">Открыто</SelectItem>
                                    <SelectItem value="in_progress">В работе</SelectItem>
                                    <SelectItem value="resolved">Решено</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}