/** Типы ответа OEE-аналитики (этап 6 — базовая подготовка, не MES). */

export type OeePercent = number | null;

export type OeeSummaryMetrics = {
  plannedMinutes: number;
  downtimeMinutes: number;
  operatingMinutes: number;
  produced: number;
  defective: number;
  goodQuantity: number;
  normQuantity: number | null;
  varianceQuantity: number | null;
  variancePercent: number | null;
  availability: OeePercent;
  performance: OeePercent;
  quality: OeePercent;
  oee: OeePercent;
};

export type OeeOrderLine = OeeSummaryMetrics & {
  orderId: number;
  orderNumber: string;
  productId: number;
  productName: string;
};

export type OeeEquipmentLine = OeeSummaryMetrics & {
  equipmentId: string;
  equipmentName: string;
};

export type OeeAnalyticsResponse = {
  subdivisionId: number;
  from: string;
  to: string;
  equipmentId?: string | null;
  summary: OeeSummaryMetrics;
  byOrder: OeeOrderLine[];
  byEquipment: OeeEquipmentLine[];
  notes: string[];
};

export function computeOeePercent(
  availability: OeePercent,
  performance: OeePercent,
  quality: OeePercent
): OeePercent {
  if (availability == null || performance == null || quality == null) return null;
  return Math.round((availability * performance * quality) / 100) / 100;
}

export function ratioToPercent(ratio: number | null): OeePercent {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return Math.round(Math.min(100, Math.max(0, ratio * 10000)) / 100);
}
