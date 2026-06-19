export type ShiftBreakFields = {
  hours: number;
  startTime?: string;
  endTime?: string;
  lunchMinutes?: number;
  breakMinutes?: number;
};

export type ShiftTimelineSegmentKind = "work" | "lunch" | "break";

export type ShiftTimelineSegment = {
  kind: ShiftTimelineSegmentKind;
  /** Минуты от начала смены (календарного интервала). */
  startMin: number;
  endMin: number;
  label: string;
};

export const DEFAULT_LUNCH_MINUTES = 60;
export const DEFAULT_BREAK_MINUTES = 60;

export function parseTimeToMinutes(time: string | undefined | null): number | null {
  if (!time?.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function formatMinutesToTime(totalMin: number): string {
  const normalized = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function resolveShiftBreakMinutes(slot: Pick<ShiftBreakFields, "lunchMinutes" | "breakMinutes">) {
  return {
    lunchMinutes: slot.lunchMinutes ?? DEFAULT_LUNCH_MINUTES,
    breakMinutes: slot.breakMinutes ?? DEFAULT_BREAK_MINUTES,
  };
}

/** Календарная длительность смены с учётом обеда и перерывов (мин). */
export function computeShiftWallMinutes(
  hours: number,
  lunchMinutes = DEFAULT_LUNCH_MINUTES,
  breakMinutes = DEFAULT_BREAK_MINUTES
): number {
  return Math.max(0, Math.round(hours * 60) + lunchMinutes + breakMinutes);
}

export function computeShiftEndTime(
  startTime: string | undefined,
  hours: number,
  lunchMinutes = DEFAULT_LUNCH_MINUTES,
  breakMinutes = DEFAULT_BREAK_MINUTES
): string | null {
  const start = parseTimeToMinutes(startTime);
  if (start == null) return null;
  return formatMinutesToTime(
    start + computeShiftWallMinutes(hours, lunchMinutes, breakMinutes)
  );
}

/** Сегменты смены для графика: работа / обед / перерывы. */
export function buildShiftTimelineSegments(
  hours: number,
  lunchMinutes = DEFAULT_LUNCH_MINUTES,
  breakMinutes = DEFAULT_BREAK_MINUTES
): ShiftTimelineSegment[] {
  const workTotal = Math.max(0, Math.round(hours * 60));
  const lunch = Math.max(0, lunchMinutes);
  const breaks = Math.max(0, breakMinutes);
  const breakHalf = Math.floor(breaks / 2);
  const breakRest = breaks - breakHalf;

  if (workTotal === 0 && lunch === 0 && breaks === 0) {
    return [];
  }

  if (workTotal === 0) {
    const segs: ShiftTimelineSegment[] = [];
    let cursor = 0;
    if (breakHalf > 0) {
      segs.push({ kind: "break", startMin: cursor, endMin: cursor + breakHalf, label: "Перерыв" });
      cursor += breakHalf;
    }
    if (lunch > 0) {
      segs.push({ kind: "lunch", startMin: cursor, endMin: cursor + lunch, label: "Обед" });
      cursor += lunch;
    }
    if (breakRest > 0) {
      segs.push({ kind: "break", startMin: cursor, endMin: cursor + breakRest, label: "Перерыв" });
    }
    return segs;
  }

  const w = Math.floor(workTotal / 3);
  const wRemainder = workTotal - w * 3;

  let cursor = 0;
  const segs: ShiftTimelineSegment[] = [];

  const pushWork = (dur: number) => {
    if (dur <= 0) return;
    segs.push({ kind: "work", startMin: cursor, endMin: cursor + dur, label: "Работа" });
    cursor += dur;
  };
  const pushPause = (dur: number, kind: "lunch" | "break", label: string) => {
    if (dur <= 0) return;
    segs.push({ kind, startMin: cursor, endMin: cursor + dur, label });
    cursor += dur;
  };

  pushWork(w);
  pushPause(breakHalf, "break", "Перерыв");
  pushWork(w);
  pushPause(lunch, "lunch", "Обед");
  pushWork(w + wRemainder);
  pushPause(breakRest, "break", "Перерыв");

  return segs;
}

export function segmentClockLabel(startTime: string | undefined, offsetMin: number): string | null {
  const start = parseTimeToMinutes(startTime);
  if (start == null) return null;
  return formatMinutesToTime(start + offsetMin);
}
