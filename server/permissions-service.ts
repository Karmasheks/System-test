import { db } from "./db";
import { roleAccessProfiles, users, type User } from "@shared/schema";
import {
  DEFAULT_ROLE_ACCESS_PROFILES,
  MODULE_DEFINITIONS,
  SYSTEM_ROLES,
  isSystemRole,
  isValidRoleKey,
  type AccessLevel,
  type AppModule,
  type DashboardBlock,
  type EffectivePermissions,
  type RoleAccessProfile,
  type SensitiveField,
  type TaskCapabilities,
  type UserPermissionOverrides,
  deriveTaskCapabilities,
  normalizeRole,
  normalizeTaskCapabilities,
} from "@shared/permissions-constants";
import { eq, sql } from "drizzle-orm";
import {
  normalizeExtraSubdivisionIds,
  normalizeManagedSubdivisionIds,
  resolveManagedSubdivisionIds,
  resolveSubdivisionScope,
} from "@shared/subdivision-scope";
import { isSubdivisionAdminRole } from "@shared/subdivision-admin-roles";

const MODULE_KEYS = MODULE_DEFINITIONS.map((m) => m.key);

function fullModuleMap(
  partial: Record<string, AccessLevel> | Partial<Record<AppModule, AccessLevel>>
): Record<AppModule, AccessLevel> {
  const base = Object.fromEntries(MODULE_KEYS.map((k) => [k, "none" as AccessLevel])) as Record<
    AppModule,
    AccessLevel
  >;
  for (const [key, level] of Object.entries(partial)) {
    if (MODULE_KEYS.includes(key as AppModule) && level) {
      base[key as AppModule] = level;
    }
  }
  return base;
}

function rowToProfile(row: typeof roleAccessProfiles.$inferSelect): RoleAccessProfile {
  const modules = fullModuleMap(row.modules as Record<string, AccessLevel>);
  const stored = row.taskCapabilities as TaskCapabilities | null | undefined;
  return {
    role: normalizeRole(row.role),
    label: row.label || row.role,
    isSystem: row.isSystem,
    modules,
    hiddenFields: (row.hiddenFields ?? []) as SensitiveField[],
    hiddenDashboardBlocks: (row.hiddenDashboardBlocks ?? []) as DashboardBlock[],
    taskCapabilities: normalizeTaskCapabilities(
      stored as Partial<TaskCapabilities> | null | undefined,
      modules
    ),
  };
}

export async function ensureDefaultRoleProfiles(): Promise<void> {
  for (const profile of DEFAULT_ROLE_ACCESS_PROFILES) {
    await db
      .insert(roleAccessProfiles)
      .values({
        role: profile.role,
        label: profile.label,
        isSystem: profile.isSystem,
        modules: profile.modules,
        hiddenFields: profile.hiddenFields,
        hiddenDashboardBlocks: profile.hiddenDashboardBlocks,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: roleAccessProfiles.role,
        set: {
          label: profile.label,
          isSystem: profile.isSystem,
          updatedAt: new Date(),
        },
      });
  }

  await db.execute(sql`
    UPDATE role_access_profiles
    SET hidden_dashboard_blocks = '[]'::jsonb
    WHERE hidden_dashboard_blocks IS NULL
  `);
  await db.execute(sql`
    UPDATE role_access_profiles
    SET label = role
    WHERE label IS NULL OR label = ''
  `);

  for (const profile of DEFAULT_ROLE_ACCESS_PROFILES) {
    if (profile.hiddenDashboardBlocks.length === 0) continue;
    await db.execute(sql`
      UPDATE role_access_profiles
      SET hidden_dashboard_blocks = ${JSON.stringify(profile.hiddenDashboardBlocks)}::jsonb
      WHERE role = ${profile.role}
        AND is_system = true
        AND hidden_dashboard_blocks = '[]'::jsonb
    `);
  }
}

