import type { ShiftSlot } from "./shift-template-types";

export type PlanDistributionLine = {
  planDate: string;
  shiftCode: string;
  plannedQuantity: number;
};

export function buildAutoPlanDistribution(input: {
  totalQuantity: number;
  startDate: string;
  endDate?: string;
  slots: ShiftSlot[];
  /** Какие смены задействовать по порядку в каждый день (коды из slots) */
  activeShiftCodes: string[];
  normByShift: Record<string, number>;
  maxDays?: number;
}): PlanDistributionLine[] {
  const qty = Math.max(0, input.totalQuantity);
  if (qty === 0 || input.activeShiftCodes.length === 0) return [];

  const slotByCode = new Map(input.slots.map((s) => [s.code, s]));
  const codes = input.activeShiftCodes.filter((c) => slotByCode.has(c));
  if (codes.length === 0) return [];

  const lines: PlanDistributionLine[] = [];
  let remaining = qty;
  const cursor = new Date(input.startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = input.endDate ? new Date(input.endDate) : null;
  if (end) end.setHours(0, 0, 0, 0);
  const maxDays = input.maxDays ?? 365;

  for (let day = 0; day < maxDays && remaining > 0; day++) {
    const planDate = cursor.toISOString().slice(0, 10);
    if (end && cursor > end) break;

    for (const shiftCode of codes) {
      if (remaining <= 0) break;
      const norm = input.normByShift[shiftCode];
      if (!norm || norm <= 0) continue;
      const chunk = Math.min(remaining, norm);
      lines.push({ planDate, shiftCode, plannedQuantity: chunk });
      remaining -= chunk;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (remaining > 0) {
    const last = lines[lines.length - 1];
    if (last) {
      last.plannedQuantity += remaining;
    } else {
      const planDate = new Date(input.startDate).toISOString().slice(0, 10);
      lines.push({
        planDate,
        shiftCode: codes[0],
        plannedQuantity: remaining,
      });
    }
  }

  return lines;
}

export function sumDistribution(lines: PlanDistributionLine[]): number {
  return lines.reduce((s, l) => s + l.plannedQuantity, 0);
}
