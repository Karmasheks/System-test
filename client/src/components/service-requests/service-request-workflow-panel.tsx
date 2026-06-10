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
import { getIsoWeek } from "@shared/iso-week";
import type { ServiceRequest } from "@shared/schema";
import { X } from "lucide-react";
import type { ServiceRequestStatus } from "@shared/service-request-constants";
import { cn } from "@/lib/utils";

type Assignee = { id: number; name: string; role: string };
type RequestTypeOption = { code: string; label: string };
type EquipmentOption = { id: string; name: string };
type Coexecutor = { id: number; userId: number; userName: string };

type Props = {
  request: ServiceRequest;
  user: { id: number; role: string; name: string } | null;
  assignees: Assignee[];
  equipmentOptions: EquipmentOption[];
  requestTypes: RequestTypeOption[];
  coexecutors?: Coexecutor[];
  onTransition: (
    body: Record<string, unknown>,
    options?: { successTitle?: string }
  ) => Promise<void>;
  onUpdateDetails?: (body: { equipmentId?: string; requestType?: string }) => Promise<void>;
  onAddCoexecutor?: (userId: number, userName: string) => Promise<void>;
  onRemoveCoexecutor?: (coId: number) => Promise<void>;
  isPending?: boolean;
  isDetailsPending?: boolean;
  /** Компактная строка в шапке заявки */
  variant?: "card" | "inline";
};

