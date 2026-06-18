/** Циклы из количества изделий: pieces / cavities (гнёзда). */
export function piecesToCycles(producedPieces: number, cavities: number | null | undefined): number {
  const nests = Math.max(cavities ?? 1, 1);
  if (producedPieces <= 0) return 0;
  return Math.ceil(producedPieces / nests);
}

export function cyclesUntilMaintenance(
  maintenanceCycleInterval: number | null | undefined,
  cyclesSinceMaintenance: number
): number | null {
  if (!maintenanceCycleInterval || maintenanceCycleInterval <= 0) return null;
  return Math.max(0, maintenanceCycleInterval - cyclesSinceMaintenance);
}

export function cyclesRemainingGuarantee(
  cyclesUntilGuarantee: number | null | undefined,
  cycleCounterTotal: number
): number | null {
  if (!cyclesUntilGuarantee || cyclesUntilGuarantee <= 0) return null;
  return Math.max(0, cyclesUntilGuarantee - cycleCounterTotal);
}

export function isMaintenanceDue(
  maintenanceCycleInterval: number | null | undefined,
  cyclesSinceMaintenance: number
): boolean {
  if (!maintenanceCycleInterval || maintenanceCycleInterval <= 0) return false;
  return cyclesSinceMaintenance >= maintenanceCycleInterval;
}
