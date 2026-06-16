import type { OeeSummaryMetrics } from "./production-oee-types";

export type ReliabilityFailureSource = "service_request" | "production_downtime";

export type ReliabilityFailureEvent = {
  id: string;
  source: ReliabilityFailureSource;
  sourceId: number;
  equipmentId: string;
  equipmentName: string;
  title: string;
  repairMinutes: number;
  failureAt: string;
  resolvedAt: string | null;
};

export type ReliabilityEquipmentLine = {
  equipmentId: string;
  equipmentName: string;
  failureCount: number;
  repairMinutesTotal: number;
  operatingMinutes: number;
  mttrMinutes: number | null;
  mtbfMinutes: number | null;
  mttrHours: number | null;
  mtbfHours: number | null;
  oee: OeeSummaryMetrics | null;
};

export type ProductionReliabilitySummary = {
  failureCount: number;
  repairMinutesTotal: number;
  operatingMinutes: number;
  mttrMinutes: number | null;
  mtbfMinutes: number | null;
  mttrHours: number | null;
  mtbfHours: number | null;
  equipmentInScope: number;
  oee: OeeSummaryMetrics | null;
};

export type ProductionReliabilityReport = {
  from: string;
  to: string;
  subdivisionId: number | null;
  equipmentId: string | null;
  summary: ProductionReliabilitySummary;
  failures: ReliabilityFailureEvent[];
  byEquipment: ReliabilityEquipmentLine[];
  notes: string[];
};

export function minutesToHours(minutes: number | null): number | null {
  if (minutes == null) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

export function ratioMetric(
  numerator: number,
  denominator: number
): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}
