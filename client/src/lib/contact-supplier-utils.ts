import type { Equipment } from "@shared/schema";

export function normalizeEquipmentIds(
  row: { equipmentId?: string | null; equipmentIds?: string[] | null }
): string[] {
  if (row.equipmentIds?.length) return row.equipmentIds;
  if (row.equipmentId) return [row.equipmentId];
  return [];
}

export function normalizeSubdivisionIds(row: { subdivisionIds?: number[] | null }): number[] {
  return row.subdivisionIds ?? [];
}

export function equipmentLabels(ids: string[], equipment: Equipment[]): string {
  if (!ids.length) return "—";
  return ids
    .map((id) => equipment.find((e) => e.id === id)?.name ?? id)
    .join(", ");
}

export function subdivisionLabels(ids: number[], subdivisions: { id: number; name: string }[]): string {
  if (!ids.length) return "—";
  return ids
    .map((id) => subdivisions.find((s) => s.id === id)?.name ?? `#${id}`)
    .join(", ");
}

export function buildEquipmentLinkPayload(
  equipmentIds: string[],
  allEquipment: Equipment[]
): {
  equipmentIds: string[];
  equipmentId: string | null;
  equipmentName: string | null;
} {
  const unique = [...new Set(equipmentIds.filter(Boolean))];
  const first = unique[0] ? allEquipment.find((e) => e.id === unique[0]) : undefined;
  const names = unique
    .map((id) => allEquipment.find((e) => e.id === id)?.name ?? id)
    .join(", ");
  return {
    equipmentIds: unique,
    equipmentId: unique[0] ?? null,
    equipmentName: names || first?.name || null,
  };
}