export async function getAllRoleAccessProfiles(): Promise<RoleAccessProfile[]> {
  await ensureDefaultRoleProfiles();
  const rows = await db.select().from(roleAccessProfiles).orderBy(roleAccessProfiles.role);
  return rows.map(rowToProfile);
}

export async function getRoleAccessProfile(role: string): Promise<RoleAccessProfile> {
  await ensureDefaultRoleProfiles();
  const normalized = normalizeRole(role);
  const row = await db
    .select()
    .from(roleAccessProfiles)
    .where(eq(roleAccessProfiles.role, normalized))
    .limit(1);

  if (row[0]) {
    return rowToProfile(row[0]);
  }

  const fallback = DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === normalized);
  return fallback ?? DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === "viewer")!;
}

export async function roleProfileExists(role: string): Promise<boolean> {
  await ensureDefaultRoleProfiles();
  const normalized = normalizeRole(role);
  const row = await db
    .select({ role: roleAccessProfiles.role })
    .from(roleAccessProfiles)
    .where(eq(roleAccessProfiles.role, normalized))
    .limit(1);
  return row.length > 0;
}

export async function createRoleAccessProfile(data: {
  role: string;
  label: string;
}): Promise<RoleAccessProfile> {
  const role = data.role.trim();
  if (isSubdivisionAdminRole(role)) {
    throw new Error("Роли администраторов подразделений создаются автоматически");
  }
  if (!isValidRoleKey(role)) {
    throw new Error("Некорректный ключ роли");
  }
  if (await roleProfileExists(role)) {
    throw new Error("Роль с таким ключом уже существует");
  }

  const template = DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === "viewer")!;
  await db.insert(roleAccessProfiles).values({
    role,
    label: data.label.trim(),
    isSystem: false,
    modules: template.modules,
    hiddenFields: template.hiddenFields,
    hiddenDashboardBlocks: template.hiddenDashboardBlocks,
    taskCapabilities: template.taskCapabilities,
    updatedAt: new Date(),
  });

  return getRoleAccessProfile(role);
}

export async function deleteRoleAccessProfile(role: string): Promise<void> {
  const normalized = normalizeRole(role);
  if (isSubdivisionAdminRole(normalized)) {
    throw new Error("Роль администратора подразделения удаляется вместе с подразделением");
  }
  if (normalized === "admin" || isSystemRole(normalized)) {
    throw new Error("Системную роль нельзя удалить");
  }

  const usersWithRole = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, normalized))
    .limit(1);
  if (usersWithRole.length > 0) {
    throw new Error("Роль назначена пользователям — сначала смените роль у них");
  }

  await db.delete(roleAccessProfiles).where(eq(roleAccessProfiles.role, normalized));
}

export async function upsertRoleAccessProfile(
  role: string,
  data: {
    label?: string;
    modules: Record<AppModule, AccessLevel>;
    hiddenFields: SensitiveField[];
    hiddenDashboardBlocks: DashboardBlock[];
    taskCapabilities?: TaskCapabilities;
  }
): Promise<RoleAccessProfile> {
  const normalized = normalizeRole(role);
  if (normalized === "admin") {
    throw new Error("Профиль admin нельзя изменить");
  }
  if (!(await roleProfileExists(normalized))) {
    throw new Error("Роль не найдена");
  }

  const modules = fullModuleMap(data.modules);
  const taskCapabilities = data.taskCapabilities ?? deriveTaskCapabilities(modules);
  const existing = await db
    .select()
    .from(roleAccessProfiles)
    .where(eq(roleAccessProfiles.role, normalized))
    .limit(1);

  await db
    .insert(roleAccessProfiles)
    .values({
      role: normalized,
      label: data.label ?? existing[0]?.label ?? normalized,
      isSystem: existing[0]?.isSystem ?? isSystemRole(normalized),
      modules,
      hiddenFields: data.hiddenFields,
      hiddenDashboardBlocks: data.hiddenDashboardBlocks,
      taskCapabilities,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: roleAccessProfiles.role,
      set: {
        ...(data.label ? { label: data.label } : {}),
        modules,
        hiddenFields: data.hiddenFields,
        hiddenDashboardBlocks: data.hiddenDashboardBlocks,
        taskCapabilities,
        updatedAt: new Date(),
      },
    });

  return getRoleAccessProfile(normalized);
}

