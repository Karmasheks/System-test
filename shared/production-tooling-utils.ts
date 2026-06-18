import { effectivePiecesPerCycle } from "./cavities-utils";

/** Циклы из количества изделий: pieces / изделий за цикл. */
export type CycleDivisorInput =
  | number
  | null
  | undefined
  | {
      piecesPerCycle?: number | null;
      cavitiesLayout?: string | null;
      cavities?: number | null;
    };

function resolveCycleDivisor(input: CycleDivisorInput): number {
  if (input == null || typeof input === "number") {
    return Math.max(input ?? 1, 1);
  }
  return effectivePiecesPerCycle(input);
}

export function piecesToCycles(producedPieces: number, divisor: CycleDivisorInput): number {
  const perCycle = resolveCycleDivisor(divisor);
  if (producedPieces <= 0) return 0;
  return Math.ceil(producedPieces / perCycle);
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

export function warrantyUsagePercent(
  cycleCounterTotal: number,
  cyclesUntilGuarantee: number | null | undefined
): number | null {
  if (!cyclesUntilGuarantee || cyclesUntilGuarantee <= 0) return null;
  return Math.min(100, Math.round((cycleCounterTotal / cyclesUntilGuarantee) * 1000) / 10);
}

export function maintenanceUsagePercent(
  cyclesSinceMaintenance: number,
  maintenanceCycleInterval: number | null | undefined
): number | null {
  if (!maintenanceCycleInterval || maintenanceCycleInterval <= 0) return null;
  return Math.min(100, Math.round((cyclesSinceMaintenance / maintenanceCycleInterval) * 1000) / 10);
}

export type PlanQuantityByDate = { planDate: string; plannedQuantity: number };

/** Плановая дата ТО по будущему плану выпуска (смыкания = изделия ÷ гнёзда). */
export function predictNextMaintenanceDateFromPlan(
  cyclesSinceMaintenance: number,
  maintenanceCycleInterval: number | null | undefined,
  cycleDivisor: CycleDivisorInput,
  futurePlan: PlanQuantityByDate[]
): Date | null {
  if (!maintenanceCycleInterval || maintenanceCycleInterval <= 0) return null;

  const cyclesRemaining = maintenanceCycleInterval - cyclesSinceMaintenance;
  if (cyclesRemaining <= 0) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...futurePlan].sort((a, b) => a.planDate.localeCompare(b.planDate));

  let cumulativePieces = 0;
  for (const row of sorted) {
    if (row.planDate < today || row.plannedQuantity <= 0) continue;
    cumulativePieces += row.plannedQuantity;
    if (piecesToCycles(cumulativePieces, cycleDivisor) >= cyclesRemaining) {
      const d = new Date(`${row.planDate}T12:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}
