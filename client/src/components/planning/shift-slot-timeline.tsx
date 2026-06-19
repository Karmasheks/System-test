import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ShiftSlotView } from "@/hooks/use-production-planning";
import {
  buildShiftTimelineSegments,
  computeShiftWallMinutes,
  formatMinutesToTime,
  parseTimeToMinutes,
  resolveShiftBreakMinutes,
  segmentClockLabel,
  type ShiftTimelineSegmentKind,
} from "@shared/shift-timeline-utils";

const SEGMENT_STYLES: Record<
  ShiftTimelineSegmentKind,
  { bar: string; legend: string }
> = {
  work: {
    bar: "bg-emerald-500/80 dark:bg-emerald-600/70",
    legend: "bg-emerald-500",
  },
  lunch: {
    bar: "bg-amber-400/90 dark:bg-amber-500/80",
    legend: "bg-amber-400",
  },
  break: {
    bar: "bg-slate-300/90 dark:bg-slate-600/80",
    legend: "bg-slate-400",
  },
};

type Props = {
  slot: ShiftSlotView;
  compact?: boolean;
};

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}

export function ShiftSlotTimeline({ slot, compact }: Props) {
  const { lunchMinutes, breakMinutes } = resolveShiftBreakMinutes(slot);
  const wallMinutes = computeShiftWallMinutes(slot.hours, lunchMinutes, breakMinutes);

  const segments = useMemo(
    () => buildShiftTimelineSegments(slot.hours, lunchMinutes, breakMinutes),
    [slot.hours, lunchMinutes, breakMinutes]
  );

  const startLabel = slot.startTime ?? "—";
  const endLabel =
    slot.endTime ??
    (slot.startTime
      ? formatMinutesToTime(
          (parseTimeToMinutes(slot.startTime) ?? 0) + wallMinutes
        )
      : "—");

  if (wallMinutes <= 0) {
    return (
      <p className="text-xs text-muted-foreground">Задайте длительность смены для графика.</p>
    );
  }

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{startLabel}</span>
        <span className="text-center px-2">
          {slot.hours} ч работы
          {(lunchMinutes > 0 || breakMinutes > 0) && (
            <>
              {" · "}
              {lunchMinutes > 0 && `обед ${formatDuration(lunchMinutes)}`}
              {lunchMinutes > 0 && breakMinutes > 0 && ", "}
              {breakMinutes > 0 && `перерывы ${formatDuration(breakMinutes)}`}
            </>
          )}
        </span>
        <span>{endLabel}</span>
      </div>

      <div
        className="relative flex h-8 w-full overflow-hidden rounded-md border bg-muted/30"
        title={`${startLabel} — ${endLabel}`}
      >
        {segments.map((seg, idx) => {
          const widthPct = ((seg.endMin - seg.startMin) / wallMinutes) * 100;
          const style = SEGMENT_STYLES[seg.kind];
          const from = segmentClockLabel(slot.startTime, seg.startMin);
          const to = segmentClockLabel(slot.startTime, seg.endMin);
          return (
            <div
              key={`${seg.kind}-${idx}`}
              className={cn(
                "h-full min-w-0 border-r border-background/40 last:border-r-0 flex items-center justify-center",
                style.bar
              )}
              style={{ width: `${widthPct}%` }}
              title={`${seg.label}${from && to ? `: ${from}–${to}` : ""}`}
            >
              {widthPct >= 8 && (
                <span className="text-[10px] font-medium text-white/95 truncate px-1 drop-shadow-sm">
                  {seg.kind === "work" ? "Работа" : seg.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-sm", SEGMENT_STYLES.work.legend)} />
          Работа
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-sm", SEGMENT_STYLES.lunch.legend)} />
          Обед
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-sm", SEGMENT_STYLES.break.legend)} />
          Перерывы
        </span>
        <span className="ml-auto tabular-nums">
          На линии: {formatDuration(wallMinutes)} ({startLabel} → {endLabel})
        </span>
      </div>
    </div>
  );
}

type DayOverviewProps = {
  slots: ShiftSlotView[];
};

export function ShiftDayTimelineOverview({ slots }: DayOverviewProps) {
  if (slots.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/10 p-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">График смен (с обедом и перерывами)</p>
      {slots.map((slot) => (
        <div key={slot.code} className="space-y-1">
          <p className="text-xs font-medium">{slot.name}</p>
          <ShiftSlotTimeline slot={slot} compact />
        </div>
      ))}
    </div>
  );
}
