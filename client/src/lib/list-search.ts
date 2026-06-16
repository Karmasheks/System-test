export function normalizeListSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Локальный поиск по списку: query пустой — все строки совпадают. */
export function matchesListSearch(
  query: string,
  values: (string | number | null | undefined)[]
): boolean {
  const q = normalizeListSearchQuery(query);
  if (!q) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(q));
}
