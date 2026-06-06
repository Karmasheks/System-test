import type { UserPermissionOverrides } from "./permissions-constants";

export type SubdivisionScope =
  | { viewAll: true }
  | { viewAll: false; ids: number[] };

export interface SubdivisionScopeUser {
  role: string;
  subdivisionId?: number | null;
  extraSubdivisionIds?: number[] | null;
  viewAllSubdivisions?: boolean | null;
  permissionOverrides?: UserPermissionOverrides | null;
}

export function normalizeExtraSubdivisionIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is number => typeof id === "number" && id > 0);
}

export function resolveSubdivisionScope(user: SubdivisionScopeUser): SubdivisionScope {
  if (user.role === "admin") {
    return { viewAll: true };
  }
  if (user.viewAllSubdivisions) {
    return { viewAll: true };
  }
  const overrides = user.permissionOverrides;
  if (overrides?.viewAllSubdivisions) {
    return { viewAll: true };
  }
  const ids = new Set<number>();
  if (user.subdivisionId && user.subdivisionId > 0) {
    ids.add(user.subdivisionId);
  }
  for (const id of normalizeExtraSubdivisionIds(user.extraSubdivisionIds)) {
    ids.add(id);
  }
  return { viewAll: false, ids: Array.from(ids) };
}

export function canAccessSubdivision(
  scope: SubdivisionScope,
  subdivisionId: number | null | undefined
): boolean {
  if (scope.viewAll) return true;
  if (subdivisionId == null) return false;
  return scope.ids.includes(subdivisionId);
}

export function filterBySubdivisionScope<T extends { subdivisionId?: number | null }>(
  items: T[],
  scope: SubdivisionScope
): T[] {
  if (scope.viewAll) return items;
  if (scope.ids.length === 0) return [];
  const allowed = new Set(scope.ids);
  return items.filter((item) => item.subdivisionId != null && allowed.has(item.subdivisionId));
}
