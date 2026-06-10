import { normalizeExtraSubdivisionIds } from "@shared/subdivision-scope";

/** Все подразделения, в которых работает сотрудник (основное + дополнительные). */
export function userWorkSubdivisionIds(
  subdivisionId: string | number | null | undefined,
  extraSubdivisionIds?: number[] | null
): number[] {
  const ids = new Set<number>();
  const primary = subdivisionId ? Number(subdivisionId) : 0;
  if (primary > 0) ids.add(primary);
  for (const id of normalizeExtraSubdivisionIds(extraSubdivisionIds)) {
    ids.add(id);
  }
  return Array.from(ids).sort((a, b) => a - b);
}

/** Первое в списке — основное подразделение, остальные — дополнительные. */
export function splitUserWorkSubdivisionIds(ids: number[]): {
  subdivisionId: string;
  extraSubdivisionIds: number[];
} {
  const sorted = [...new Set(ids.filter((id) => id > 0))].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { subdivisionId: "", extraSubdivisionIds: [] };
  }
  return {
    subdivisionId: String(sorted[0]),
    extraSubdivisionIds: sorted.slice(1),
  };
}