export function resolveEffectivePermissions(
  user: Pick<
    User,
    | "role"
    | "useCustomPermissions"
    | "permissionOverrides"
    | "subdivisionId"
    | "extraSubdivisionIds"
    | "managedSubdivisionIds"
    | "viewAllSubdivisions"
  >,
  roleProfile: RoleAccessProfile
): EffectivePermissions {
  const role = normalizeRole(user.role);
  let modules = { ...roleProfile.modules };
  let hiddenFields = [...roleProfile.hiddenFields];
  let hiddenDashboardBlocks = [...roleProfile.hiddenDashboardBlocks];

  if (user.useCustomPermissions && user.permissionOverrides) {
    const overrides = user.permissionOverrides as UserPermissionOverrides;
    if (overrides.modules) {
      modules = { ...modules, ...fullModuleMap(overrides.modules) };
    }
    if (overrides.hiddenFields) {
      hiddenFields = overrides.hiddenFields;
    }
    if (overrides.hiddenDashboardBlocks) {
      hiddenDashboardBlocks = overrides.hiddenDashboardBlocks;
    }
  }

  if (role === "admin") {
    modules = fullModuleMap(
      Object.fromEntries(MODULE_KEYS.map((k) => [k, "edit"])) as Record<AppModule, AccessLevel>
    );
    hiddenFields = [];
    hiddenDashboardBlocks = [];
  }

  let taskCapabilities = { ...roleProfile.taskCapabilities };
  if (user.useCustomPermissions && user.permissionOverrides) {
    const overrides = user.permissionOverrides as UserPermissionOverrides;
    if (overrides.taskCapabilities) {
      taskCapabilities = normalizeTaskCapabilities(
        {
          ...taskCapabilities,
          ...overrides.taskCapabilities,
        },
        modules
      );
    }
  }
  if (role === "admin") {
    taskCapabilities = {
      create: true,
      viewCreated: true,
      process: true,
      convertToServiceRequest: true,
    };
  }

  const managedSubdivisionIds = resolveManagedSubdivisionIds(user);
  const subdivisionScope = resolveSubdivisionScope({
    role: user.role,
    subdivisionId: user.subdivisionId,
    extraSubdivisionIds: normalizeExtraSubdivisionIds(user.extraSubdivisionIds),
    managedSubdivisionIds,
    permissionOverrides: user.permissionOverrides as UserPermissionOverrides | null,
  });

  if (role !== "admin" && managedSubdivisionIds.length > 0) {
    modules = { ...modules, users: modules.users === "none" ? "edit" : modules.users };
  }

  return {
    role,
    useCustomPermissions: !!user.useCustomPermissions,
    modules,
    hiddenFields,
    hiddenDashboardBlocks,
    taskCapabilities,
    subdivisionScope,
    primarySubdivisionId: user.subdivisionId ?? null,
    extraSubdivisionIds: normalizeExtraSubdivisionIds(user.extraSubdivisionIds),
    managedSubdivisionIds,
    isSubdivisionAdmin:
      role !== "admin" && (managedSubdivisionIds.length > 0 || isSubdivisionAdminRole(role)),
    isSystemAdmin: role === "admin",
  };
}

export async function getEffectivePermissionsForUser(
  user: Pick<
    User,
    | "role"
    | "useCustomPermissions"
    | "permissionOverrides"
    | "subdivisionId"
    | "extraSubdivisionIds"
    | "managedSubdivisionIds"
    | "viewAllSubdivisions"
  >
): Promise<EffectivePermissions> {
  const profile = await getRoleAccessProfile(user.role);
  return resolveEffectivePermissions(user, profile);
}

export function isKnownRole(role: string): boolean {
  return role === "admin" || SYSTEM_ROLES.includes(role as (typeof SYSTEM_ROLES)[number]);
}
