import { Badge } from "@/components/ui/badge";
import { taskTypeLabel } from "@shared/task-constants";
import { taskStatusLabel } from "@shared/task-status-constants";
import { CircleDot, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type LinkedTaskTreeItem = {
  id: number;
  title: string;
  status: string;
  taskType?: string | null;
};

type Props = {
  groupLabel: string;
  groupHint?: string;
  rootTask?: LinkedTaskTreeItem | null;
  childTasks: LinkedTaskTreeItem[];
  highlightTaskId?: number;
  onOpenTask?: (taskId: number) => void;
  onOpenGroup?: () => void;
  className?: string;
  /** accent — фиолетовая группа в списке; plain — нейтральный стиль */
  variant?: "accent" | "plain";
  /** Одна задача без подзадач — без бейджа «главная» */
  single?: boolean;
};

function TaskRow({
  task,
  variant,
  rowVariant,
  highlight,
  onOpen,
}: {
  task: LinkedTaskTreeItem;
  variant: "accent" | "plain";
  rowVariant: "single" | "root" | "child";
  highlight?: boolean;
  onOpen?: () => void;
}) {
  const accent = variant === "accent";

  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-accent/50",
        accent && (rowVariant === "root" || rowVariant === "single") && "bg-indigo-50/80 dark:bg-indigo-950/30",
        accent && rowVariant === "child" && "bg-background/80",
        !accent && "hover:bg-muted/50",
        task.status === "in_progress" && "bg-amber-50/90 dark:bg-amber-950/25",
        task.status === "completed" && "opacity-80",
        highlight && "ring-2 ring-primary ring-inset"
      )}
      onClick={onOpen}
    >
      <span className="min-w-0 flex items-center gap-2">
        {rowVariant === "child" && (
          <span
            className={cn(
              "shrink-0 text-xs",
              accent ? "text-primary/50" : "text-muted-foreground"
            )}
          >
            └
          </span>
        )}
        <span className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "font-semibold tabular-nums shrink-0",
              accent && (rowVariant === "root" || rowVariant === "single")
                ? "text-indigo-700 dark:text-indigo-300"
                : accent
                  ? "text-primary"
                  : "text-foreground"
            )}
          >
            #{task.id}
          </span>
          {rowVariant === "root" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] h-5 px-1 shrink-0",
                accent && "border-indigo-400/60"
              )}
            >
              главная
            </Badge>
          )}
          {rowVariant === "child" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] h-5 px-1 shrink-0",
                accent && "border-violet-400/50 text-violet-700 dark:text-violet-300"
              )}
            >
              {accent && <Link2 className="h-2.5 w-2.5 mr-0.5" />}
              связана
            </Badge>
          )}
          <span className="font-medium truncate min-w-0">{task.title}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {taskTypeLabel(task.taskType)}
          </span>
        </span>
      </span>
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 text-[10px]",
          task.status === "in_progress" && "border-amber-500/70 text-amber-800 dark:text-amber-200"
        )}
      >
        {task.status === "in_progress" && <CircleDot className="w-2.5 h-2.5 mr-0.5" />}
        {taskStatusLabel(task.status)}
      </Badge>
    </button>
  );
}

export function LinkedTaskTree({
  groupLabel,
  groupHint,
  rootTask,
  childTasks,
  highlightTaskId,
  onOpenTask,
  onOpenGroup,
  className,
  variant = "plain",
  single = false,
}: Props) {
  if (!rootTask && childTasks.length === 0) return null;

  const accent = variant === "accent";

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        accent
          ? "border-2 border-violet-400/40 bg-violet-50/30 dark:bg-violet-950/15"
          : "border bg-card",
        className
      )}
    >
      <div
        className={cn(
          "px-3 py-1.5 border-b flex items-center gap-2 text-left w-full",
          accent
            ? "border-violet-300/40 bg-violet-100/60 dark:bg-violet-950/40"
            : "bg-muted/30",
          onOpenGroup && "cursor-pointer hover:bg-violet-200/70 dark:hover:bg-violet-900/50 transition-colors"
        )}
        role={onOpenGroup ? "button" : undefined}
        tabIndex={onOpenGroup ? 0 : undefined}
        onClick={onOpenGroup ? () => onOpenGroup() : undefined}
        onKeyDown={
          onOpenGroup
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenGroup();
                }
              }
            : undefined
        }
      >
        <Link2
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            accent ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground"
          )}
        />
        <div className="min-w-0">
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide truncate",
              accent ? "text-violet-900 dark:text-violet-200" : "text-muted-foreground"
            )}
          >
            {groupLabel}
          </p>
          {groupHint && (
            <p className="text-[10px] text-muted-foreground truncate">{groupHint}</p>
          )}
        </div>
      </div>
      <div className={cn(accent && "divide-y divide-violet-200/50 dark:divide-violet-900/50")}>
        {rootTask && (
          <TaskRow
            task={rootTask}
            variant={variant}
            rowVariant={single && childTasks.length === 0 ? "single" : "root"}
            highlight={highlightTaskId === rootTask.id}
            onOpen={() => onOpenTask?.(rootTask.id)}
          />
        )}
        {childTasks.length > 0 && (
          <div
            className={cn(
              rootTask &&
                accent &&
                "border-l-2 border-violet-400/35 ml-3 mr-1 my-1 rounded-bl-md"
            )}
          >
            {childTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                variant={variant}
                rowVariant="child"
                highlight={highlightTaskId === task.id}
                onOpen={() => onOpenTask?.(task.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
