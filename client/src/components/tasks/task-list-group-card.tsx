import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkedTaskTree } from "@/components/tasks/linked-task-tree";
import type { TaskListGroup } from "@/lib/task-list-groups";
import { taskTypeLabel, taskPriorityLabel } from "@shared/task-constants";
import { taskStatusLabel } from "@shared/task-status-constants";
import { TASK_SOURCE_LABELS, type TaskSourceType } from "@shared/task-source-constants";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Bell, AlertTriangle, Link2, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyWorkParams } from "@/hooks/use-my-work-params";

export type TaskListItemData = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  taskType?: string | null;
  maintenanceType?: string | null;
  dueDate?: string | Date | null;
  equipmentId?: string | null;
  subdivisionId?: number | null;
  createdBy?: string;
  createdAt?: string | Date | null;
  assigneeName?: string | null;
  openedByName?: string;
  openedAt?: string | Date | null;
  lastModifiedBy?: string;
  completedBy?: string;
  sourceType?: string | null;
  parentTaskId?: number | null;
};

type SharedProps<T extends TaskListItemData> = {
  equipmentName: (id: string | null | undefined) => string;
  subdivisionName: (id: number | null | undefined) => string | null;
  getPriorityColor: (priority: string) => string;
  getStatusColor: (status: string) => string;
  isOverdue: (task: T) => boolean;
  hasReminder: (task: T) => boolean;
  canOpenTask: (task: T) => boolean;
  onOpen: (task: T) => void;
};

type Props<T extends TaskListItemData> = SharedProps<T> & {
  group: TaskListGroup<T>;
};

function TaskMetaChips<T extends TaskListItemData>({
  task,
  equipmentName,
  subdivisionName,
  getPriorityColor,
  getStatusColor,
  isOverdue,
  hasReminder,
  linkedCount,
}: Pick<
  SharedProps<T>,
  "equipmentName" | "subdivisionName" | "getPriorityColor" | "getStatusColor" | "isOverdue" | "hasReminder"
> & {
  task: T;
  linkedCount?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {linkedCount != null && linkedCount > 1 && (
        <Badge
          variant="outline"
          className="border-violet-400/50 text-violet-800 dark:text-violet-200 text-xs"
        >
          <Link2 className="h-3 w-3 mr-1" />
          {linkedCount} связанных
        </Badge>
      )}
      {linkedCount == null && (
        <Badge variant="outline" className="border-violet-400/50 text-violet-800 dark:text-violet-200 text-xs">
          <ListTodo className="h-3 w-3 mr-1" />
          Отдельная задача
        </Badge>
      )}
      {task.sourceType && (
        <Badge variant="secondary" className="text-xs">
          {TASK_SOURCE_LABELS[task.sourceType as TaskSourceType] ?? task.sourceType}
        </Badge>
      )}
      <Badge variant="outline" className="text-xs border-gray-300 dark:border-gray-600">
        {taskTypeLabel(task.taskType, task.maintenanceType)}
      </Badge>
      {task.equipmentId && (
        <Badge variant="secondary" className="text-xs max-w-[180px] text-multiline">
          {equipmentName(task.equipmentId)}
        </Badge>
      )}
      {task.subdivisionId && (
        <Badge variant="outline" className="text-xs max-w-[140px] text-multiline">
          {subdivisionName(task.subdivisionId)}
        </Badge>
      )}
      <Badge className={cn(getPriorityColor(task.priority), "text-xs")}>
        {taskPriorityLabel(task.priority)}
      </Badge>
      <Badge className={cn(getStatusColor(task.status), "text-xs")}>
        {taskStatusLabel(task.status)}
      </Badge>
      {hasReminder(task) && <Bell className="w-4 h-4 text-yellow-500" />}
      {isOverdue(task) && <AlertTriangle className="w-4 h-4 text-red-500" />}
    </div>
  );
}

function TaskMetaFooter<T extends TaskListItemData>({ task }: { task: T }) {
  const parts: string[] = [];
  if (task.dueDate) {
    parts.push(`Срок: ${format(new Date(task.dueDate), "dd.MM.yyyy", { locale: ru })}`);
  }
  if (task.assigneeName) parts.push(`Исполнитель: ${task.assigneeName}`);
  if (task.createdBy) {
    parts.push(
      `Создал: ${task.createdBy}${
        task.createdAt ? ` · ${format(new Date(task.createdAt), "dd.MM.yyyy", { locale: ru })}` : ""
      }`
    );
  }
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground px-1">
      {parts.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </div>
  );
}

function TaskListCardShell<T extends TaskListItemData>({
  chips,
  tree,
  task,
}: {
  chips: ReactNode;
  tree: ReactNode;
  task: T;
}) {
  return (
    <Card className="relative transition-shadow hover:shadow-md h-full">
      <CardContent className="pt-4 space-y-3">
        {chips}
        {tree}
        {task.description && (
          <p className="text-sm text-muted-foreground text-multiline px-1">{task.description}</p>
        )}
        <TaskMetaFooter task={task} />
      </CardContent>
    </Card>
  );
}

export function TaskListGroupCard<T extends TaskListItemData>(props: Props<T>) {
  const { group, canOpenTask, onOpen, ...shared } = props;
  const [, setLocation] = useLocation();
  const { scope } = useMyWorkParams();
  const task = group.root;

  const openServiceRequest = (requestId: number) => {
    const q = new URLSearchParams({ from: "tasks" });
    if (scope !== "all") q.set("scope", scope);
    setLocation(`/service-requests/${requestId}?${q.toString()}`);
  };

  const openById = (id: number) => {
    const t = group.tasks.find((x) => x.id === id);
    if (t && canOpenTask(t)) onOpen(t);
  };

  const chips = (
    <TaskMetaChips
      task={task}
      {...shared}
      linkedCount={group.kind === "linked" ? group.tasks.length : undefined}
    />
  );

  if (group.kind === "solo") {
    return (
      <TaskListCardShell
        task={task}
        chips={chips}
        tree={
          <LinkedTaskTree
            single
            variant="accent"
            groupLabel={`Задача #${task.id}`}
            groupHint={task.equipmentId ? shared.equipmentName(task.equipmentId) : "Клик — открыть"}
            rootTask={{
              id: task.id,
              title: task.title,
              status: task.status,
              taskType: task.taskType,
            }}
            childTasks={[]}
            onOpenTask={openById}
          />
        }
      />
    );
  }

  const groupLabel = group.serviceRequestId
    ? `Заявка #${group.serviceRequestId}`
    : `Задача #${group.rootTaskId ?? task.id}`;

  return (
    <TaskListCardShell
      task={task}
      chips={chips}
      tree={
        <LinkedTaskTree
          variant="accent"
          groupLabel={groupLabel}
          groupHint={
            group.serviceRequestId
              ? "Заголовок — открыть заявку, строка — задачу"
              : "Клик по строке — открыть задачу"
          }
          onOpenGroup={
            group.serviceRequestId ? () => openServiceRequest(group.serviceRequestId!) : undefined
          }
          rootTask={{
            id: task.id,
            title: task.title,
            status: task.status,
            taskType: task.taskType,
          }}
          childTasks={group.children.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            taskType: t.taskType,
          }))}
          onOpenTask={openById}
        />
      }
    />
  );
}
