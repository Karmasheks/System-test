import { useCallback, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { Download, ExternalLink, RefreshCw, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTeamUsers } from "@/hooks/use-warehouse";
import {
  useEmployeeWorkReport,
  useUserWorkReport,
  type EmployeeWorkReport,
  type UserWorkReport,
} from "@/hooks/use-asset-management";
import {
  ReportPeriodFilter,
  getReportPeriodRange,
  type ReportPeriodPreset,
} from "@/components/reports/report-period-filter";
import {
  exportAllEmployeesWorkReport,
  exportEmployeeWorkReport,
  type ReportFileFormat,
} from "@/lib/specialized-report-export";
import { useTaskDialog, type TaskRecord } from "@/hooks/use-task-dialog";
import { formatActualHours } from "@shared/task-hours";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { taskStatusColors } from "@/lib/badge-colors";
import { cn } from "@/lib/utils";

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return format(new Date(iso), "dd.MM.yyyy HH:mm", { locale: ru });
}

function TaskLinkButton({
  taskId,
  title,
  onOpen,
}: {
  taskId: number;
  title: string;
  onOpen: (taskId: number) => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left text-blue-600 dark:text-blue-400 hover:underline max-w-[220px]"
      onClick={() => onOpen(taskId)}
    >
      <span className="text-multiline">{title}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
    </button>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge className={cn("text-xs", taskStatusColors[status] ?? "")} variant="outline">
      {label}
    </Badge>
  );
}

