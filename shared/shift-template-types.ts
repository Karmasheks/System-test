import { z } from "zod";

export const shiftSlotSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  hours: z.number().positive(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const shiftTemplatePatternSchema = z.object({
  slots: z.array(shiftSlotSchema).min(1).max(3),
});

export type ShiftSlot = z.infer<typeof shiftSlotSchema>;
export type ShiftTemplatePattern = z.infer<typeof shiftTemplatePatternSchema>;

export const DEFAULT_SHIFT_SLOTS: ShiftSlot[] = [
  { code: "1", name: "Смена 1", hours: 11, startTime: "07:00", endTime: "18:00" },
  { code: "2", name: "Смена 2", hours: 11, startTime: "19:00", endTime: "06:00" },
];

export const DEFAULT_SHIFT_TEMPLATE_PATTERN: ShiftTemplatePattern = {
  slots: DEFAULT_SHIFT_SLOTS,
};

export function parseShiftTemplatePattern(raw: unknown): ShiftTemplatePattern {
  const parsed = shiftTemplatePatternSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULT_SHIFT_TEMPLATE_PATTERN;
}
