import React, { useState, useEffect } from "react";
import { PageHelmet } from "@/components/page-helmet";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { useMaintenanceApi } from "@/hooks/use-maintenance-api";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { Task } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, Filter, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfYear, endOfYear, eachMonthOfInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { useCalendarEvents } from "@/hooks/use-asset-management";
import { Link } from "wouter";
import {
  getCalendarItemHref,
  getCalendarItemLabel,
} from "@/lib/calendar-navigation";
import {
  getCalendarTaskChipClass,
  getCalendarServiceRequestChipClass,
  getCalendarRemarkChipClass,
  calendarTaskTypeColors,
  calendarServiceRequestColors,
  calendarRemarkColors,
} from "@/lib/calendar-event-colors";
import { TASK_TYPES, taskTypeLabel, type TaskTypeCode } from "@shared/task-constants";
import { MAINTENANCE_STATUSES, MAINTENANCE_STATUS_LABELS } from "@shared/maintenance-status-constants";

const SCHEDULE_PAGE_TITLE = "План ТО и задач";

const scheduleDialogClass =
  "max-w-md max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden";
const scheduleDialogBodyClass = "overflow-y-auto px-6 py-4 space-y-4 flex-1 min-h-0";
const scheduleDialogFooterClass = "px-6 py-4 border-t shrink-0";

type CalendarEventFilter = "all" | "service_request" | "remark" | TaskTypeCode;

const CALENDAR_FILTER_OPTIONS: { value: CalendarEventFilter; label: string }[] = [
  { value: "all", label: "Все события" },
  { value: "service_request", label: "Заявки" },
  { value: "remark", label: "Замечания" },
  ...TASK_TYPES.map((t) => ({
    value: t.code as CalendarEventFilter,
    label: t.label,
  })),
];

