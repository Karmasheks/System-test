import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ADMIN_ROLES,
  AWAITING_USER_CONFIRM_STATUSES,
  ENGINEER_ROLES,
  MANAGER_ROLES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  type ServiceRequestStatus,
} from "@shared/service-request-constants";
import type { ServiceRequest } from "@shared/schema";
import { serviceRequestStatusColors } from "@/lib/badge-colors";

type Props = {
  request: ServiceRequest;
  user: { id: number; role: string; name: string } | null;
  partsCount: number;
  onTransition: (
    body: Record<string, unknown>,
    options?: { successTitle?: string }
  ) => Promise<void>;
  isPending?: boolean;
  compact?: boolean;
};

export function ServiceRequestStatusBar({
  request,
  user,
  partsCount,
  onTransition,
  isPending,
  compact = false,
}: Props) {
  const { toast } = useToast();
  const rawStatus = request.status as ServiceRequestStatus;
  const status: ServiceRequestStatus = rawStatus === "done" ? "user_review" : rawStatus;
  const transitionFrom = rawStatus === "done" ? "done" : status;

  const isManager = (MANAGER_ROLES as readonly string[]).includes(user?.role ?? "");
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(user?.role ?? "");
  const isEngineer = (ENGINEER_ROLES as readonly string[]).includes(user?.role ?? "");
  const isAssignee = request.assigneeId === user?.id;
  const isRequester = request.requesterId === user?.id;
  const terminal = ["closed", "cancelled", "duplicate", "not_needed"].includes(status);
  const awaitingUserConfirm = (AWAITING_USER_CONFIRM_STATUSES as readonly string[]).includes(rawStatus);

  const [selectedStatus, setSelectedStatus] = useState("");
  const [statusComment, setStatusComment] = useState("");
  const [completionComment, setCompletionComment] = useState("");
  const [adminForceCloseComment, setAdminForceCloseComment] = useState("");

  useEffect(() => {
    setSelectedStatus("");
    setStatusComment("");
    setCompletionComment("");
    setAdminForceCloseComment("");
  }, [request.id, request.status]);

  const availableStatuses = useMemo(() => {
    const candidates = STATUS_TRANSITIONS[transitionFrom] ?? [];
    return candidates.filter((to) => {
      if (to === "assigned") return false;
      if (to === "in_progress" && !(isEngineer || isAssignee || isManager)) return false;
      if (["waiting_parts", "done"].includes(to) && !isEngineer) return false;
      if (to === "closed" && !(isRequester || isManager)) return false;
      if (to === "returned" && !isRequester && !isManager) return false;
      if (["cancelled", "duplicate", "not_needed"].includes(to) && !(isManager || isEngineer)) {
        return false;
      }
      return true;
    });
  }, [transitionFrom, isEngineer, isAssignee, isManager, isRequester]);

  const applyStatus = async () => {
    if (!selectedStatus) {
      toast({ title: "Выберите статус", variant: "destructive" });
      return;
    }
    const to = selectedStatus as ServiceRequestStatus;
    const body: Record<string, unknown> = { toStatus: to };

    if (to === "waiting_parts" && partsCount === 0) {
      toast({ title: "Сначала добавьте запчасти", variant: "destructive" });
      return;
    }
    if (to === "waiting_parts") body.partsRequired = true;

    if (to === "done") {
      if (!completionComment.trim()) {
        toast({ title: "Укажите итоговый комментарий", variant: "destructive" });
        return;
      }
      body.completionComment = completionComment.trim();
    }

    if (to === "returned") {
      if (!statusComment.trim()) {
        toast({ title: "Укажите причину возврата", variant: "destructive" });
        return;
      }
      body.userRejectionComment = statusComment.trim();
    }

    if (to === "closed") body.userAccepted = true;
    if (["cancelled", "duplicate", "not_needed"].includes(to)) {
      body.comment = statusComment.trim() || undefined;
    }

    await onTransition(body, { successTitle: `Статус: ${STATUS_LABELS[to] ?? to}` });
    setSelectedStatus("");
    setStatusComment("");
    setCompletionComment("");
  };

  const adminForceClose = async () => {
    if (!adminForceCloseComment.trim()) {
      toast({ title: "Укажите причину закрытия", variant: "destructive" });
      return;
    }
    await onTransition(
      {
        toStatus: "closed",
        adminForceClose: true,
        comment: adminForceCloseComment.trim(),
      },
      { successTitle: "Заявка закрыта администратором" }
    );
    setAdminForceCloseComment("");
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          className={`${compact ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1"} ${serviceRequestStatusColors[status] ?? serviceRequestStatusColors[rawStatus] ?? ""}`}
        >
          {STATUS_LABELS[status] ?? STATUS_LABELS[rawStatus] ?? status}
        </Badge>

        {!terminal && availableStatuses.length > 0 && (
          <>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className={compact ? "w-[150px] h-7 text-xs" : "w-[200px] h-9"}>
                <SelectValue placeholder="Сменить статус…" />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Комментарий"
              className={compact ? "h-7 w-28 sm:w-36 text-xs" : "h-9 w-40 sm:w-52"}
              value={statusComment}
              onChange={(e) => setStatusComment(e.target.value)}
            />
            <Button
              size="sm"
              className={compact ? "h-7 text-xs" : ""}
              onClick={applyStatus}
              disabled={isPending || !selectedStatus}
            >
              Применить
            </Button>
          </>
        )}

        {terminal && (
          <span className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
            Заявка закрыта
          </span>
        )}
      </div>

      {selectedStatus === "done" && (
        <div className={compact ? "rounded border bg-background p-2 max-w-xl" : "rounded-md border bg-background p-3 max-w-xl"}>
          <Label className="text-xs">Итоговый комментарий *</Label>
          <Textarea
            className="mt-1"
            placeholder="Опишите выполненные работы"
            value={completionComment}
            onChange={(e) => setCompletionComment(e.target.value)}
            rows={compact ? 2 : 2}
          />
        </div>
      )}

      {awaitingUserConfirm && (
        <p className={compact ? "text-xs text-amber-700 dark:text-amber-300" : "text-sm text-amber-700 dark:text-amber-300"}>
          Ожидает подтверждения заявителя ({request.requesterName})
        </p>
      )}

      {awaitingUserConfirm && isAdmin && (
        <div className={compact ? "rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1.5 max-w-xl" : "rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2 max-w-xl"}>
          <p className={compact ? "text-xs font-medium" : "text-sm font-medium"}>Закрыть без подтверждения заявителя</p>
          <Textarea
            placeholder="Причина закрытия…"
            value={adminForceCloseComment}
            onChange={(e) => setAdminForceCloseComment(e.target.value)}
            rows={2}
            className={compact ? "text-xs" : ""}
          />
          <Button
            size="sm"
            variant="destructive"
            className={compact ? "h-7 text-xs" : ""}
            onClick={adminForceClose}
            disabled={isPending || !adminForceCloseComment.trim()}
          >
            Закрыть без подтверждения
          </Button>
        </div>
      )}
    </div>
  );
}
