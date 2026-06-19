import { z } from "zod";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_LUNCH_MINUTES,
  computeShiftEndTime,
  resolveShiftBreakMinutes,
} from "./shift-timeline-utils";

export const shiftSlotSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  /** Рабочие (производственные) часы — для норм и плана. */
  hours: z.number().positive(),
  startTime: z.string().optional(),
  /** Календарное окончание с учётом обеда и перерывов. */
  endTime: z.string().optional(),
  /** Обед, мин (не входит в hours). */
  lunchMinutes: z.number().min(0).max(240).optional(),
  /** Прочие перерывы за смену, мин (не входят в hours). */
  breakMinutes: z.number().min(0).max(240).optional(),
});

export const shiftTemplatePatternSchema = z.object({
  slots: z.array(shiftSlotSchema).min(1).max(3),
});

export type ShiftSlot = z.infer<typeof shiftSlotSchema>;
export type ShiftTemplatePattern = z.infer<typeof shiftTemplatePatternSchema>;

export const DEFAULT_SHIFT_SLOTS: ShiftSlot[] = [
  {
    code: "1",
    name: "Смена 1",
    hours: 11,
    startTime: "08:00",
    endTime: "21:00",
    lunchMinutes: DEFAULT_LUNCH_MINUTES,
    breakMinutes: DEFAULT_BREAK_MINUTES,
  },
  {
    code: "2",
    name: "Смена 2",
    hours: 11,
    startTime: "19:00",
    endTime: "08:00",
    lunchMinutes: DEFAULT_LUNCH_MINUTES,
    breakMinutes: DEFAULT_BREAK_MINUTES,
  },
];

export const DEFAULT_SHIFT_TEMPLATE_PATTERN: ShiftTemplatePattern = {
  slots: DEFAULT_SHIFT_SLOTS,
};

function normalizeShiftSlot(slot: ShiftSlot): ShiftSlot {
  const { lunchMinutes, breakMinutes } = resolveShiftBreakMinutes(slot);
  const endTime =
    computeShiftEndTime(slot.startTime, slot.hours, lunchMinutes, breakMinutes) ??
    slot.endTime;
  return {
    ...slot,
    lunchMinutes,
    breakMinutes,
    endTime: endTime ?? slot.endTime,
  };
}

function normalizeShiftSlots(slots: ShiftSlot[]): ShiftSlot[] {
  return slots.map(normalizeShiftSlot);
}

export function parseShiftTemplatePattern(raw: unknown): ShiftTemplatePattern {
  const parsed = shiftTemplatePatternSchema.safeParse(raw);
  if (parsed.success) {
    return { slots: normalizeShiftSlots(parsed.data.slots) };
  }
  return DEFAULT_SHIFT_TEMPLATE_PATTERN;
}