export default function Schedule() {
  const { user } = useAuth();
  const { allEquipment: equipment, getActiveEquipment } = useEquipmentApi();
  
  const { addMaintenance } = useMaintenanceApi();
  
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState<'month' | 'year'>('month');
  const [eventFilter, setEventFilter] = useState<CalendarEventFilter>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    equipmentName: '',
    type: '1М - ТО',
    duration: '',
    status: 'scheduled',
    priority: 'medium',
    notes: ''
  });
  

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calFrom = format(monthStart, "yyyy-MM-dd");
  const calTo = format(monthEnd, "yyyy-MM-dd");
  const { data: calEvents = [] } = useCalendarEvents(calFrom, calTo);
  
  // Генерируем календарные дни с правильным выравниванием
  const firstDayOfWeek = monthStart.getDay(); // 0 = Воскресенье, 1 = Понедельник
  const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Преобразуем для понедельника = 0
  
  // Добавляем пустые дни в начале для правильного выравнивания
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - adjustedFirstDay);
  
  // Добавляем дни до конца календарной сетки (всего 42 дня = 6 недель)
  const calendarEnd = new Date(calendarStart);
  calendarEnd.setDate(calendarStart.getDate() + 41);
  
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Для годового вида
  const yearStart = startOfYear(currentDate);
  const yearEnd = endOfYear(currentDate);
  const yearMonths = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  const getRemarksForMonth = (month: Date) => {
    if (eventFilter !== "all" && eventFilter !== "remark") return [];
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    return (calEvents as any[]).filter((e) => {
      if (e.sourceType !== "remark") return false;
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    });
  };

  const filterTasksByType = (dayTasks: Task[]) => {
    if (eventFilter === "all") return dayTasks;
    if (eventFilter === "service_request" || eventFilter === "remark") return [];
    return dayTasks.filter((task) => (task.taskType || "other") === eventFilter);
  };

  const getTasksForDay = (day: Date) => {
    const dayTasks = tasks.filter(
      (task) => task.dueDate && isSameDay(new Date(task.dueDate), day)
    );
    return filterTasksByType(dayTasks);
  };

  const getServiceRequestsForDay = (day: Date) => {
    if (eventFilter !== "all" && eventFilter !== "service_request") return [];
    return (calEvents as any[]).filter(
      (e) => e.sourceType === "service_request" && isSameDay(new Date(e.date), day)
    );
  };

  const getRemarksForDay = (day: Date) => {
    if (eventFilter !== "all" && eventFilter !== "remark") return [];
    return (calEvents as any[]).filter(
      (e) => e.sourceType === "remark" && isSameDay(new Date(e.date), day)
    );
  };

  const getOtherCalEventsForDay = (day: Date) => {
    if (eventFilter !== "all") return [];
    return (calEvents as any[]).filter(
      (e) =>
        !["task", "service_request", "remark", "maintenance"].includes(e.sourceType) &&
        isSameDay(new Date(e.date), day)
    );
  };

  const getAllEventsForDay = (day: Date) => {
    const taskEvents = getTasksForDay(day);
    const serviceRequests = getServiceRequestsForDay(day);
    const remarkEvents = getRemarksForDay(day);
    return { tasks: taskEvents, serviceRequests, remarks: remarkEvents };
  };

  const getTasksForMonth = (month: Date) => {
    if (eventFilter === "service_request" || eventFilter === "remark") return [];
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const d = new Date(task.dueDate);
      return d >= monthStart && d <= monthEnd;
    });
    return filterTasksByType(monthTasks);
  };

  const getServiceRequestsForMonth = (month: Date) => {
    if (eventFilter !== "all" && eventFilter !== "service_request") return [];
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    return (calEvents as any[]).filter((e) => {
      if (e.sourceType !== "service_request") return false;
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    });
  };

  // Список оборудования для выбора (берем из базы данных)
  const equipmentList = getActiveEquipment().map(eq => eq.name);

  const maintenanceResponsible = user?.name ?? "—";

  // Обработчики для форм
  const handleDayClick = (day: Date) => {
    // Всегда позволяем создать новое ТО на выбранный день
    setSelectedDate(day);
    setFormData({
      equipmentName: '',
      type: '1М - ТО',
      duration: '2 часа',
      status: 'scheduled',
      priority: 'medium',
      notes: ''
    });
    setIsAddDialogOpen(true);
  };

  const handleSaveAdd = async () => {
    if (!selectedDate) return;
    
    // Находим оборудование по имени для получения ID
    const equipmentItem = equipment.find(eq => eq.name === formData.equipmentName);
    
    if (equipmentItem) {
      // Создаем запись ТО в базе данных
      const newMaintenanceRecord = {
        equipmentId: equipmentItem.id,
        equipmentName: formData.equipmentName,
        maintenanceType: formData.type,
        scheduledDate: selectedDate,
        duration: formData.duration,
        responsible: maintenanceResponsible,
        status: formData.status as 'scheduled' | 'in_progress' | 'completed' | 'postponed',
        priority: formData.priority as 'low' | 'medium' | 'high' | 'critical'
      };

      await addMaintenance(newMaintenanceRecord);
    }

    // Данные автоматически обновятся через useMaintenanceData
    setIsAddDialogOpen(false);
    setSelectedDate(null);
  };

  const upcomingTasks = tasks
    .filter((task) => task.dueDate && new Date(task.dueDate) >= new Date())
    .sort(
      (a, b) =>
        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
    );

  const filteredUpcomingTasks = filterTasksByType(upcomingTasks).slice(0, 5);

  const activeFilterLabel =
    CALENDAR_FILTER_OPTIONS.find((o) => o.value === eventFilter)?.label ?? "Все события";

  return (
    <>
      <PageHelmet title={`${SCHEDULE_PAGE_TITLE} — StarLine`} />
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{SCHEDULE_PAGE_TITLE}</h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Планирование ТО, задач и заявок на календаре
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Календарь */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="w-5 h-5" />
                          {viewType === 'month' 
                            ? format(currentDate, 'LLLL yyyy', { locale: ru })
                            : format(currentDate, 'yyyy', { locale: ru }) + ' год'
                          }
                        </CardTitle>
                        <CardDescription>
                          {activeFilterLabel}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                        <Select
                          value={eventFilter}
                          onValueChange={(v) => setEventFilter(v as CalendarEventFilter)}
                        >
                          <SelectTrigger className="w-full sm:w-[220px]">
                            <SelectValue placeholder="Фильтр событий" />
                          </SelectTrigger>
                          <SelectContent>
                            {CALENDAR_FILTER_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                        {/* Кнопки переключения вида */}
                        <div className="flex gap-1 mr-4">
                          <Button
                            variant={viewType === 'month' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewType('month')}
                          >
                            Месяц
                          </Button>
                          <Button
                            variant={viewType === 'year' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewType('year')}
                          >
                            Год
                          </Button>
                        </div>
                        {/* Навигация по времени */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentDate(
                            viewType === 'month' 
                              ? subMonths(currentDate, 1)
                              : new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), currentDate.getDate())
                          )}
                        >
                          ←
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentDate(
                            viewType === 'month'
                              ? addMonths(currentDate, 1)
                              : new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), currentDate.getDate())
                          )}
                        >
                          →
                        </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {viewType === 'month' ? (
                        // Месячный вид
                        <>
                          <div className="grid grid-cols-7 gap-1 mb-4">
                            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                              <div key={day} className="p-2 text-center text-sm font-medium text-gray-900">
                                {day}
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {calendarDays.map(day => {
                              const { tasks: dayTasks, serviceRequests: daySr, remarks: dayRemarks } = getAllEventsForDay(day);
                              const dayOtherEvents = getOtherCalEventsForDay(day);
                              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                              const isCurrentDay = isToday(day);
                              
                              return (
                                <div
                                  key={day.toString()}
                                  onClick={() => handleDayClick(day)}
                                  className={`min-h-[80px] p-1 border rounded-lg cursor-pointer hover:shadow-md transition-shadow ${
                                    isCurrentDay
                                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700'
                                      : isCurrentMonth
                                        ? 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        : 'bg-gray-50 border-gray-100 dark:bg-gray-900 dark:border-gray-800 opacity-50'
                                  }`}
                                >
                                  <div className={`text-sm font-medium mb-1 ${
                                    isCurrentMonth 
                                      ? 'text-gray-900' 
                                      : 'text-gray-600'
                                  }`}>
                                    {format(day, 'd')}
                                  </div>
                                  <div className="space-y-1">
                                    {dayTasks.map((task: any) => {
                                      const taskEquipment = task.equipmentId ?
                                        equipment.find((e: any) => e.id === task.equipmentId) : null;
                                      const equipmentName = taskEquipment ? taskEquipment.name : task.equipmentId;
                                      const href = getCalendarItemHref("task", task.id);
                                      const isCompleted = task.status === "completed";

                                      const chip = (
                                        <div
                                          className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 transition-opacity ${getCalendarTaskChipClass(task.taskType, isCompleted)}`}
                                          title={`${taskTypeLabel(task.taskType, task.maintenanceType)}: ${task.title}${equipmentName ? ` — ${equipmentName}` : ""}`}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {task.title.length > 10
                                            ? `${task.title.substring(0, 10)}...`
                                            : task.title}
                                        </div>
                                      );

                                      return href ? (
                                        <Link key={`task-${task.id}`} href={href}>
                                          {chip}
                                        </Link>
                                      ) : (
                                        <div key={`task-${task.id}`}>{chip}</div>
                                      );
                                    })}

                                    {daySr.map((sr: any) => {
                                      const href = getCalendarItemHref("service_request", sr.sourceId);
                                      if (!href) return null;
                                      return (
                                        <Link key={sr.id} href={href}>
                                          <div
                                            className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 ${getCalendarServiceRequestChipClass(sr.isCompleted)}`}
                                            title={sr.title}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {sr.isCompleted ? "✓" : "●"} Заявка #{sr.sourceId}
                                          </div>
                                        </Link>
                                      );
                                    })}

                                    {dayRemarks.map((remark: any) => {
                                      const href = getCalendarItemHref("remark", remark.sourceId);
                                      if (!href) return null;
                                      return (
                                        <Link key={remark.id} href={href}>
                                          <div
                                            className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 ${getCalendarRemarkChipClass(remark.isCompleted)}`}
                                            title={remark.title}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {remark.isCompleted ? "✓" : "●"} {remark.title.length > 10
                                              ? `${remark.title.substring(0, 10)}...`
                                              : remark.title}
                                          </div>
                                        </Link>
                                      );
                                    })}

                                    {dayOtherEvents.map((event: any) => {
                                      const href = getCalendarItemHref(event.sourceType, event.sourceId);
                                      if (!href) return null;
                                      const label = getCalendarItemLabel(event.sourceType);
                                      return (
                                        <Link key={event.id} href={href}>
                                          <div
                                            className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 ${
                                              event.isCompleted
                                                ? "bg-green-200 text-green-900 line-through"
                                                : "bg-amber-100 text-amber-900 border border-amber-200"
                                            }`}
                                            title={event.title}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {event.isCompleted ? "✓" : "●"} {label}: {event.title.length > 12
                                              ? `${event.title.substring(0, 12)}...`
                                              : event.title}
                                          </div>
                                        </Link>
                                      );
                                    })}

                                    {dayTasks.length === 0 &&
                                      daySr.length === 0 &&
                                      dayRemarks.length === 0 &&
                                      dayOtherEvents.length === 0 &&
                                      eventFilter === "all" && (
                                      <div className="text-xs text-gray-700 text-center py-2">
                                        + Добавить ТО
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        // Годовой вид
                        <div className="grid grid-cols-3 gap-4">
                          {yearMonths.map(month => {
                            const monthTasks = getTasksForMonth(month);
                            const monthSr = getServiceRequestsForMonth(month);
                            const monthRemarks = getRemarksForMonth(month);
                            const totalFiltered =
                              monthTasks.length + monthSr.length + monthRemarks.length;

                            return (
                              <div
                                key={month.toString()}
                                className="p-4 border rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
                                onClick={() => {
                                  setCurrentDate(month);
                                  setViewType('month');
                                }}
                              >
                                <div className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                  {format(month, 'LLLL', { locale: ru })}
                                </div>
                                <div className="space-y-2">
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    Событий: {totalFiltered}
                                  </div>
                                  {monthTasks.length > 0 && (
                                    <div className="text-xs text-blue-700 dark:text-blue-300">
                                      Задач: {monthTasks.length}
                                    </div>
                                  )}
                                  {monthSr.length > 0 &&
                                    (eventFilter === "all" || eventFilter === "service_request") && (
                                    <div className="text-xs text-indigo-700 dark:text-indigo-300">
                                      Заявок: {monthSr.length}
                                    </div>
                                  )}
                                  {monthRemarks.length > 0 &&
                                    (eventFilter === "all" || eventFilter === "remark") && (
                                    <div className="text-xs text-orange-700 dark:text-orange-300">
                                      Замечаний: {monthRemarks.length}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Боковая панель с предстоящими работами */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        Предстоящие работы
                      </CardTitle>
                      <CardDescription>
                        {eventFilter === "service_request"
                          ? "Ближайшие сервисные заявки"
                          : eventFilter === "remark"
                            ? "Ближайшие замечания"
                            : eventFilter === "all"
                              ? "Ближайшие задачи и заявки"
                              : `Ближайшие: ${activeFilterLabel}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {(eventFilter === "all" ||
                        (eventFilter !== "service_request" && eventFilter !== "remark")) &&
                        filteredUpcomingTasks.map((task) => {
                          const href = getCalendarItemHref("task", task.id);
                          const card = (
                            <div className="border rounded-lg p-3 dark:border-gray-700 cursor-pointer hover:bg-muted/50">
                              <div className="flex items-start justify-between mb-2 gap-2">
                                <h4 className="font-medium text-gray-900 dark:text-white">
                                  {task.title}
                                </h4>
                                <Badge variant="outline">
                                  {taskTypeLabel(task.taskType, task.maintenanceType)}
                                </Badge>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                📅{" "}
                                {task.dueDate &&
                                  format(new Date(task.dueDate), "dd.MM.yyyy", { locale: ru })}
                              </div>
                            </div>
                          );
                          return href ? (
                            <Link key={`task-upcoming-${task.id}`} href={href}>
                              {card}
                            </Link>
                          ) : (
                            <div key={`task-upcoming-${task.id}`}>{card}</div>
                          );
                        })}
                      {filteredUpcomingTasks.length === 0 &&
                        eventFilter !== "service_request" &&
                        eventFilter !== "remark" && (
                        <p className="text-sm text-muted-foreground">Нет предстоящих событий</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Filter className="w-5 h-5" />
                        Легенда и фильтр
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-sm mb-2 block">Отображать на календаре</Label>
                        <Select
                          value={eventFilter}
                          onValueChange={(v) => setEventFilter(v as CalendarEventFilter)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CALENDAR_FILTER_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Цвета по типам:</h4>
                        <div className="space-y-2 text-sm">
                          {TASK_TYPES.map((type) => (
                            <div key={type.code} className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border ${calendarTaskTypeColors[type.code].active}`} />
                              <span className="text-gray-700 dark:text-gray-300">{type.label}</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded border ${calendarServiceRequestColors.active}`} />
                            <span className="text-gray-700 dark:text-gray-300">Сервисные заявки</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded border ${calendarRemarkColors.active}`} />
                            <span className="text-gray-700 dark:text-gray-300">Замечания</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Статистика за период:</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Задач:</span>
                            <span className="font-medium">{tasks.filter((t) => t.dueDate).length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">ТО (задачи):</span>
                            <span className="font-medium">
                              {tasks.filter((t) => t.taskType === "maintenance" && t.dueDate).length}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Заявок:</span>
                            <span className="font-medium">
                              {(calEvents as any[]).filter((e) => e.sourceType === "service_request").length}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Замечаний:</span>
                            <span className="font-medium">
                              {(calEvents as any[]).filter((e) => e.sourceType === "remark").length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
        </div>
      </div>

      {/* Диалог добавления нового ТО */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className={scheduleDialogClass}>
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>
              Добавить ТО на {selectedDate && format(selectedDate, 'd MMMM yyyy', { locale: ru })}
            </DialogTitle>
          </DialogHeader>
          <div className={scheduleDialogBodyClass}>
            <div>
              <Label htmlFor="equipment">Оборудование</Label>
              <Select 
                value={formData.equipmentName} 
                onValueChange={(value) => setFormData({...formData, equipmentName: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите оборудование" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentList.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="type">Тип ТО</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => setFormData({...formData, type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1М - ТО">1М - ТО</SelectItem>
                  <SelectItem value="3М - ТО">3М - ТО</SelectItem>
                  <SelectItem value="6М - ТО">6М - ТО</SelectItem>
                  <SelectItem value="1Г - ТО">1Г - ТО</SelectItem>
                  <SelectItem value="Ремонт">Ремонт</SelectItem>
                  <SelectItem value="Незапланированные работы">Незапланированные работы</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="duration">Длительность</Label>
              <Select 
                value={formData.duration} 
                onValueChange={(value) => setFormData({...formData, duration: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 час">1 час</SelectItem>
                  <SelectItem value="2 часа">2 часа</SelectItem>
                  <SelectItem value="4 часа">4 часа</SelectItem>
                  <SelectItem value="8 часов">8 часов</SelectItem>
                  <SelectItem value="16 часов">16 часов</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Статус</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData({...formData, status: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {MAINTENANCE_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="priority">Приоритет</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(value) => setFormData({...formData, priority: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Низкий</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="high">Высокий</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Примечания</Label>
              <Textarea 
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Дополнительная информация..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className={scheduleDialogFooterClass}>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveAdd} disabled={!formData.equipmentName}>
              <Save className="h-4 w-4 mr-2" />
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}