export const DEFAULT_SHIFT_HOURS = 11;

/** Норма выпуска за смену (11 ч) из цикла и гнёзд. */
export function computeShiftNormFromCycle(
  cycleTimeSec: number | null | undefined,
  cavities: number | null | undefined,
  shiftHours = DEFAULT_SHIFT_HOURS
): number | null {
  if (!cycleTimeSec || cycleTimeSec <= 0) return null;
  const shotsPerShift = Math.floor((shiftHours * 3600) / cycleTimeSec);
  const c = cavities && cavities > 0 ? cavities : 1;
  return Math.floor(shotsPerShift * c);
}

export function resolveShiftNorm(
  product: {
    cycleTimeSec?: number | null;
    cavities?: number | null;
    defaultShiftNorm?: number | null;
  },
  equipmentLink?: {
    cycleTimeSecOverride?: number | null;
    shiftNormOverride?: number | null;
  } | null,
  tooling?: { cycleTimeSec?: number | null; cavities?: number | null } | null,
  options?: {
    shiftCode?: string;
    shiftHours?: number;
    shiftNormByCode?: Record<string, number>;
  }
): number | null {
  const shiftCode = options?.shiftCode;
  if (shiftCode && options?.shiftNormByCode?.[shiftCode] != null) {
    const n = options.shiftNormByCode[shiftCode];
    if (n > 0) return n;
  }

  if (equipmentLink?.shiftNormOverride != null && equipmentLink.shiftNormOverride > 0) {
    return equipmentLink.shiftNormOverride;
  }
  if (product.defaultShiftNorm != null && product.defaultShiftNorm > 0 && !shiftCode) {
    return product.defaultShiftNorm;
  }
  const cycle =
    equipmentLink?.cycleTimeSecOverride ??
    product.cycleTimeSec ??
    tooling?.cycleTimeSec;
  const cavities = product.cavities ?? tooling?.cavities;
  const hours = options?.shiftHours ?? DEFAULT_SHIFT_HOURS;
  return computeShiftNormFromCycle(cycle, cavities, hours);
}

export function computeShiftsToComplete(
  remainder: number,
  shiftNorm: number | null
): number | null {
  if (!shiftNorm || shiftNorm <= 0) return null;
  return Math.max(0, remainder / shiftNorm);
}