export function ServiceRequestWorkflowPanel({
  request,
  user,
  assignees,
  equipmentOptions,
  requestTypes,
  coexecutors = [],
  onTransition,
  onUpdateDetails,
  onAddCoexecutor,
  onRemoveCoexecutor,
  isPending,
  isDetailsPending,
  variant = "card",
}: Props) {
  const { toast } = useToast();
  const rawStatus = request.status as ServiceRequestStatus;
  const status: ServiceRequestStatus = rawStatus === "done" ? "user_review" : rawStatus;
  const isManager = (MANAGER_ROLES as readonly string[]).includes(user?.role ?? "");
  const isEngineer = (ENGINEER_ROLES as readonly string[]).includes(user?.role ?? "");
  const canPlan = isManager || isEngineer;
  const terminal = ["closed", "cancelled", "duplicate", "not_needed"].includes(status);
  const canEditCoexec = !terminal && status !== "cancelled";
  const inline = variant === "inline";

  const [assigneeId, setAssigneeId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [requestType, setRequestType] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedHours, setPlannedHours] = useState("");
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

  if (terminal && !canPlan) {
    return null;
  }

  const showPlanBlock =
    !terminal && canPlan && ["new", "assigned", "returned"].includes(status);
  const showDetailsBlock = !terminal && canPlan;

  const compactTrigger = inline ? "h-8 text-xs" : "";
  const compactLabel = inline ? "text-[10px] text-muted-foreground mb-0.5" : "text-xs";

  const detailsFields = showDetailsBlock && (
    <div
      className={cn(
        inline
          ? "flex flex-wrap items-end gap-2"
          : "rounded-lg border bg-background p-3 space-y-3"
      )}
    >
      {!inline && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Оборудование и тип
        </p>
      )}
      <div className={cn(inline ? "flex flex-wrap items-end gap-2" : "grid gap-3 sm:grid-cols-2")}>
        <div className={inline ? "min-w-[140px] max-w-[200px]" : ""}>
          {inline ? null : <Label className={compactLabel}>Оборудование</Label>}
          <Select value={equipmentId} onValueChange={setEquipmentId}>
            <SelectTrigger className={compactTrigger}>
              <SelectValue placeholder="Оборудование" />
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
        <div className={inline ? "w-[120px]" : ""}>
          {inline ? null : <Label className={compactLabel}>Тип</Label>}
          <Select value={requestType} onValueChange={setRequestType}>
            <SelectTrigger className={compactTrigger}>
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
        <Button
          variant="secondary"
          size="sm"
          className={inline ? "h-8" : ""}
          onClick={saveDetails}
          disabled={isDetailsPending}
        >
          {inline ? "Сохранить" : "Сохранить привязку"}
        </Button>
      </div>
    </div>
  );

  const planFields = showPlanBlock && (
    <div
      className={cn(
        inline ? "space-y-2" : "rounded-lg border bg-background p-3 space-y-3"
      )}
    >
      {!inline && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          План работ
        </p>
      )}
      <div
        className={cn(
          inline
            ? "flex flex-wrap items-end gap-x-2 gap-y-2"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        )}
      >
        <div className={inline ? "min-w-[130px]" : ""}>
          {inline ? null : <Label className={compactLabel}>Исполнитель</Label>}
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className={compactTrigger}>
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
        <div className={inline ? "w-[130px]" : ""}>
          {inline ? null : <Label className={compactLabel}>Дата</Label>}
          <Input
            type="date"
            className={compactTrigger}
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
          />
        </div>
        <div className={inline ? "w-[72px]" : ""}>
          {inline ? null : <Label className={compactLabel}>Часы</Label>}
          <Input
            type="number"
            step="0.5"
            min="0"
            className={compactTrigger}
            value={plannedHours}
            onChange={(e) => setPlannedHours(e.target.value)}
          />
        </div>
        <div className={inline ? "w-[72px]" : ""}>
          {inline ? null : <Label className={compactLabel}>Неделя</Label>}
          <Input value={plannedWeekPreview} readOnly className={cn(compactTrigger, "bg-muted")} />
        </div>
        {inline && onAddCoexecutor && (
          <div className="flex items-center gap-1 flex-wrap min-w-[140px]">
            {coexecutors.map((c) => (
              <Badge key={c.id} variant="secondary" className="text-[10px] gap-0.5 pr-0.5 h-6">
                {c.userName}
                {canEditCoexec && onRemoveCoexecutor && (
                  <button
                    type="button"
                    className="rounded hover:bg-muted p-0.5"
                    onClick={() => onRemoveCoexecutor(c.id)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            ))}
            {canEditCoexec && (
              <>
                <Select value={coexecId} onValueChange={setCoexecId}>
                  <SelectTrigger className="h-7 w-[100px] text-[10px]">
                    <SelectValue placeholder="+ соисп." />
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
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={!coexecId}
                  onClick={async () => {
                    const a = assignees.find((x) => String(x.id) === coexecId);
                    if (!a) return;
                    await onAddCoexecutor(a.id, a.name);
                    setCoexecId("");
                  }}
                >
                  +
                </Button>
              </>
            )}
          </div>
        )}
        <div className={cn("flex flex-wrap gap-1.5", inline && "shrink-0")}>
          <Button size="sm" className={inline ? "h-8" : ""} onClick={() => savePlan(false)} disabled={isPending}>
            {status === "new" ? "Назначить" : "Сохранить"}
          </Button>
          {!inline && (
            <Button size="sm" variant="secondary" onClick={() => savePlan(true)} disabled={isPending}>
              Сохранить и продолжить
            </Button>
          )}
        </div>
      </div>

      {!inline && onAddCoexecutor && (
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
    </div>
  );

  const noAccessHint = !terminal && !canPlan && status === "new" && (
    <p className="text-xs text-muted-foreground">Назначение — для руководителя или инженера.</p>
  );

  if (inline) {
    if (!showDetailsBlock && !showPlanBlock && !noAccessHint) return null;
    return (
      <div className="border-t bg-background/80 px-3 py-1.5 sm:px-4 space-y-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          Планирование
        </p>
        {detailsFields}
        {planFields}
        {noAccessHint}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 border-b bg-muted/20">
        <CardTitle className="text-base">Планирование и назначение</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {detailsFields}
        {planFields}
        {noAccessHint}
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
