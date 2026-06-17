import {
  deriveTaskCapabilities,
  type AppModule,
  type AccessLevel,
  type RoleAccessProfile,
} from "./permissions-constants";

export const SUBDIVISION_ADMIN_ROLE_PREFIX = "subdivision_admin_";

export function buildSubdivisionAdminRoleKey(subdivisionId: number): string {
  return `${SUBDIVISION_ADMIN_ROLE_PREFIX}${subdivisionId}`;
}

export function parseSubdivisionAdminRoleKey(role: string): number | null {
  const normalized = role?.trim() ?? "";
  if (!normalized.startsWith(SUBDIVISION_ADMIN_ROLE_PREFIX)) return null;
  const id = Number(normalized.slice(SUBDIVISION_ADMIN_ROLE_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function isSubdivisionAdminRole(role: string): boolean {
  return parseSubdivisionAdminRoleKey(role) != null;
}

export function subdivisionAdminRoleLabel(subdivisionName: string): string {
  return `Администратор: ${subdivisionName}`;
}

function modules(
  partial: Partial<Record<AppModule, AccessLevel>>
): Record<AppModule, AccessLevel> {
  const keys: AppModule[] = [
    "dashboard",
    "schedule",
    "equipment",
    "daily_inspection",
    "maintenance",
    "tasks",
    "service_requests",
    "contacts",
    "suppliers",
    "warehouse",
    "budget",
    "documents",
    "production_planning",
    "users",
    "reports",
  ];
  const base = Object.fromEntries(keys.map((k) => [k, "none" as AccessLevel])) as Record<
    AppModule,
    AccessLevel
  >;
  for (const [key, level] of Object.entries(partial)) {
    if (level) base[key as AppModule] = level;
  }
  return base;
}

/** Базовый профиль прав администратора подразделения */
export function buildSubdivisionAdminRoleProfile(
  subdivisionId: number,
  subdivisionName: string
): RoleAccessProfile {
  const roleModules = modules({
    dashboard: "edit",
    schedule: "edit",
    equipment: "edit",
    daily_inspection: "edit",
    maintenance: "edit",
    tasks: "edit",
    service_requests: "edit",
    contacts: "edit",
    suppliers: "edit",
    warehouse: "edit",
    budget: "edit",
    documents: "edit",
    production_planning: "edit",
    users: "edit",
    reports: "edit",
  });

  return {
    role: buildSubdivisionAdminRoleKey(subdivisionId),
    label: subdivisionAdminRoleLabel(subdivisionName),
    isSystem: true,
    modules: roleModules,
    hiddenFields: ["reports_financial"],
    hiddenDashboardBlocks: [],
    taskCapabilities: deriveTaskCapabilities(roleModules),
  };
}
