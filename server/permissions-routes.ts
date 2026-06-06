import type { Express, Request, Response } from "express";
import {
  createRoleAccessProfileSchema,
  updateRoleAccessProfileSchema,
  updateUserPermissionsSchema,
} from "@shared/schema";
import {
  DASHBOARD_BLOCK_DEFINITIONS,
  MODULE_DEFINITIONS,
  SENSITIVE_FIELD_DEFINITIONS,
  TASK_CAPABILITY_DEFINITIONS,
  type AccessLevel,
  type AppModule,
  type DashboardBlock,
  type SensitiveField,
} from "@shared/permissions-constants";
import {
  createRoleAccessProfile,
  deleteRoleAccessProfile,
  ensureDefaultRoleProfiles,
  getAllRoleAccessProfiles,
  getEffectivePermissionsForUser,
  roleProfileExists,
  upsertRoleAccessProfile,
} from "./permissions-service";
import { storage } from "./storage";

type AuthedRequest = Request & { user?: { id: number; role: string } };

export function registerPermissionsRoutes(
  app: Express,
  authenticate: (req: Request, res: Response, next: () => void) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: () => void) => void
) {
  app.get("/api/permissions/meta", authenticate, async (_req, res) => {
    try {
      await ensureDefaultRoleProfiles();
      const profiles = await getAllRoleAccessProfiles();
      return res.json({
        modules: MODULE_DEFINITIONS,
        sensitiveFields: SENSITIVE_FIELD_DEFINITIONS,
        dashboardBlocks: DASHBOARD_BLOCK_DEFINITIONS,
        taskCapabilities: TASK_CAPABILITY_DEFINITIONS,
        roles: profiles.map((p) => ({
          role: p.role,
          label: p.label,
          isSystem: p.isSystem,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/permissions/roles", authenticate, requireRole(["admin"]), async (_req, res) => {
    try {
      await ensureDefaultRoleProfiles();
      const profiles = await getAllRoleAccessProfiles();
      return res.json(profiles);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/permissions/roles",
    authenticate,
    requireRole(["admin"]),
    async (req, res) => {
      try {
        const parsed = createRoleAccessProfileSchema.parse(req.body);
        const profile = await createRoleAccessProfile(parsed);
        return res.status(201).json(profile);
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
    }
  );

  app.put(
    "/api/permissions/roles/:role",
    authenticate,
    requireRole(["admin"]),
    async (req, res) => {
      try {
        const role = req.params.role;
        if (role === "admin") {
          return res.status(400).json({ message: "Профиль admin нельзя изменить" });
        }
        if (!(await roleProfileExists(role))) {
          return res.status(404).json({ message: "Роль не найдена" });
        }

        const parsed = updateRoleAccessProfileSchema.parse(req.body);
        const profile = await upsertRoleAccessProfile(role, {
          label: parsed.label,
          modules: parsed.modules as Record<AppModule, AccessLevel>,
          hiddenFields: parsed.hiddenFields as SensitiveField[],
          hiddenDashboardBlocks: parsed.hiddenDashboardBlocks as DashboardBlock[],
          taskCapabilities: parsed.taskCapabilities,
        });

        return res.json(profile);
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/permissions/roles/:role",
    authenticate,
    requireRole(["admin"]),
    async (req, res) => {
      try {
        await deleteRoleAccessProfile(req.params.role);
        return res.status(204).send();
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
    }
  );

  app.put(
    "/api/users/:id/permissions",
    authenticate,
    requireRole(["admin"]),
    async (req: AuthedRequest, res) => {
      try {
        const userId = parseInt(req.params.id, 10);
        const parsed = updateUserPermissionsSchema.parse(req.body);

        const updated = await storage.updateUser(userId, {
          useCustomPermissions: parsed.useCustomPermissions,
          permissionOverrides: parsed.permissionOverrides ?? null,
        });

        if (!updated) {
          return res.status(404).json({ message: "Пользователь не найден" });
        }

        const effectivePermissions = await getEffectivePermissionsForUser(updated);
        const { password, ...safeUser } = updated;
        return res.json({ ...safeUser, effectivePermissions });
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
    }
  );
}
