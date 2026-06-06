import { db } from "./db";
import { roleAccessProfiles, subdivisions, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  buildSubdivisionAdminRoleKey,
  buildSubdivisionAdminRoleProfile,
  isSubdivisionAdminRole,
  parseSubdivisionAdminRoleKey,
} from "@shared/subdivision-admin-roles";

export async function ensureSubdivisionAdminRole(
  subdivisionId: number,
  subdivisionName: string
): Promise<void> {
  const profile = buildSubdivisionAdminRoleProfile(subdivisionId, subdivisionName);
  await db
    .insert(roleAccessProfiles)
    .values({
      role: profile.role,
      label: profile.label,
      isSystem: true,
      modules: profile.modules,
      hiddenFields: profile.hiddenFields,
      hiddenDashboardBlocks: profile.hiddenDashboardBlocks,
      taskCapabilities: profile.taskCapabilities,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: roleAccessProfiles.role,
      set: {
        label: profile.label,
        isSystem: true,
        updatedAt: new Date(),
      },
    });
}

export async function syncAllSubdivisionAdminRoles(): Promise<void> {
  const rows = await db
    .select()
    .from(subdivisions)
    .where(eq(subdivisions.isActive, true));
  for (const row of rows) {
    await ensureSubdivisionAdminRole(row.id, row.name);
  }
}

export async function renameSubdivisionAdminRole(
  subdivisionId: number,
  subdivisionName: string
): Promise<void> {
  await ensureSubdivisionAdminRole(subdivisionId, subdivisionName);
}

export async function removeSubdivisionAdminRole(subdivisionId: number): Promise<void> {
  const role = buildSubdivisionAdminRoleKey(subdivisionId);
  const assigned = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, role))
    .limit(1);
  if (assigned.length > 0) return;

  await db.delete(roleAccessProfiles).where(eq(roleAccessProfiles.role, role));
}

export function applySubdivisionAdminRoleFields(data: Record<string, unknown>): void {
  const role = String(data.role ?? "").trim();
  const subdivisionId = parseSubdivisionAdminRoleKey(role);
  if (subdivisionId == null) return;

  data.managedSubdivisionIds = [subdivisionId];
  data.subdivisionId = subdivisionId;
  data.viewAllSubdivisions = false;
  data.extraSubdivisionIds = [];
}

export { isSubdivisionAdminRole, parseSubdivisionAdminRoleKey };
