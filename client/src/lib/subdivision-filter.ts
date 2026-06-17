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

type SubdivisionScopedRow = {
  subdivisionId?: number | null;
  equipmentId?: string | null;
};

/** Задача/заявка/событие: subdivisionId на записи или оборудование в выбранном подразделении. */
export function matchesSubdivisionScope(
  item: SubdivisionScopedRow,
  filterId: number | null,
  equipmentIdsInFilterScope?: Set<string>
): boolean {
  if (filterId == null) return true;
  if (item.subdivisionId === filterId) return true;
  if (item.equipmentId && equipmentIdsInFilterScope?.has(item.equipmentId)) return true;
  return false;
}

export function filterBySubdivisionScope<T extends SubdivisionScopedRow>(
  items: T[],
  filterId: number | null,
  equipmentIdsInFilterScope?: Set<string>
): T[] {
  if (filterId == null) return items;
  return items.filter((item) =>
    matchesSubdivisionScope(item, filterId, equipmentIdsInFilterScope)
  );
}

/** Замечание: subdivisionId или equipmentId в scope подразделения. */
export function filterRemarksBySubdivisionScope<
  T extends { equipmentId: string; subdivisionId?: number | null },
>(
  remarks: T[],
  filterId: number | null,
  equipmentIdsInFilterScope: Set<string>
): T[] {
  if (filterId == null) return remarks;
  return remarks.filter(
    (r) =>
      r.subdivisionId === filterId || equipmentIdsInFilterScope.has(r.equipmentId)
  );
}

export function countOpenRemarks<
  T extends { status: string; subdivisionId?: number | null; equipmentId: string },
>(remarks: T[], filterId: number | null, equipmentIdsInFilterScope: Set<string>): number {
  return filterRemarksBySubdivisionScope(remarks, filterId, equipmentIdsInFilterScope).filter(
    (r) => r.status === "open" || r.status === "in_progress"
  ).length;
}

export function countCriticalRemarks<
  T extends {
    priority: string;
    status: string;
    subdivisionId?: number | null;
    equipmentId: string;
  },
>(remarks: T[], filterId: number | null, equipmentIdsInFilterScope: Set<string>): number {
  return filterRemarksBySubdivisionScope(remarks, filterId, equipmentIdsInFilterScope).filter(
    (r) =>
      r.priority === "critical" && r.status !== "resolved" && r.status !== "closed"
  ).length;
}