function OpenTasksTable({
  report,
  onOpenTask,
}: {
  report: EmployeeWorkReport;
  onOpenTask: (taskId: number) => void;
}) {
  if (report.openTasks.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Нет активных задач на сотруднике</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[70px]">ID</TableHead>
          <TableHead>Задача</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Создана</TableHead>
          <TableHead>Назначена</TableHead>
          <TableHead className="text-right">В работе, ч</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.openTasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>#{task.id}</TableCell>
            <TableCell>
              <TaskLinkButton taskId={task.id} title={task.title} onOpen={onOpenTask} />
            </TableCell>
            <TableCell>
              <StatusBadge status={task.status} label={task.statusLabel} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(task.createdAt)}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">
              {fmtDateTime(task.assigneeAssignedAt)}
            </TableCell>
            <TableCell className="text-right">{task.assignedDurationHours ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OpenServiceRequestsTable({ report }: { report: EmployeeWorkReport }) {
  if (report.openServiceRequests.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Нет активных заявок на сотруднике</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[70px]">ID</TableHead>
          <TableHead>Оборудование</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">Залогировано, ч</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.openServiceRequests.map((sr) => (
          <TableRow key={sr.id}>
            <TableCell>
              <Link
                href={`/service-requests/${sr.id}?from=tasks`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                #{sr.id}
              </Link>
            </TableCell>
            <TableCell>{sr.equipmentName}</TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs">{sr.statusLabel}</Badge>
            </TableCell>
            <TableCell className="text-right">{sr.loggedHours} ч</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ServiceRequestTimeEntriesTable({ report }: { report: EmployeeWorkReport }) {
  if (report.serviceRequestTimeEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        За выбранный период трудозатраты по заявкам не залогированы
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[70px]">Заявка</TableHead>
          <TableHead>Оборудование</TableHead>
          <TableHead>Дата</TableHead>
          <TableHead className="text-right">Часы</TableHead>
          <TableHead>Комментарий</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.serviceRequestTimeEntries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              <Link
                href={`/service-requests/${entry.requestId}?from=tasks`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                #{entry.requestId}
              </Link>
            </TableCell>
            <TableCell>{entry.equipmentName}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{entry.workDate}</TableCell>
            <TableCell className="text-right font-medium">{entry.hours}</TableCell>
            <TableCell className="max-w-[240px] text-xs text-muted-foreground text-multiline">
              {entry.comment?.trim() || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CompletedTasksTable({
  report,
  onOpenTask,
}: {
  report: EmployeeWorkReport;
  onOpenTask: (taskId: number) => void;
}) {
  if (report.completedTasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">За выбранный период закрытых задач нет</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[70px]">ID</TableHead>
          <TableHead>Задача</TableHead>
          <TableHead>Создана</TableHead>
          <TableHead>Назначена</TableHead>
          <TableHead>Закрыта</TableHead>
          <TableHead className="text-right">Факт, ч</TableHead>
          <TableHead>Итог работ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.completedTasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>#{task.id}</TableCell>
            <TableCell>
              <TaskLinkButton taskId={task.id} title={task.title} onOpen={onOpenTask} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(task.createdAt)}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">
              {fmtDateTime(task.assigneeAssignedAt)}
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(task.completedAt)}</TableCell>
            <TableCell className="text-right font-medium">{formatActualHours(task.actualHours)}</TableCell>
            <TableCell className="max-w-[200px] text-xs text-muted-foreground text-multiline">
              {task.completionComment || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AllEmployeesSummaryTable({ report }: { report: UserWorkReport }) {
  if (report.users.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Нет данных по сотрудникам</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Сотрудник</TableHead>
          <TableHead>Должность</TableHead>
          <TableHead>Подразделение</TableHead>
          <TableHead className="text-right">На сотруднике</TableHead>
          <TableHead className="text-right">Заявок</TableHead>
          <TableHead className="text-right">Закрыто за период</TableHead>
          <TableHead className="text-right">Часов за период</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.users.map((user) => (
          <TableRow key={user.userId}>
            <TableCell className="font-medium">{user.userName}</TableCell>
            <TableCell className="text-xs">{user.position ?? "—"}</TableCell>
            <TableCell className="text-xs">{user.department ?? "—"}</TableCell>
            <TableCell className="text-right">{user.openTasksCount}</TableCell>
            <TableCell className="text-right">{user.openServiceRequestsCount}</TableCell>
            <TableCell className="text-right">{user.completedTasksInPeriod.length}</TableCell>
            <TableCell className="text-right font-medium">{user.totalHoursInPeriod} ч</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EmployeeWorkReportPanel() {
  const { toast } = useToast();
  const { openEdit } = useTaskDialog();
  const { data: teamUsers = [] } = useTeamUsers();

  const [userId, setUserId] = useState("");
  const [subTab, setSubTab] = useState<"open" | "completed">("open");
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>("today");
  const [exporting, setExporting] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const period = useMemo(
    () => getReportPeriodRange(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  );

  const isAll = userId === "all";
  const numericUserId = userId && !isAll ? Number(userId) : undefined;

  const {
    data: singleReport,
    isLoading: singleLoading,
    refetch: refetchSingle,
    isFetching: singleFetching,
  } = useEmployeeWorkReport(numericUserId, period.from, period.to);

  const {
    data: allReport,
    isLoading: allLoading,
    refetch: refetchAll,
    isFetching: allFetching,
  } = useUserWorkReport(period.from, period.to, isAll);

  const report = isAll ? undefined : singleReport;
  const isLoading = isAll ? allLoading : singleLoading;
  const isFetching = isAll ? allFetching : singleFetching;
  const refetch = isAll ? refetchAll : refetchSingle;

  const openTaskById = useCallback(
    async (taskId: number) => {
      try {
        const res = await apiRequest("GET", `/api/tasks/${taskId}`);
        if (!res.ok) throw new Error("Задача не найдена");
        openEdit((await res.json()) as TaskRecord);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Не удалось открыть задачу";
        toast({ title: "Ошибка", description: message, variant: "destructive" });
      }
    },
    [openEdit, toast]
  );

  const allTotals = useMemo(() => {
    if (!allReport) return null;
    return allReport.users.reduce(
      (acc, u) => ({
        openTasks: acc.openTasks + u.openTasksCount,
        openRequests: acc.openRequests + u.openServiceRequestsCount,
        completed: acc.completed + u.completedTasksInPeriod.length,
        hours: acc.hours + u.totalHoursInPeriod,
      }),
      { openTasks: 0, openRequests: 0, completed: 0, hours: 0 }
    );
  }, [allReport]);

  const handleExport = async (fileFormat: ReportFileFormat) => {
    if (!userId) return;
    setExporting(true);
    try {
      if (isAll && allReport) {
        await exportAllEmployeesWorkReport(allReport, fileFormat, period.from, period.to);
        toast({ title: "Сводный отчёт по всем сотрудникам выгружен" });
      } else if (singleReport) {
        await exportEmployeeWorkReport(singleReport, fileFormat, period.from, period.to);
        toast({ title: "Отчёт по сотруднику выгружен" });
      }
    } catch {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Работы сотрудника
          </CardTitle>
          <CardDescription>
            Выберите сотрудника или всех сразу — активные задачи и закрытые за период с учётом
            фактического времени
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[260px] flex-1">
              <Label>Сотрудник</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сотрудника…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все сотрудники</SelectItem>
                  {teamUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {userId && (
              <>
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
                  Обновить
                </Button>
                <Button
                  variant="outline"
                  disabled={(!report && !allReport) || exporting}
                  onClick={() => handleExport("excel")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  disabled={(!report && !allReport) || exporting}
                  onClick={() => handleExport("csv")}
                >
                  CSV
                </Button>
                <Button
                  variant="outline"
                  disabled={(!report && !allReport) || exporting}
                  onClick={() => handleExport("pdf")}
                >
                  PDF
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {!userId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Выберите сотрудника или «Все сотрудники», чтобы увидеть задачи
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Загрузка…</CardContent>
        </Card>
      ) : isAll && allReport && allTotals ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Сотрудников</CardDescription>
                <CardTitle className="text-2xl">{allReport.users.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Открытых задач</CardDescription>
                <CardTitle className="text-2xl">{allTotals.openTasks}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Закрыто за период</CardDescription>
                <CardTitle className="text-2xl">{allTotals.completed}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Часов за период</CardDescription>
                <CardTitle className="text-2xl">
                  {Math.round(allTotals.hours * 100) / 100} ч
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Все сотрудники</CardTitle>
              <CardDescription>
                Сводка за {period.label} · открытых заявок: {allTotals.openRequests}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReportPeriodFilter
                preset={periodPreset}
                onPresetChange={setPeriodPreset}
                customFrom={customFrom}
                customTo={customTo}
                onCustomFromChange={setCustomFrom}
                onCustomToChange={setCustomTo}
              />
              <AllEmployeesSummaryTable report={allReport} />
            </CardContent>
          </Card>
        </>
      ) : report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>На сотруднике</CardDescription>
                <CardTitle className="text-2xl">
                  {report.summary.openTasksCount} / {report.summary.openServiceRequestsCount}
                </CardTitle>
                <p className="text-xs text-muted-foreground">задач / заявок</p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Закрыто за период</CardDescription>
                <CardTitle className="text-2xl">{report.summary.completedTasksCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Часов за период</CardDescription>
                <CardTitle className="text-2xl">{report.summary.totalHoursInPeriod} ч</CardTitle>
                <p className="text-xs text-muted-foreground">
                  задачи {report.summary.taskHoursInPeriod} · заявки{" "}
                  {report.summary.serviceRequestHoursInPeriod}
                </p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Сегодня закрыто / часов</CardDescription>
                <CardTitle className="text-2xl">
                  {report.summary.completedTasksToday} / {report.summary.totalHoursToday} ч
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{report.userName}</CardTitle>
              <CardDescription>
                {report.position || "Сотрудник"}
                {report.department ? ` · ${report.department}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "open" | "completed")}>
                <TabsList className="mb-4">
                  <TabsTrigger value="open">
                    На сотруднике ({report.summary.openTasksCount + report.summary.openServiceRequestsCount})
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    Закрытые ({report.summary.completedTasksCount + report.serviceRequestTimeEntries.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="open" className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Задачи</p>
                    <OpenTasksTable report={report} onOpenTask={openTaskById} />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Заявки</p>
                    <OpenServiceRequestsTable report={report} />
                  </div>
                </TabsContent>

                <TabsContent value="completed" className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Итого{" "}
                      <span className="font-semibold text-foreground">
                        {report.summary.totalHoursInPeriod} ч
                      </span>{" "}
                      за {period.label} (задачи {report.summary.taskHoursInPeriod} · заявки{" "}
                      {report.summary.serviceRequestHoursInPeriod})
                    </p>
                    <ReportPeriodFilter
                      preset={periodPreset}
                      onPresetChange={setPeriodPreset}
                      customFrom={customFrom}
                      customTo={customTo}
                      onCustomFromChange={setCustomFrom}
                      onCustomToChange={setCustomTo}
                    />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Закрытые задачи</p>
                    <CompletedTasksTable report={report} onOpenTask={openTaskById} />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Трудозатраты по заявкам</p>
                    <ServiceRequestTimeEntriesTable report={report} />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
