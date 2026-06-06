import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CircleDot } from "lucide-react";

export type ServiceRequestWorkProgress = {
  subtasksTotal: number;
  subtasksCompleted: number;
  subtasksProgress: number;
  requestStatus: string;
  requestComplete: boolean;
  overallProgress: number;
  inProgressSubtasks?: { id: number; title: string }[];
};

type Props = {
  progress: ServiceRequestWorkProgress;
  compact?: boolean;
  className?: string;
};

export function ServiceRequestWorkProgressBar({ progress, compact, className }: Props) {
  const { subtasksTotal, subtasksCompleted, subtasksProgress, overallProgress, inProgressSubtasks } =
    progress;

  return (
    <div className={className ?? "space-y-2"}>
      <div className="flex justify-between text-sm font-medium gap-2">
        <span>{compact ? "Прогресс" : "Прогресс работ"}</span>
        <span className="tabular-nums shrink-0">
          {subtasksTotal > 0
            ? `${subtasksCompleted}/${subtasksTotal} подзадач · ${overallProgress}%`
            : `${overallProgress}%`}
        </span>
      </div>
      <Progress value={overallProgress} className="h-2" />
      {!compact && subtasksTotal > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary" className="font-normal">
            Подзадачи: {subtasksProgress}%
          </Badge>
          {progress.requestComplete && (
            <Badge variant="default" className="font-normal">
              Заявка закрыта
            </Badge>
          )}
        </div>
      )}
      {!compact && (inProgressSubtasks?.length ?? 0) > 0 && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
            <CircleDot className="w-3.5 h-3.5" />
            Сейчас в работе
          </p>
          {inProgressSubtasks!.map((t) => (
            <p key={t.id} className="text-sm text-amber-900 dark:text-amber-100">
              #{t.id} {t.title}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
