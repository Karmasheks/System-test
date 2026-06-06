import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ENGINEER_ROLES, MANAGER_ROLES } from "@shared/service-request-constants";
import { SUBTASK_QUICK_TYPES, taskTypeLabel, type TaskTypeCode } from "@shared/task-constants";
import { taskStatusLabel } from "@shared/task-status-constants";
import { getIsoWeek } from "@shared/iso-week";
import type { ServiceRequest } from "@shared/schema";
import { X } from "lucide-react";
import type { ServiceRequestStatus } from "@shared/service-request-constants";
import {
  ServiceRequestWorkProgressBar,
  type ServiceRequestWorkProgress,
} from "@/components/service-requests/service-request-work-progress";
import { CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

type Assignee = { id: number; name: string; role: string };
type RequestTypeOption = { code: string; label: string };
type EquipmentOption = { id: string; name: string };
type Coexecutor = { id: number; userId: number; userName: string };

type LinkedTask = {
  id: number;
  title: string;
  status: string;
  taskType?: string | null;
  parentTaskId?: number | null;
};

type Props = {
  request: ServiceRequest;
  user: { id: number; role: string; name: string } | null;
  assignees: Assignee[];
  equipmentOptions: EquipmentOption[];
  requestTypes: RequestTypeOption[];
  coexecutors?: Coexecutor[];
  linkedTasks?: LinkedTask[];
  workProgress?: ServiceRequestWorkProgress | null;
  onTransition: (
    body: Record<string, unknown>,
    options?: { successTitle?: string }
  ) => Promise<void>;
  onUpdateDetails?: (body: { equipmentId?: string; requestType?: string }) => Promise<void>;
  onCreateSubtask?: (body: { title: string; description?: string; taskType?: string }) => Promise<void>;
  onAddCoexecutor?: (userId: number, userName: string) => Promise<void>;
  onRemoveCoexecutor?: (coId: number) => Promise<void>;
  onOpenTask?: (taskId: number) => void;
  isPending?: boolean;
  isDetailsPending?: boolean;
  isSubtaskPending?: boolean;
};

export function ServiceRequestWorkflowPanel({
  request,
  user,
  assignees,
  equipmentOptions,
  requestTypes,
  coexecutors = [],
  linkedTasks = [],
  workProgress = null,
  onTransition,
  onUpdateDetails,
  onCreateSubtask,
  onAddCoexecutor,
  onRemoveCoexecutor,
  onOpenTask,
  isPending,
  isDetailsPending,
  isSubtaskPending,
}: Props) {
  const { toast } = useToast();
  const rawStatus = request.status as ServiceRequestStatus;
  const status: ServiceRequestStatus = rawStatus === "done" ? "user_review" : rawStatus;
  const isManager = (MANAGER_ROLES as readonly string[]).includes(user?.role ?? "");
  const isEngineer = (ENGINEER_ROLES as readonly string[]).includes(user?.role ?? "");
  const canPlan = isManager || isEngineer;
  const terminal = ["closed", "cancelled", "duplicate", "not_needed"].includes(status);
  const canEditCoexec = !terminal && status !== "cancelled";

  const [assigneeId, setAssigneeId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [requestType, setRequestType] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedHours, setPlannedHours] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskType, setSubtaskType] = useState<TaskTypeCode>("task");
  const [coexecId, setCoexecId] = useState("");

  useEffect(() => {
    setAssigneeId(request.assigneeId ? String(request.assigneeId) : "");
    setEquipmentId(request.equipmentId ?? "");
    setRequestType(request.requestType ?? "");
    setPlannedDate(
      request.plannedDate ? new Date(request.plannedDate).toISOString().slice(0, 10) : ""
    );
    setPlannedHours(request.plannedHours != null ? String(request.plannedHours) : "");
  }, [
    request.id,
    request.assigneeId,
    request.equipmentId,
    request.requestType,
    request.plannedDate,
    request.plannedHours,
  ]);

  const plannedWeekPreview = useMemo(() => {
    if (plannedDate) return getIsoWeek(new Date(plannedDate));
    return request.plannedWeek ?? "—";
  }, [plannedDate, request.plannedWeek]);

  const equipmentSelectOptions = useMemo(() => {
    if (request.equipmentId && !equipmentOptions.some((eq) => eq.id === request.equipmentId)) {
      return [
        { id: request.equipmentId, name: request.equipmentName || request.equipmentId },
        ...equipmentOptions,
      ];
    }
    return equipmentOptions;
  }, [equipmentOptions, request.equipmentId, request.equipmentName]);

  const subtasksOnly = linkedTasks.filter((t) => t.parentTaskId != null);
  const sortedSubtasks = useMemo(
    () =>
      [...subtasksOnly].sort((a, b) => {
        const order = (s: string) =>
          s === "in_progress" ? 0 : s === "pending" ? 1 : s === "completed" ? 2 : 3;
        const d = order(a.status) - order(b.status);
        return d !== 0 ? d : a.id - b.id;
      }),
    [subtasksOnly]
  );

  const resolveAssignee = () => {
    const a = assignees.find((x) => String(x.id) === assigneeId);
    if (!a) return null;
    return { assigneeId: a.id, assigneeName: a.name };
  };

  const buildPlanPayload = () => {
    const assignee = resolveAssignee();
    if (!assignee) return null;
    const hasDate = !!plannedDate || !!request.plannedDate || !!request.plannedWeek;
    if (!hasDate) return null;
    const dateStr =
      plannedDate ||
      (request.plannedDate ? new Date(request.plannedDate).toISOString().slice(0, 10) : undefined);
    return {
      ...assignee,
      plannedDate: dateStr,
      plannedWeek: dateStr ? getIsoWeek(new Date(dateStr)) : request.plannedWeek ?? undefined,
      plannedHours: plannedHours ? Number(plannedHours) : request.plannedHours ?? undefined,
    };
  };

  const savePlan = async (continueLabel?: boolean) => {
    const plan = buildPlanPayload();
    if (!plan) {
      toast({ title: "Заполните исполнителя и плановую дату", variant: "destructive" });
      return;
    }
    const successTitle =
      status === "new"
        ? "Заявка назначена"
        : continueLabel
          ? "План сохранён — можно продолжить работу"
          : "План сохранён";

    if (status === "new" || status === "assigned" || status === "returned") {
      await onTransition({ toStatus: "assigned", ...plan }, { successTitle });
    } else {
      toast({ title: "Сохранение плана недоступно для текущего статуса", variant: "destructive" });
    }
  };

  const saveDetails = async () => {
    if (!onUpdateDetails) return;
    const payload: { equipmentId?: string; requestType?: string } = {};
    if (equipmentId && equipmentId !== request.equipmentId) payload.equipmentId = equipmentId;
    if (requestType && requestType !== request.requestType) payload.requestType = requestType;
    if (Object.keys(payload).length === 0) {
      toast({ title: "Изменений нет", variant: "destructive" });
      return;
    }
    await onUpdateDetails(payload);
    toast({ title: "Данные заявки сохранены" });
  };

  const addSubtask = async () => {
    if (!onCreateSubtask || !subtaskTitle.trim()) return;
    await onCreateSubtask({ title: subtaskTitle.trim(), taskType: subtaskType });
    setSubtaskTitle("");
    toast({ title: "Подзадача создана" });
  };

  if (terminal && !canPlan) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Обработка и планирование</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {workProgress && (
          <div className="rounded-lg border p-3 bg-muted/20">
            <ServiceRequestWorkProgressBar progress={workProgress} />
          </div>
        )}

        {!terminal && canPlan && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <p className="text-sm font-medium">Оборудование и тип</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Оборудование</Label>
                <Select value={equipmentId} onValueChange={setEquipmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите оборудование" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentSelectOptions.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Тип заявки</Label>
                <Select value={requestType} onValueChange={setRequestType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Тип" />
                  </SelectTrigger>
                  <SelectContent>
                    {requestTypes.map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={saveDetails} disabled={isDetailsPending}>
              Сохранить привязку
            </Button>
          </div>
        )}

        {!terminal && canPlan && ["new", "assigned", "returned"].includes(status) && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <p className="text-sm font-medium">Планирование</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs">Исполнитель</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Исполнитель" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Плановая дата</Label>
                <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">План, ч</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={plannedHours}
                  onChange={(e) => setPlannedHours(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Неделя (ISO)</Label>
                <Input value={plannedWeekPreview} readOnly className="bg-muted" />
              </div>
            </div>

            {onAddCoexecutor && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Соисполнители</p>
                {coexecutors.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {coexecutors.map((c) => (
                      <Badge key={c.id} variant="secondary" className="gap-1 pr-1">
                        {c.userName}
                        {canEditCoexec && onRemoveCoexecutor && (
                          <button
                            type="button"
                            className="ml-1 rounded hover:bg-muted p-0.5"
                            onClick={() => onRemoveCoexecutor(c.id)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Не назначены</p>
                )}
                {canEditCoexec && (
                  <div className="flex gap-2">
                    <Select value={coexecId} onValueChange={setCoexecId}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Добавить соисполнителя" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignees
                          .filter(
                            (a) =>
                              a.id !== request.assigneeId &&
                              !coexecutors.some((c) => c.userId === a.id)
                          )
                          .map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!coexecId}
                      onClick={async () => {
                        const a = assignees.find((x) => String(x.id) === coexecId);
                        if (!a) return;
                        await onAddCoexecutor(a.id, a.name);
                        setCoexecId("");
                      }}
                    >
                      Добавить
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => savePlan(false)} disabled={isPending}>
                {status === "new" ? "Назначить" : "Сохранить план"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => savePlan(true)} disabled={isPending}>
                Сохранить и продолжить
              </Button>
            </div>
          </div>
        )}

        {(onCreateSubtask || sortedSubtasks.length > 0) && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Подзадачи</p>
              {workProgress && workProgress.subtasksTotal > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {workProgress.subtasksCompleted}/{workProgress.subtasksTotal}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Закупки, модернизации и другие этапы работ — здесь, в рамках заявки.
            </p>
            {sortedSubtasks.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {sortedSubtasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className={cn(
                      "w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted text-left transition-colors",
                      task.status === "in_progress" &&
                        "border-amber-400/70 bg-amber-50/60 dark:bg-amber-950/20",
                      task.status === "completed" && "opacity-75"
                    )}
                    onClick={() => onOpenTask?.(task.id)}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">#{task.id}</span> {task.title}
                      <span className="text-muted-foreground ml-2">{taskTypeLabel(task.taskType)}</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {task.status === "in_progress" && (
                        <CircleDot className="w-2.5 h-2.5 mr-1" />
                      )}
                      {taskStatusLabel(task.status)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {!terminal && canPlan && onCreateSubtask && (
              <>
                <div className="flex flex-wrap gap-1">
                  {SUBTASK_QUICK_TYPES.map((t) => (
                    <Button
                      key={t.code}
                      type="button"
                      size="sm"
                      variant={subtaskType === t.code ? "default" : "outline"}
                      onClick={() => setSubtaskType(t.code)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Название подзадачи…"
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!subtaskTitle.trim() || isSubtaskPending}
                    onClick={addSubtask}
                  >
                    Создать
                  </Button>
                </div>
              </>
            )}
            {sortedSubtasks.length === 0 && (terminal || !canPlan || !onCreateSubtask) && (
              <p className="text-sm text-muted-foreground">Подзадач пока нет</p>
            )}
          </div>
        )}

        {!terminal && !canPlan && status === "new" && (
          <p className="text-sm text-muted-foreground">
            Назначение доступно руководителю или сервисному инженеру.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export const PART_STATUS_LABELS: Record<string, string> = {
  required: "Требуется",
  ordered: "Заказано",
  received: "Получено",
  used: "Использовано",
};
