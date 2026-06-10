import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SUBTASK_QUICK_TYPES, type TaskTypeCode } from "@shared/task-constants";
import { ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ServiceRequestWorkProgressBar,
  type ServiceRequestWorkProgress,
} from "@/components/service-requests/service-request-work-progress";
import { LinkedTaskTree } from "@/components/tasks/linked-task-tree";

export type ServiceRequestLinkedTask = {
  id: number;
  title: string;
  status: string;
  taskType?: string | null;
  parentTaskId?: number | null;
};

type Props = {
  serviceRequestId: number;
  linkedTasks: ServiceRequestLinkedTask[];
  workProgress?: ServiceRequestWorkProgress | null;
  onOpenTask?: (taskId: number) => void;
  onCreateSubtask?: (body: { title: string; taskType?: string }) => Promise<void>;
  canCreate?: boolean;
  isPending?: boolean;
  className?: string;
  fillHeight?: boolean;
};

export function ServiceRequestSubtasksPanel({
  serviceRequestId,
  linkedTasks,
  workProgress = null,
  onOpenTask,
  onCreateSubtask,
  canCreate = false,
  isPending = false,
  className,
  fillHeight = false,
}: Props) {
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskType, setSubtaskType] = useState<TaskTypeCode>("task");

  const rootTask = useMemo(
    () => linkedTasks.find((t) => t.parentTaskId == null) ?? null,
    [linkedTasks]
  );

  const sortedSubtasks = useMemo(() => {
    const subtasksOnly = linkedTasks.filter((t) => t.parentTaskId != null);
    return [...subtasksOnly].sort((a, b) => {
      const order = (s: string) =>
        s === "in_progress" ? 0 : s === "pending" ? 1 : s === "completed" ? 2 : 3;
      const d = order(a.status) - order(b.status);
      return d !== 0 ? d : a.id - b.id;
    });
  }, [linkedTasks]);

  const showPanel =
    rootTask != null || sortedSubtasks.length > 0 || (canCreate && onCreateSubtask);
  if (!showPanel) return null;

  const addSubtask = async () => {
    if (!onCreateSubtask || !subtaskTitle.trim()) return;
    await onCreateSubtask({ title: subtaskTitle.trim(), taskType: subtaskType });
    setSubtaskTitle("");
  };

  return (
    <Card
      className={cn(
        "border-primary/30 shadow-md",
        fillHeight && "flex flex-col min-h-[28rem] lg:min-h-[calc(100vh-14rem)] h-full",
        className
      )}
    >
      <CardHeader className="py-2 px-4 bg-primary/5 border-b border-primary/10 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <ListTodo className="h-4 w-4 text-primary" />
            Задачи заявки
          </CardTitle>
          {workProgress && workProgress.subtasksTotal > 0 && (
            <Badge variant="secondary" className="tabular-nums text-[10px]">
              {workProgress.subtasksCompleted}/{workProgress.subtasksTotal}
            </Badge>
          )}
        </div>
        {workProgress && workProgress.subtasksTotal > 0 && (
          <ServiceRequestWorkProgressBar progress={workProgress} compact className="mt-1.5" />
        )}
      </CardHeader>
      <CardContent
        className={cn(
          "px-3 py-3 space-y-2 flex flex-col flex-1 min-h-0",
          fillHeight && "pb-3"
        )}
      >
        <LinkedTaskTree
          className={cn(fillHeight && sortedSubtasks.length > 3 && "flex-1 min-h-0")}
          groupLabel={`Заявка #${serviceRequestId}`}
          groupHint={
            rootTask
              ? `Главная задача #${rootTask.id} и ${sortedSubtasks.length} этап(ов) работ`
              : `${sortedSubtasks.length} связанных задач`
          }
          rootTask={rootTask}
          childTasks={sortedSubtasks}
          onOpenTask={onOpenTask}
        />

        {sortedSubtasks.length === 0 && !rootTask && (
          <p className="text-xs text-muted-foreground py-1">Задач пока нет.</p>
        )}

        {canCreate && onCreateSubtask && (
          <div className="rounded-md border bg-muted/30 p-2 space-y-1.5 shrink-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Новый этап
            </p>
            <div className="flex flex-wrap gap-1">
              {SUBTASK_QUICK_TYPES.map((t) => (
                <Button
                  key={t.code}
                  type="button"
                  size="sm"
                  variant={subtaskType === t.code ? "default" : "outline"}
                  className="h-6 text-[10px] px-2"
                  onClick={() => setSubtaskType(t.code)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Название этапа…"
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                variant="default"
                size="sm"
                className="shrink-0 h-8"
                disabled={!subtaskTitle.trim() || isPending}
                onClick={addSubtask}
              >
                Создать
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
