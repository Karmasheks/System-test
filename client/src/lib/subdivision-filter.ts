import type { SubdivisionScope } from "@shared/subdivision-scope";
import { canAccessSubdivision } from "@shared/subdivision-scope";

/** Фильтр по выбранному подразделению (для админа) поверх данных, уже отфильтрованных API. */
export function matchesSubdivisionFilter(
  subdivisionId: number | null | undefined,
  filterId: number | null
): boolean {
  if (filterId == null) return true;
  return subdivisionId === filterId;
}

export function filterItemsBySubdivision<T extends { subdivisionId?: number | null }>(
  items: T[],
  filterId: number | null
): T[] {
  if (filterId == null) return items;
  return items.filter((item) => item.subdivisionId === filterId);
}

/** Фильтр для сущностей с массивом subdivisionIds (контакты, поставщики). */
export function matchesSubdivisionIdsFilter(
  subdivisionIds: number[] | null | undefined,
  filterId: number | null
): boolean {
  if (filterId == null) return true;
  return (subdivisionIds ?? []).includes(filterId);
}

export function filterItemsBySubdivisionIds<T extends { subdivisionIds?: number[] | null }>(
  items: T[],
  filterId: number | null
): T[] {
  if (filterId == null) return items;
  return items.filter((item) => matchesSubdivisionIdsFilter(item.subdivisionIds, filterId));
}

export function equipmentIdsInScope(
  equipment: { id: string; subdivisionId?: number | null }[],
  filterId: number | null,
  scope: SubdivisionScope | null
): Set<string> {
  let list = equipment;
  if (filterId != null) {
    list = list.filter((e) => e.subdivisionId === filterId);
  } else if (scope && !scope.viewAll) {
    list = list.filter((e) => canAccessSubdivision(scope, e.subdivisionId));
  }
  return new Set(list.map((e) => e.id));
}
