import { storage } from "./storage";
import {
  canAccessSubdivision,
  filterBySubdivisionScope,
  type SubdivisionScope,
} from "@shared/subdivision-scope";

export type EquipmentSubdivisionRow = { id: string; subdivisionId?: number | null };

export async function loadEquipmentSubdivisionMap(): Promise<Map<string, number | null>> {
  const all = await storage.getAllEquipment();
  return new Map(all.map((e) => [e.id, e.subdivisionId ?? null]));
}

export function filterByEquipmentSubdivision<T extends { equipmentId: string }>(
  items: T[],
  equipmentMap: Map<string, number | null>,
  scope: SubdivisionScope
): T[] {
  if (scope.viewAll) return items;
  return items.filter((item) => {
    const subId = equipmentMap.get(item.equipmentId);
    return canAccessSubdivision(scope, subId);
  });
}

export async function filterMaintenanceByScope<T extends { equipmentId: string }>(
  records: T[],
  scope: SubdivisionScope | null
): Promise<T[]> {
  if (!scope || scope.viewAll) return records;
  const map = await loadEquipmentSubdivisionMap();
  return filterByEquipmentSubdivision(records, map, scope);
}

export async function filterInspectionsByScope<T extends { equipmentId: string }>(
  inspections: T[],
  scope: SubdivisionScope | null
): Promise<T[]> {
  if (!scope || scope.viewAll) return inspections;
  const map = await loadEquipmentSubdivisionMap();
  return filterByEquipmentSubdivision(inspections, map, scope);
}

export function filterAlertsByPartSubdivision<
  T extends { part?: { subdivisionId?: number | null } | null },
>(alerts: T[], scope: SubdivisionScope | null): T[] {
  if (!scope || scope.viewAll) return alerts;
  return alerts.filter((a) =>
    a.part?.subdivisionId != null && canAccessSubdivision(scope, a.part.subdivisionId)
  );
}

export function filterBudgetEntriesByScope<
  T extends { equipmentId?: string | null },
>(
  entries: T[],
  equipmentMap: Map<string, number | null>,
  scope: SubdivisionScope | null
): T[] {
  if (!scope || scope.viewAll) return entries;
  return entries.filter((e) => {
    if (!e.equipmentId) return false;
    return canAccessSubdivision(scope, equipmentMap.get(e.equipmentId));
  });
}

export { filterBySubdivisionScope, canAccessSubdivision };
