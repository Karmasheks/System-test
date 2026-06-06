import { useCallback, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { Download, ExternalLink, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTeamUsers } from "@/hooks/use-warehouse";
import {
  downloadEmployeeWorkReportCsv,
  useEmployeeWorkReport,
  type EmployeeWorkReport,
} from "@/hooks/use-asset-management";
import { useTaskDialog, type TaskRecord } from "@/hooks/use-task-dialog";
import { formatActualHours } from "@shared/task-hours";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { taskStatusColors } from "@/lib/badge-colors";
import { cn } from "@/lib/utils";

type PeriodPreset = "today" | "week" | "month" | "custom";

function getPeriodRange(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string
): { from: string; to: string; label: string } {
  const now = new Date();
  if (preset === "today") {
    const d = format(now, "yyyy-MM-dd");
    return { from: d, to: d, label: "Сегодня" };
  }
  if (preset === "week") {
    const from = startOfWeek(now, { locale: ru });
    const to = endOfWeek(now, { locale: ru });
    return {
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
      label: "Неделя",
    };
  }
  if (preset === "month") {
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
      label: "Месяц",
    };
  }
  return {
    from: customFrom,
    to: customTo,
    label: `${format(new Date(customFrom), "d MMM", { locale: ru })} — ${format(new Date(customTo), "d MMM yyyy", { locale: ru })}`,
  };
}

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
      <span className="truncate">{title}</span>
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

function PeriodFilterBar({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <Button
        type="button"
        size="sm"
        variant={preset === "today" ? "default" : "outline"}
        onClick={() => onPresetChange("today")}
      >
        Сегодня
      </Button>
      <Button
        type="button"
        size="sm"
        variant={preset === "week" ? "default" : "outline"}
        onClick={() => onPresetChange("week")}
      >
        Неделя
      </Button>
      <Button
        type="button"
        size="sm"
        variant={preset === "month" ? "default" : "outline"}
        onClick={() => onPresetChange("month")}
      >
        Месяц
      </Button>
      <Button
        type="button"
        size="sm"
        variant={preset === "custom" ? "default" : "outline"}
        onClick={() => onPresetChange("custom")}
      >
        Период
      </Button>
      {preset === "custom" && (
        <>
          <div>
            <Label className="text-xs">С</Label>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">По</Label>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
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
            <TableCell className="max-w-[200px] text-xs text-muted-foreground truncate">
              {task.completionComment || "—"}
            </TableCell>
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
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("today");
  const [customFrom, setCustomFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const period = useMemo(
    () => getPeriodRange(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  );

  const {
    data: report,
    isLoading,
    refetch,
    isFetching,
  } = useEmployeeWorkReport(userId ? Number(userId) : undefined, period.from, period.to);

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

  const handleExport = async () => {
    if (!userId) return;
    try {
      await downloadEmployeeWorkReportCsv(Number(userId), period.from, period.to);
      toast({ title: "Отчёт выгружен" });
    } catch {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
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
            Выберите сотрудника — откроются активные задачи и закрытые за выбранный период с учётом
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
                <Button variant="outline" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {!userId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Выберите сотрудника, чтобы увидеть его задачи
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Загрузка…</CardContent>
        </Card>
      ) : report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>На сотруднике</CardDescription>
                <CardTitle className="text-2xl">{report.summary.openTasksCount}</CardTitle>
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
                    На сотруднике ({report.summary.openTasksCount})
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    Закрытые ({report.summary.completedTasksCount})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="open" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Текущие задачи исполнителя: статус, даты создания и назначения, время в работе
                  </p>
                  <OpenTasksTable report={report} onOpenTask={openTaskById} />
                </TabsContent>

                <TabsContent value="completed" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Закрытые задачи · итого{" "}
                      <span className="font-semibold text-foreground">
                        {report.summary.totalHoursInPeriod} ч
                      </span>{" "}
                      за {period.label}
                    </p>
                    <PeriodFilterBar
                      preset={periodPreset}
                      onPresetChange={setPeriodPreset}
                      customFrom={customFrom}
                      customTo={customTo}
                      onCustomFromChange={setCustomFrom}
                      onCustomToChange={setCustomTo}
                    />
                  </div>
                  <CompletedTasksTable report={report} onOpenTask={openTaskById} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
