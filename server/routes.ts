import type { Express, Request, Response } from "express";
import type { User } from "../shared/schema";

// Type for authenticated user
export type AuthenticatedUser = Pick<User, 'id' | 'email' | 'role' | 'name'>;

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  normalizeEquipmentRecord,
  parseEquipmentCreatePayload,
  parseEquipmentUpdatePayload,
  generateNextEquipmentId,
} from "@shared/equipment-utils";
import { registerServiceRequestRoutes } from "./service-request-routes";
import { registerAssetManagementRoutes } from "./asset-management-routes";
import { registerWarehouseRoutes } from "./warehouse-routes";
import { registerPermissionsRoutes } from "./permissions-routes";
import { roleProfileExists } from "./permissions-service";
import { registerUploadRoutes } from "./upload-routes";
import {
  deleteEquipmentLinksForEquipment,
  getEquipmentLinksForEquipment,
  syncEquipmentLinks,
} from "./equipment-link-service";
import { getEquipmentActivity, getEquipmentLinkHistory } from "./equipment-activity-service";
import {
  listEquipmentComments,
  addEquipmentComment,
  updateEquipmentComment,
  deleteEquipmentComment,
  deleteEquipmentCommentsForEquipment,
} from "./equipment-comments-service";
import {
  logEquipmentLocationChange,
  logEquipmentStatusChange,
} from "./equipment-event-log";
import {
  reservePartForWork,
  issueTaskReservations,
  issueMaintenanceReservations,
  cancelTaskReservations,
  listTaskReservations,
} from "./part-reservation-service";
import {
  listTaskComments,
  addTaskComment,
  updateTaskComment,
  deleteTaskComment,
} from "./task-comments-service";
import { listTaskLinks, addTaskLink, removeTaskLink } from "./task-links-service";
import {
  assertCanAddTaskComment,
  assertCanViewTaskComments,
  assertCanViewTaskDetails,
  assertCanUpdateTask,
  TaskAccessError,
} from "./task-access-service";
import { notifyTaskCommentAdded, notifyNewTaskCreated } from "./task-notifications";
import { syncTaskReminderNotifications } from "./notification-sync-service";
import { registerTelegramRoutes } from "./telegram-routes";
import { serializeUserForClient } from "./user-serializer";
import { initTelegramBot } from "./telegram-bot";

const lastReminderSyncByUser = new Map<number, number>();
const REMINDER_SYNC_INTERVAL_MS = 15 * 60 * 1000;
import {
  getTaskCoexecutors,
  addTaskCoexecutor,
  removeTaskCoexecutor,
} from "./task-coexecutors-service";
import {
  addTaskCommentSchema,
  addTaskLinkSchema,
  addCoexecutorSchema,
  reservePartSchema,
  addEquipmentCommentSchema,
  updateEquipmentCommentSchema,
  updateCommentBodySchema,
} from "@shared/schema";
import {
  createTaskFromRemark,
  createTaskFromMaintenance,
  createTaskFromServiceRequest,
  createSubtask,
  listSubtasks,
  listTaskTree,
  summarizeTaskTree,
  cascadeCompleteSubtasks,
  convertTaskToServiceRequest,
  createMaintenanceFromServiceRequest,
  syncRemarkFromDailyInspection,
  countIssuesFromCheckResults,
  deriveWorkingStatus,
  getServiceRequestWorkProgress,
  taskCompletionBlockedByServiceRequest,
  tryCompleteParentTaskForServiceRequest,
} from "./task-orchestration-service";
import { getEffectivePermissionsForUser, ensureDefaultRoleProfiles } from "./permissions-service";
import { DB_UNAVAILABLE_MESSAGE, isDatabaseConnectivityError } from "./db-errors";
import { canCreateTasks, canViewCreatedTasks } from "@shared/permissions-constants";
import { normalizeActualHours } from "@shared/task-hours";
import {
  buildPresenceUpdate,
  expireStalePresenceUsers,
  resolvePresence,
  toPresenceApiRow,
} from "./presence-service";
import {
  createEquipmentType,
  findOrCreateEquipmentType,
  listEquipmentTypes,
} from "./equipment-types-service";
import { registerSubdivisionRoutes } from "./subdivision-routes";
import { registerProductionRoutes } from "./production-routes";
import { registerChatRoutes } from "./chat-routes";
import { isSuperAdminUser } from "@shared/super-admin";
import {
  canActorManageUser,
  filterUsersForActor,
  sanitizeUserWritePayload,
  usersAdminGuard,
  assertSuperAdminTargetEditable,
} from "./subdivision-admin-middleware";
import { applySubdivisionAdminRoleFields } from "./subdivision-admin-role-service";
import { isSubdivisionAdminRole } from "@shared/subdivision-admin-roles";
import {
  canManageSubdivisionId,
  isSystemAdmin,
  normalizeExtraSubdivisionIds,
  normalizeManagedSubdivisionIds,
} from "@shared/subdivision-scope";
import { initSubdivisionSystem, resolveSubdivisionFields } from "./subdivision-service";
import { resolveTaskSubdivisionId } from "./subdivision-resolve";
import {
  assertSubdivisionAccess,
  getSubdivisionScopeForRequest,
  subdivisionForbidden,
} from "./subdivision-scope-middleware";
import { filterBySubdivisionScope } from "@shared/subdivision-scope";
import { canAssignAdminPrivileges } from "@shared/super-admin";
import { addPresenceSubscriber, notifyPresenceUpdated } from "./presence-events";
import {
  loginSchema,
  registerSchema,
  insertUserSchema,
  syncEquipmentLinksSchema,
  updateProfileSchema,
  avatarUrlSchema,
  updatePresenceSchema,
  adminUpdatePresenceSchema,
  updateVacationPeriodsSchema,
} from "@shared/schema";
import { updateUiPreferencesSchema, mergeUiPreferences } from "@shared/user-ui-preferences";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import session from "express-session";
import MemoryStore from "memorystore";

// JWT secret key
const DISALLOWED_DEFAULT_SECRETS = new Set([
  "your_jwt_secret",
  "your_session_secret",
  "changeme",
  "default",
  "secret",
  "password",
]);

function requireSecret(name: "JWT_SECRET" | "SESSION_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required and must not use an insecure default.`);
  }
  if (DISALLOWED_DEFAULT_SECRETS.has(value.toLowerCase()) || value.length < 32) {
    throw new Error(`${name} is too weak. Use a random secret with at least 32 characters.`);
  }
  return value;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const jwtSecret = requireSecret("JWT_SECRET");
  const sessionSecret = requireSecret("SESSION_SECRET");
  const writeRoles = ["admin", "manager", "operator", "engineer", "technician", "service_engineer"];
  const equipmentEditRoles = ["admin", "manager", "engineer", "technician", "service_engineer"];
  
  // Session setup
  const SessionStore = MemoryStore(session);
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: process.env.NODE_ENV === "production", maxAge: 86400000 }, // 1 day
      store: new SessionStore({
        checkPeriod: 86400000, // prune expired entries every 24h
      }),
    })
  );
  
  // Auth middleware
  const authenticate = async (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.slice("Bearer ".length).trim();

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    let decoded: { id?: number; email?: string; role?: string };
    try {
      decoded = jwt.verify(token, jwtSecret) as { id?: number; email?: string; role?: string };
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (!decoded?.id || !decoded?.email || !decoded?.role) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    try {
      const user = await storage.getUser(decoded.id);

      if (!user || !user.isActive) {
        return res.status(401).json({ message: "User is inactive or not found" });
      }

      req.user = { id: user.id, email: user.email, role: user.role, name: user.name };
      next();
    } catch (error) {
      if (isDatabaseConnectivityError(error)) {
        return res.status(503).json({ message: DB_UNAVAILABLE_MESSAGE });
      }
      console.error("Auth middleware error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
  
  // Require role middleware
  const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: Function) => {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied. Insufficient permissions." });
      }
      
      next();
    };
  };

  // Type assertion helper for authenticated requests
  const assertAuthenticated = (req: Request): req is Request & { user: AuthenticatedUser } => {
    return req.user !== undefined;
  };
  
  // AUTH ROUTES
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Пользователь с таким email уже существует" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Create user with viewer role by default
      const user = await storage.createUser({
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        role: "viewer", // Новые пользователи получают только права просмотра
        position: userData.position,
        isActive: true,
      });
      
      // Create activity for user registration
      await storage.createActivity({
        userId: user.id,
        action: "Пользователь зарегистрировался",
        timestamp: new Date(),
        resourceType: "user",
        resourceId: user.id,
      });
      
      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        jwtSecret,
        { expiresIn: "1d" }
      );
      
      // Return user without password and token
      const { password, ...userWithoutPassword } = user;
      return res.status(201).json({
        user: userWithoutPassword,
        token,
        message: "Регистрация успешна! Вы получили права просмотра. Для расширения прав обратитесь к администратору."
      });
    } catch (error: any) {
  console.error("REGISTER ERROR:", error);
  return res.status(400).json({
    message: error?.message || "Ошибка регистрации",
    details: error?.stack || null,
  });
}
  });
  
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        jwtSecret,
        { expiresIn: "1d" }
      );
      
      await storage.updateUser(user.id, { lastLoginAt: new Date() });

      // Create login activity
      await storage.createActivity({
        userId: user.id,
        action: "User logged in",
        timestamp: new Date(),
        resourceType: "user",
        resourceId: user.id,
      });
      
      // Return user without password and token
      const { password: _, ...userWithoutPassword } = user;
      return res.status(200).json({
        user: userWithoutPassword,
        token,
      });
    } catch (error: unknown) {
      if (isDatabaseConnectivityError(error)) {
        return res.status(503).json({ message: DB_UNAVAILABLE_MESSAGE });
      }
      const message = error instanceof Error ? error.message : "Ошибка входа";
      return res.status(400).json({ message });
    }
  });
  
  app.get("/api/auth/me", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const effectivePermissions = await getEffectivePermissionsForUser(user);
      return res.status(200).json(serializeUserForClient(user, { effectivePermissions }));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/auth/profile", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const payload = updateProfileSchema.parse(req.body);

      if (payload.email) {
        const existingUser = await storage.getUserByEmail(payload.email);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(400).json({ message: "Пользователь с таким email уже существует" });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (payload.name !== undefined) updateData.name = payload.name;
      if (payload.email !== undefined) updateData.email = payload.email;
      if (payload.position !== undefined) updateData.position = payload.position || null;
      if (payload.phone !== undefined) updateData.phone = payload.phone || null;
      if (payload.avatar !== undefined) {
        updateData.avatar = payload.avatar?.trim() || null;
      }

      const updatedUser = await storage.updateUser(req.user.id, updateData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const effectivePermissions = await getEffectivePermissionsForUser(updatedUser);
      return res.status(200).json(serializeUserForClient(updatedUser, { effectivePermissions }));
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message ?? "Неверные данные" });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/auth/ui-preferences", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const patch = updateUiPreferencesSchema.parse(req.body);
      const currentUser = await storage.getUser(req.user.id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const merged = mergeUiPreferences(currentUser.uiPreferences, patch);
      const updatedUser = await storage.updateUser(req.user.id, { uiPreferences: merged });
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const effectivePermissions = await getEffectivePermissionsForUser(updatedUser);
      return res.status(200).json(serializeUserForClient(updatedUser, { effectivePermissions }));
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message ?? "Неверные данные" });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  registerTelegramRoutes(app, authenticate);

  app.patch("/api/auth/presence", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { status } = updatePresenceSchema.parse(req.body);
      const updatedUser = await storage.updateUser(
        req.user.id,
        buildPresenceUpdate(status)
      );
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const resolved = resolvePresence(updatedUser);
      notifyPresenceUpdated(req.user.id);
      const { password, ...userWithoutPassword } = updatedUser;
      return res.status(200).json({
        status: resolved.status,
        activityStatus: resolved.activityStatus,
        onVacation: resolved.onVacation,
        lastSeen: resolved.lastSeen,
        expiresAt: resolved.expiresAt,
        user: userWithoutPassword,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message ?? "Неверные данные" });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/auth/vacation-periods", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json({ periods: user.vacationPeriods ?? [] });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/auth/vacation-periods", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const { periods } = updateVacationPeriodsSchema.parse(req.body);
      const updatedUser = await storage.updateUser(req.user.id, { vacationPeriods: periods });
      if (!updatedUser) return res.status(404).json({ message: "User not found" });
      return res.json({ periods: updatedUser.vacationPeriods ?? [] });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message ?? "Неверные данные" });
      }
      return res.status(500).json({ message: error.message });
    }
  });
  
  // USER ROUTES - этот эндпоинт удален, используется реальный ниже
  
  // ROLE ROUTES
  app.get("/api/roles", authenticate, requireRole(["admin"]), async (_, res) => {
    try {
      const roles = await storage.getAllRoles();
      return res.status(200).json(roles);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  app.post("/api/roles", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const role = await storage.createRole(req.body);
      
      // Create activity
      await storage.createActivity({
        userId: req.user.id,
        action: "Created role",
        timestamp: new Date(),
        resourceType: "role",
        resourceId: role.id,
      });
      
      return res.status(201).json(role);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  app.put("/api/roles/:id", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const roleId = parseInt(req.params.id);
      const updatedRole = await storage.updateRole(roleId, req.body);
      
      if (!updatedRole) {
        return res.status(404).json({ message: "Role not found" });
      }
      
      // Create activity
      await storage.createActivity({
        userId: req.user.id,
        action: "Updated role",
        timestamp: new Date(),
        resourceType: "role",
        resourceId: roleId,
      });
      
      return res.status(200).json(updatedRole);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  // CAMPAIGN ROUTES
  app.get("/api/campaigns", authenticate, async (_, res) => {
    try {
      const campaigns = await storage.getAllCampaigns();
      return res.status(200).json(campaigns);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  app.post("/api/campaigns", authenticate, requireRole(["admin", "marketing_manager"]), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const campaign = await storage.createCampaign(req.body);
      
      // Create activity
      await storage.createActivity({
        userId: req.user.id,
        action: "Created campaign",
        timestamp: new Date(),
        resourceType: "campaign",
        resourceId: campaign.id,
      });
      
      return res.status(201).json(campaign);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  app.put("/api/campaigns/:id", authenticate, requireRole(["admin", "marketing_manager"]), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const campaignId = parseInt(req.params.id);
      const updatedCampaign = await storage.updateCampaign(campaignId, req.body);
      
      if (!updatedCampaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Create activity
      await storage.createActivity({
        userId: req.user.id,
        action: "Updated campaign",
        timestamp: new Date(),
        resourceType: "campaign",
        resourceId: campaignId,
      });
      
      return res.status(200).json(updatedCampaign);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  // TASK ROUTES
  app.get("/api/tasks", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      let tasks;
      const workScope = req.query.scope as string | undefined;

      if (workScope === "assigned" || workScope === "created") {
        const fullUser = await storage.getUser(req.user.id);
        if (!fullUser) return res.status(401).json({ message: "User not found" });
        const perms = await getEffectivePermissionsForUser(fullUser);

        if (workScope === "created") {
          if (!canViewCreatedTasks(perms.taskCapabilities) && req.user.role !== "admin") {
            return res.status(403).json({ message: "Недостаточно прав для просмотра созданных задач" });
          }
        }

        const { listTasksForUserScope } = await import("./user-work-service");
        tasks = await listTasksForUserScope(req.user.id, workScope);
      } else if (req.query.userId) {
        tasks = await storage.getTasksByUserId(parseInt(req.query.userId as string));
      } else if (req.query.campaignId) {
        tasks = await storage.getTasksByCampaignId(parseInt(req.query.campaignId as string));
      } else {
        tasks = await storage.getAllTasks();
      }

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        tasks = filterBySubdivisionScope(tasks, subScope);
      }
      
      return res.status(200).json(tasks);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tasks/stats", authenticate, async (req, res) => {
    try {
      let allTasks = await storage.getAllTasks();
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        allTasks = filterBySubdivisionScope(allTasks, subScope);
      }

      const stats = {
        total: allTasks.length,
        pending: allTasks.filter((t) => t.status === "pending").length,
        inProgress: allTasks.filter((t) => t.status === "in_progress").length,
        completed: allTasks.filter((t) => t.status === "completed").length,
        overdue: allTasks.filter((t) => {
          if (!t.dueDate || t.status === "completed") return false;
          return new Date(t.dueDate) < new Date();
        }).length,
      };

      return res.status(200).json(stats);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  app.post("/api/tasks", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const fullUser = await storage.getUser(req.user.id);
      if (!fullUser) return res.status(401).json({ message: "User not found" });
      const perms = await getEffectivePermissionsForUser(fullUser);
      if (!canCreateTasks(perms.taskCapabilities)) {
        return res.status(403).json({ message: "Недостаточно прав для создания задач" });
      }
      
      console.log('Received task data:', req.body);

      const isAdminRole =
        req.user.role === "admin" || req.user.role === "marketing_manager";

      if (req.body.parentTaskId) {
        const subAssigneeId =
          isAdminRole && req.body.assigneeId ? Number(req.body.assigneeId) : null;
        const subtask = await createSubtask(
          Number(req.body.parentTaskId),
          {
            title: String(req.body.title ?? "Подзадача"),
            description: req.body.description ?? null,
            priority: req.body.priority ?? "medium",
            status: req.body.status ?? "pending",
            taskType: req.body.taskType ?? "task",
            maintenanceType: req.body.maintenanceType ?? null,
            equipmentId: req.body.equipmentId ?? null,
            dueDate:
              isAdminRole && req.body.dueDate ? new Date(req.body.dueDate) : null,
            assigneeId: subAssigneeId ?? undefined,
            assigneeName: subAssigneeId ? (req.body.assigneeName ?? null) : null,
            createdBy: req.user.name,
            createdById: req.user.id,
          },
          req.user
        );
        await storage.createTaskStatusHistory({
          taskId: subtask.id,
          fromStatus: null,
          toStatus: subtask.status ?? "pending",
          changedById: req.user.id,
          changedByName: req.user.name,
          comment: `Создана как подзадача #${req.body.parentTaskId}`,
        });
        return res.status(201).json(subtask);
      }
      
      const hasAssignee =
        isAdminRole &&
        req.body.assigneeId != null &&
        req.body.assigneeId !== "" &&
        !Number.isNaN(Number(req.body.assigneeId));
      const assigneeId = hasAssignee ? Number(req.body.assigneeId) : null;
      const assigneeName = hasAssignee ? (req.body.assigneeName ?? null) : null;
      const partReservation = req.body.partReservation as
        | { partId?: number; quantity?: number }
        | undefined;

      const subdivisionId = await resolveTaskSubdivisionId({
        explicitId: req.body.subdivisionId != null ? Number(req.body.subdivisionId) : null,
        equipmentId: req.body.equipmentId ?? null,
        userSubdivisionId: fullUser.subdivisionId,
      });
      if (subdivisionId) {
        const subScope = await getSubdivisionScopeForRequest(req);
        if (subScope) {
          try {
            assertSubdivisionAccess(subScope, subdivisionId);
          } catch {
            return subdivisionForbidden(res);
          }
        }
      }

      const taskData = {
        title: String(req.body.title ?? ""),
        description: req.body.description ? String(req.body.description) : null,
        userId: req.user.id,
        assigneeId,
        assigneeName,
        status: req.body.status ?? "pending",
        priority: req.body.priority ?? "medium",
        taskType: req.body.taskType ?? null,
        maintenanceType: req.body.maintenanceType ?? null,
        equipmentId: req.body.equipmentId ?? null,
        subdivisionId,
        dueDate:
          isAdminRole && req.body.dueDate ? new Date(req.body.dueDate) : null,
        reminderDate: req.body.reminderDate ? new Date(req.body.reminderDate) : null,
        estimatedHours:
          isAdminRole &&
          req.body.estimatedHours != null &&
          req.body.estimatedHours !== ""
            ? Math.round(Number(req.body.estimatedHours))
            : null,
        actualHours:
          req.body.actualHours != null && req.body.actualHours !== ""
            ? normalizeActualHours(Number(req.body.actualHours))
            : null,
        assigneeAssignedAt: assigneeId ? new Date() : null,
        createdBy: req.user.name,
        createdById: req.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      console.log('Processed task data:', taskData);
      
      const task = await storage.createTask(taskData);

      if (partReservation?.partId && partReservation?.quantity) {
        await reservePartForWork(
          Number(partReservation.partId),
          Number(partReservation.quantity),
          req.user,
          {
            taskId: task.id,
            taskTitle: task.title,
            equipmentId: task.equipmentId ?? undefined,
          }
        );
      }

      await storage.createTaskStatusHistory({
        taskId: task.id,
        fromStatus: null,
        toStatus: task.status ?? "pending",
        changedById: req.user.id,
        changedByName: req.user.name,
        comment: "Создание задачи",
      });

      await notifyNewTaskCreated(task, req.user.id);

      const { syncToirAndRecalculateProduction } = await import("./production-toir-integration-service");
      await syncToirAndRecalculateProduction(task.equipmentId, {
        id: req.user.id,
        name: req.user.name,
      });
      
      // Create activity
      await storage.createActivity({
        userId: req.user.id,
        action: "Created task",
        timestamp: new Date(),
        resourceType: "task",
        resourceId: task.id,
      });
      
      return res.status(201).json(task);
    } catch (error: any) {
      console.error('Task creation error:', error);
      return res.status(500).json({ message: error.message });
    }
  });
  
  app.put("/api/tasks/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const fullUser = await storage.getUser(req.user.id);
      if (!fullUser) return res.status(401).json({ message: "User not found" });
      const perms = await getEffectivePermissionsForUser(fullUser);
      if (!perms.taskCapabilities.process) {
        return res.status(403).json({ message: "Недостаточно прав для изменения задач" });
      }
      
      const taskId = parseInt(req.params.id);
      const task = await assertCanUpdateTask(req.user, taskId);
      
      console.log('Received task update data:', req.body);

      const isAdminRole =
        req.user.role === "admin" || req.user.role === "marketing_manager";
      
      const partReservation = req.body.partReservation as
        | { partId?: number; quantity?: number }
        | undefined;

      // Обрабатываем даты правильно
      const taskUpdateData: Record<string, unknown> = {
        ...req.body,
        lastModifiedBy: req.user.name,
        lastModifiedById: req.user.id,
        dueDate: isAdminRole
          ? req.body.dueDate
            ? new Date(req.body.dueDate)
            : null
          : task.dueDate,
        reminderDate: req.body.reminderDate ? new Date(req.body.reminderDate) : null,
        estimatedHours: isAdminRole
          ? req.body.estimatedHours != null && req.body.estimatedHours !== ""
            ? Math.round(Number(req.body.estimatedHours))
            : null
          : task.estimatedHours,
        updatedAt: new Date(),
      };

      if (isAdminRole && "assigneeId" in req.body) {
        const rawAssignee = req.body.assigneeId;
        if (rawAssignee == null || rawAssignee === "" || rawAssignee === "none") {
          taskUpdateData.assigneeId = null;
          taskUpdateData.assigneeName = null;
          taskUpdateData.assigneeAssignedAt = null;
          taskUpdateData.userId = task.createdById ?? task.userId;
        } else {
          const assigneeId = Number(rawAssignee);
          if (!Number.isNaN(assigneeId)) {
            let assigneeName = req.body.assigneeName as string | null | undefined;
            if (!assigneeName) {
              const assigneeUser = await storage.getUser(assigneeId);
              assigneeName = assigneeUser?.name ?? null;
            }
            taskUpdateData.userId = assigneeId;
            taskUpdateData.assigneeId = assigneeId;
            taskUpdateData.assigneeName = assigneeName;
            if (assigneeId !== task.assigneeId) {
              taskUpdateData.assigneeAssignedAt = new Date();
            }
          }
        }
      } else if (
        req.body.assigneeId != null &&
        req.body.assigneeId !== "" &&
        req.body.assigneeId !== "none" &&
        perms.taskCapabilities.process
      ) {
        const requestedId = Number(req.body.assigneeId);
        if (!Number.isNaN(requestedId) && requestedId === req.user.id) {
          if (task.assigneeId && task.assigneeId !== req.user.id) {
            return res.status(403).json({ message: "Задача уже назначена другому исполнителю" });
          }
          taskUpdateData.userId = req.user.id;
          taskUpdateData.assigneeId = req.user.id;
          taskUpdateData.assigneeName = req.user.name;
          if (!task.assigneeId) {
            taskUpdateData.assigneeAssignedAt = new Date();
          }
        }
      }

      if (
        req.body.subdivisionId !== undefined ||
        req.body.equipmentId !== undefined
      ) {
        const resolvedSubdivisionId = await resolveTaskSubdivisionId({
          explicitId:
            req.body.subdivisionId != null && req.body.subdivisionId !== ""
              ? Number(req.body.subdivisionId)
              : null,
          equipmentId:
            req.body.equipmentId !== undefined
              ? req.body.equipmentId || null
              : task.equipmentId,
          userSubdivisionId: fullUser.subdivisionId,
        });
        if (resolvedSubdivisionId) {
          const subScope = await getSubdivisionScopeForRequest(req);
          if (subScope) {
            try {
              assertSubdivisionAccess(subScope, resolvedSubdivisionId);
            } catch {
              return subdivisionForbidden(res);
            }
          }
        }
        taskUpdateData.subdivisionId = resolvedSubdivisionId;
      }

      if (req.body.actualHours != null && req.body.actualHours !== "") {
        taskUpdateData.actualHours = normalizeActualHours(Number(req.body.actualHours));
      }

      if (req.body.completionComment != null && String(req.body.completionComment).trim()) {
        taskUpdateData.completionComment = String(req.body.completionComment).trim();
      }

      if (req.body.status && req.body.status !== task.status) {
        if (req.body.status === "completed" && task.serviceRequestId) {
          const progress = await getServiceRequestWorkProgress(task.serviceRequestId);
          const blockMsg = taskCompletionBlockedByServiceRequest(task, progress);
          if (blockMsg) {
            return res.status(400).json({ message: blockMsg });
          }
        }

        await storage.createTaskStatusHistory({
          taskId,
          fromStatus: task.status,
          toStatus: req.body.status,
          changedById: req.user.id,
          changedByName: req.user.name,
          comment:
            req.body.status === "completed" && req.body.completionComment
              ? String(req.body.completionComment).trim()
              : undefined,
        });

        if (req.body.status === "in_progress" && !task.openedAt) {
          taskUpdateData.openedAt = new Date();
          taskUpdateData.openedById = req.user.id;
          taskUpdateData.openedByName = req.user.name;
        }

        if (req.body.status === "completed") {
          taskUpdateData.completedAt = new Date();
          taskUpdateData.completedBy = req.user.name;
          taskUpdateData.completedById = req.user.id;
        }
      }
      
      console.log('Processed task update data:', taskUpdateData);
      
      const updatedTask = await storage.updateTask(taskId, taskUpdateData as any);
      
      if (!updatedTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (req.body.status === "completed" && task.status !== "completed") {
        await issueTaskReservations(taskId, req.user, updatedTask.title);

        if (task.serviceRequestId && task.parentTaskId) {
          await tryCompleteParentTaskForServiceRequest(task.serviceRequestId, req.user);
        }

        const rootId = task.rootTaskId ?? task.id;
        if (task.id === rootId && !task.serviceRequestId) {
          const cascaded = await cascadeCompleteSubtasks(rootId, req.user, taskId);
          if (cascaded > 0) {
            console.log(`Auto-completed ${cascaded} subtask(s) for root task #${rootId}`);
          }
        }
      }

      if (
        partReservation?.partId &&
        partReservation?.quantity &&
        req.body.status !== "completed"
      ) {
        await reservePartForWork(
          Number(partReservation.partId),
          Number(partReservation.quantity),
          req.user,
          {
            taskId,
            taskTitle: updatedTask.title,
            equipmentId: updatedTask.equipmentId ?? undefined,
          }
        );
      }
      
      const { syncToirAndRecalculateProduction } = await import("./production-toir-integration-service");
      const statusActor = { id: req.user.id, name: req.user.name };
      await syncToirAndRecalculateProduction(updatedTask.equipmentId, statusActor);
      if (task.equipmentId && task.equipmentId !== updatedTask.equipmentId) {
        await syncToirAndRecalculateProduction(task.equipmentId, statusActor);
      }

      // Create activity
      await storage.createActivity({
        userId: req.user.id,
        action: `Updated task ${req.body.status === "completed" ? "to completed" : ""}`,
        timestamp: new Date(),
        resourceType: "task",
        resourceId: taskId,
      });
      
      return res.status(200).json(updatedTask);
    } catch (error: any) {
      console.error('Task update error:', error);
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const task = await assertCanViewTaskDetails(req.user, parseInt(req.params.id, 10));
      return res.status(200).json(task);
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/history", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      await assertCanViewTaskDetails(req.user, taskId);
      const history = await storage.getTaskStatusHistory(taskId);
      return res.status(200).json(history);
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/service-request-history", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      await assertCanViewTaskDetails(req.user, taskId);
      const task = await storage.getTask(taskId);
      if (!task?.serviceRequestId) {
        return res.status(200).json({ serviceRequestId: null, history: [], workProgress: null });
      }
      const { getStatusHistory } = await import("./service-request-storage");
      const history = await getStatusHistory(task.serviceRequestId);
      const workProgress = await getServiceRequestWorkProgress(task.serviceRequestId);
      return res.status(200).json({ serviceRequestId: task.serviceRequestId, history, workProgress });
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/comments", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      await assertCanViewTaskComments(req.user, taskId);
      return res.status(200).json(await listTaskComments(taskId));
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/comments", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      const task = await assertCanAddTaskComment(req.user, taskId);
      const parsed = addTaskCommentSchema.parse(req.body);
      const row = await addTaskComment(
        taskId,
        parsed.body,
        req.user,
        parsed.attachments ?? []
      );
      await notifyTaskCommentAdded(task, row);
      return res.status(201).json(row);
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 400;
      return res.status(status).json({ message: error.message });
    }
  });

  app.put("/api/tasks/:id/comments/:commentId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      const commentId = Number(req.params.commentId);
      await assertCanViewTaskComments(req.user, taskId);
      const parsed = updateCommentBodySchema.parse(req.body);
      const row = await updateTaskComment(taskId, commentId, parsed.body, req.user);
      return res.status(200).json(row);
    } catch (error: any) {
      const status =
        error instanceof TaskAccessError
          ? error.status
          : error.message === "Комментарий не найден"
            ? 404
            : error.message?.includes("Недостаточно прав")
              ? 403
              : 400;
      return res.status(status).json({ message: error.message });
    }
  });

  app.delete("/api/tasks/:id/comments/:commentId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      const commentId = Number(req.params.commentId);
      await assertCanViewTaskComments(req.user, taskId);
      await deleteTaskComment(taskId, commentId, req.user);
      return res.status(200).json({ message: "Комментарий удалён" });
    } catch (error: any) {
      const status =
        error instanceof TaskAccessError
          ? error.status
          : error.message === "Комментарий не найден"
            ? 404
            : error.message?.includes("Недостаточно прав")
              ? 403
              : 400;
      return res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/links", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      await assertCanViewTaskDetails(req.user, taskId);
      return res.status(200).json(await listTaskLinks(taskId));
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/links", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      await assertCanAddTaskComment(req.user, taskId);
      const body = addTaskLinkSchema.parse(req.body);
      const link = await addTaskLink({
        taskId,
        title: body.title,
        description: body.description,
        url: body.url,
      });
      return res.status(201).json(link);
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 400;
      return res.status(status).json({ message: error.message });
    }
  });

  app.delete("/api/tasks/:id/links/:linkId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      const linkId = Number(req.params.linkId);
      await assertCanAddTaskComment(req.user, taskId);
      const links = await listTaskLinks(taskId);
      const link = links.find((l) => l.id === linkId);
      if (!link) return res.status(404).json({ message: "Ссылка не найдена" });
      await removeTaskLink(linkId);
      return res.status(200).json({ message: "Ссылка удалена" });
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/reservations", authenticate, async (req, res) => {
    try {
      return res.status(200).json(await listTaskReservations(parseInt(req.params.id)));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/reservations", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const parsed = reservePartSchema.parse({ ...req.body, taskId });
      const row = await reservePartForWork(parsed.partId, parsed.quantity, req.user, {
        taskId,
        taskTitle: task.title,
        equipmentId: parsed.equipmentId ?? task.equipmentId ?? undefined,
        equipmentName: parsed.equipmentName,
      });
      return res.status(201).json(row);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/convert-to-service-request", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const fullUser = await storage.getUser(req.user.id);
      if (!fullUser) return res.status(401).json({ message: "User not found" });
      const perms = await getEffectivePermissionsForUser(fullUser);
      if (!perms.taskCapabilities.convertToServiceRequest) {
        return res.status(403).json({ message: "Недостаточно прав для перевода задачи в заявку" });
      }
      const result = await convertTaskToServiceRequest(parseInt(req.params.id), req.user, {
        requestType: req.body.requestType,
        problemDescription: req.body.problemDescription,
      });
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/subtasks", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      await assertCanViewTaskDetails(req.user, taskId);
      return res.status(200).json(await listSubtasks(taskId));
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/tree", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const taskId = parseInt(req.params.id, 10);
      await assertCanViewTaskDetails(req.user, taskId);
      const tree = await listTaskTree(taskId);
      if (!tree) return res.status(404).json({ message: "Задача не найдена" });
      const summary = summarizeTaskTree(tree.tasks, tree.root.id);
      return res.status(200).json({ ...tree, summary });
    } catch (error: any) {
      const status = error instanceof TaskAccessError ? error.status : 500;
      return res.status(status).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/subtasks", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const fullUser = await storage.getUser(req.user.id);
      if (!fullUser) return res.status(401).json({ message: "User not found" });
      const perms = await getEffectivePermissionsForUser(fullUser);
      if (!perms.taskCapabilities.process) {
        return res.status(403).json({ message: "Недостаточно прав для создания подзадач" });
      }
      const subtask = await createSubtask(
        parseInt(req.params.id),
        {
          title: String(req.body.title ?? "Подзадача"),
          description: req.body.description ?? null,
          priority: req.body.priority ?? "medium",
          status: req.body.status ?? "pending",
          taskType: req.body.taskType ?? "task",
          maintenanceType: req.body.maintenanceType ?? null,
          dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
          assigneeId: req.body.assigneeId ? Number(req.body.assigneeId) : req.user.id,
          assigneeName: req.body.assigneeName ?? req.user.name,
          createdBy: req.user.name,
          createdById: req.user.id,
        },
        req.user
      );
      return res.status(201).json(subtask);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/tasks/:id/coexecutors", authenticate, async (req, res) => {
    try {
      const rows = await getTaskCoexecutors(parseInt(req.params.id));
      return res.status(200).json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tasks/:id/coexecutors", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const fullUser = await storage.getUser(req.user.id);
      if (!fullUser) return res.status(401).json({ message: "User not found" });
      const perms = await getEffectivePermissionsForUser(fullUser);
      if (!perms.taskCapabilities.process) {
        return res.status(403).json({ message: "Недостаточно прав" });
      }
      const taskId = parseInt(req.params.id);
      const body = addCoexecutorSchema.parse(req.body);
      const row = await addTaskCoexecutor({ taskId, ...body });
      return res.status(201).json(row);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/tasks/:id/coexecutors/:coId", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const fullUser = await storage.getUser(req.user.id);
      if (!fullUser) return res.status(401).json({ message: "User not found" });
      const perms = await getEffectivePermissionsForUser(fullUser);
      if (!perms.taskCapabilities.process) {
        return res.status(403).json({ message: "Недостаточно прав" });
      }
      const ok = await removeTaskCoexecutor(Number(req.params.coId));
      if (!ok) return res.status(404).json({ message: "Не найдено" });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/tasks/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      // Check if user is authorized to delete the task
      if (task && task.userId !== req.user.id && req.user.role !== "admin" && req.user.role !== "marketing_manager") {
        return res.status(403).json({ message: "Not authorized to delete this task" });
      }
      
      const deleted = await storage.deleteTask(taskId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }

      await cancelTaskReservations(taskId);
      
      // Create activity
      await storage.createActivity({
        userId: req.user.id,
        action: "Deleted task",
        timestamp: new Date(),
        resourceType: "task",
        resourceId: taskId,
      });
      
      return res.status(200).json({ message: "Task deleted successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // METRICS ROUTES
  app.get("/api/metrics", authenticate, requireRole(["admin", "marketing_manager"]), async (_, res) => {
    try {
      const metrics = await storage.getAllMetrics();
      return res.status(200).json(metrics);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  app.get("/api/metrics/:userId", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const userId = parseInt(req.params.userId);
      
      // Only admins, marketing managers, or the user themselves can view their metrics
      if (req.user.id !== userId && req.user.role !== "admin" && req.user.role !== "marketing_manager") {
        return res.status(403).json({ message: "Not authorized to view these metrics" });
      }
      
      const metrics = await storage.getMetricByUserId(userId);
      
      if (!metrics) {
        return res.status(404).json({ message: "Metrics not found for this user" });
      }
      
      return res.status(200).json(metrics);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
  
  // USER ROUTES
  app.get("/api/users/list", authenticate, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(
        allUsers
          .filter((u) => u.isActive)
          .map(({ id, name, email, role, avatar, position, subdivisionId, extraSubdivisionIds }) => ({
            id,
            name,
            email,
            role,
            avatar,
            position,
            subdivisionId,
            extraSubdivisionIds,
          }))
      );
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/presence/stream", async (req, res) => {
    const tokenRaw =
      typeof req.query.token === "string"
        ? req.query.token
        : req.headers.authorization?.startsWith("Bearer ")
          ? req.headers.authorization.slice("Bearer ".length).trim()
          : null;

    if (!tokenRaw) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const decoded = jwt.verify(tokenRaw, jwtSecret) as { id?: number };
      const streamUser = decoded?.id ? await storage.getUser(decoded.id) : undefined;
      if (!streamUser || !streamUser.isActive) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      res.write(": connected\n\n");

      const heartbeat = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      const unsubscribe = addPresenceSubscriber(res, streamUser.id);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  });

  app.get("/api/users/presence", authenticate, async (req, res) => {
    try {
      await expireStalePresenceUsers();
      const allUsers = await storage.getAllUsers();
      const presenceRows = [];

      for (const user of allUsers.filter((u) => u.isActive)) {
        const resolved = resolvePresence(user);
        presenceRows.push(toPresenceApiRow(user, resolved));
      }

      if (req.user?.role === "viewer") {
        const self = presenceRows.find((u) => u.id === req.user!.id);
        return res.json(self ? [self] : []);
      }

      res.json(presenceRows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/users/:id/presence", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });

      const userId = parseInt(req.params.id, 10);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ message: "Некорректный ID пользователя" });
      }

      const { status, clearExpiry } = adminUpdatePresenceSchema.parse(req.body);
      const updatedUser = await storage.updateUser(
        userId,
        buildPresenceUpdate(status, { clearExpiry })
      );
      if (!updatedUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      await storage.createActivity({
        userId: req.user.id,
        action: `Updated presence status to ${status}`,
        timestamp: new Date(),
        resourceType: "user",
        resourceId: userId,
      });

      const resolved = resolvePresence(updatedUser);
      notifyPresenceUpdated(userId);
      return res.status(200).json({
        status: resolved.status,
        activityStatus: resolved.activityStatus,
        onVacation: resolved.onVacation,
        lastSeen: resolved.lastSeen,
        expiresAt: resolved.expiresAt,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message ?? "Неверные данные" });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id/vacation-periods", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      return res.json({ periods: user.vacationPeriods ?? [] });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/vacation-periods", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });

      const userId = parseInt(req.params.id, 10);
      const { periods } = updateVacationPeriodsSchema.parse(req.body);
      const updatedUser = await storage.updateUser(userId, { vacationPeriods: periods });
      if (!updatedUser) return res.status(404).json({ message: "Пользователь не найден" });

      await storage.createActivity({
        userId: req.user.id,
        action: "Updated vacation periods",
        timestamp: new Date(),
        resourceType: "user",
        resourceId: userId,
      });

      return res.json({ periods: updatedUser.vacationPeriods ?? [] });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message ?? "Неверные данные" });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users", authenticate, async (req, res) => {
    try {
      const actor = await usersAdminGuard(req, res);
      if (!actor) return;

      await expireStalePresenceUsers();
      const users = filterUsersForActor(actor, await storage.getAllUsers());

      const usersWithoutPasswords = users.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      return res.status(200).json(usersWithoutPasswords);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Create new user
  app.post("/api/users", authenticate, async (req, res) => {
    try {
      const actor = await usersAdminGuard(req, res);
      if (!actor) return;

      const sanitizedBody = sanitizeUserWritePayload(actor, { ...req.body });
      applySubdivisionAdminRoleFields(sanitizedBody);
      const userData = insertUserSchema.parse(sanitizedBody);
      const roleKey = (userData.role ?? "viewer").trim();

      if (!(await roleProfileExists(roleKey))) {
        return res.status(400).json({
          message:
            "Указанная роль не найдена. Создайте или выберите роль в «Настройки прав доступа».",
        });
      }

      if (userData.avatar) {
        const parsedAvatar = avatarUrlSchema.safeParse(userData.avatar);
        if (!parsedAvatar.success) {
          return res.status(400).json({
            message: parsedAvatar.error.errors[0]?.message ?? "Некорректный URL аватара",
          });
        }
        userData.avatar = userData.avatar.trim() || null;
      }
      
      // Check if user with this email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Пользователь с таким email уже существует" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      if (!canAssignAdminPrivileges(actor)) {
        userData.managedSubdivisionIds = [];
        const workSubIds = [
          userData.subdivisionId,
          ...normalizeExtraSubdivisionIds(userData.extraSubdivisionIds),
        ].filter((id): id is number => typeof id === "number" && id > 0);
        if (
          workSubIds.length === 0 ||
          workSubIds.some((id) => !canManageSubdivisionId(actor, id))
        ) {
          return res.status(403).json({ message: "Укажите подразделение из вашей зоны управления" });
        }
      } else if (userData.role === "admin") {
        userData.managedSubdivisionIds = [];
      } else if (isSubdivisionAdminRole(roleKey)) {
        applySubdivisionAdminRoleFields(userData as Record<string, unknown>);
      } else {
        userData.managedSubdivisionIds = normalizeManagedSubdivisionIds(userData.managedSubdivisionIds);
      }

      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      await storage.createActivity({
        userId: actor.id,
        action: "Created user",
        timestamp: new Date(),
        resourceType: "user",
        resourceId: user.id,
      });
      
      // Return user without password
      const { password, ...userWithoutPassword } = user;
      return res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Update user
  app.put("/api/users/:id", authenticate, async (req, res) => {
    try {
      const actor = await usersAdminGuard(req, res);
      if (!actor) return;

      const userId = parseInt(req.params.id);
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      if (!canActorManageUser(actor, targetUser)) {
        return res.status(403).json({ message: "Недостаточно прав для редактирования этого пользователя" });
      }

      let updateData: Record<string, unknown>;
      try {
        updateData = sanitizeUserWritePayload(actor, { ...req.body });
        applySubdivisionAdminRoleFields(updateData);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Недостаточно прав";
        return res.status(403).json({ message });
      }

      try {
        assertSuperAdminTargetEditable(actor, targetUser, updateData);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Недостаточно прав";
        return res.status(403).json({ message });
      }

      if (!canAssignAdminPrivileges(actor)) {
        delete updateData.managedSubdivisionIds;
      } else {
        const effectiveRole =
          updateData.role !== undefined && updateData.role !== null
            ? String(updateData.role)
            : targetUser.role;
        if (effectiveRole === "admin") {
          updateData.managedSubdivisionIds = [];
        } else if (isSubdivisionAdminRole(effectiveRole)) {
          applySubdivisionAdminRoleFields(updateData);
        } else if (updateData.managedSubdivisionIds !== undefined) {
          updateData.managedSubdivisionIds = normalizeManagedSubdivisionIds(
            updateData.managedSubdivisionIds as number[]
          );
        }
      }

      if (updateData.role !== undefined && updateData.role !== null) {
        if (!(await roleProfileExists(String(updateData.role)))) {
          return res.status(400).json({
            message:
              "Указанная роль не найдена. Создайте или выберите роль в «Настройки прав доступа».",
          });
        }
      }

      if (updateData.avatar !== undefined) {
        const avatarValue = String(updateData.avatar ?? "");
        const parsedAvatar = avatarUrlSchema.safeParse(avatarValue);
        if (!parsedAvatar.success) {
          return res.status(400).json({
            message: parsedAvatar.error.errors[0]?.message ?? "Некорректный URL аватара",
          });
        }
        updateData.avatar = avatarValue.trim() || null;
      }

      if (typeof updateData.password === "string" && updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      }
      
      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      await storage.createActivity({
        userId: actor.id,
        action: "Updated user",
        timestamp: new Date(),
        resourceType: "user",
        resourceId: userId,
      });
      
      // Return user without password
      const { password, ...userWithoutPassword } = updatedUser;
      return res.status(200).json(userWithoutPassword);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Delete user
  app.delete("/api/users/:id", authenticate, async (req, res) => {
    try {
      const actor = await usersAdminGuard(req, res);
      if (!actor) return;

      const userId = parseInt(req.params.id);

      if (userId === actor.id) {
        return res.status(400).json({ message: "Нельзя удалить собственную учетную запись" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      if (!canActorManageUser(actor, targetUser)) {
        return res.status(403).json({ message: "Недостаточно прав для удаления этого пользователя" });
      }
      if (isSuperAdminUser(targetUser)) {
        return res.status(403).json({ message: "Главного администратора не можно удалить" });
      }

      const deleted = await storage.deleteUser(userId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      
      await storage.createActivity({
        userId: actor.id,
        action: "Deleted user",
        timestamp: new Date(),
        resourceType: "user",
        resourceId: userId,
      });
      
      return res.status(200).json({ message: "Пользователь успешно удален" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // ACTIVITY ROUTES
  app.get("/api/activities", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      let activities;
      
      if (req.query.userId) {
        const userId = parseInt(req.query.userId as string);
        
        // Only admins, marketing managers, or the user themselves can view their activities
        if (req.user.id !== userId && req.user.role !== "admin" && req.user.role !== "marketing_manager") {
          return res.status(403).json({ message: "Not authorized to view these activities" });
        }
        
        activities = await storage.getActivitiesByUserId(userId);
      } else if (req.user.role === "admin" || req.user.role === "marketing_manager") {
        activities = await storage.getAllActivities();
      } else {
        activities = await storage.getActivitiesByUserId(req.user.id);
      }
      
      return res.status(200).json(activities);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // DASHBOARD DATA
  app.get("/api/dashboard", authenticate, async (req, res) => {
    try {
      // Get campaigns
      const campaigns = await storage.getAllCampaigns();
      
      // Get user metrics (for team performance)
      const metrics = await storage.getAllMetrics();
      
      // Get recent activities
      const activities = await storage.getAllActivities();
      
      // Get roles
      const roles = await storage.getAllRoles();
      
      // Generate sample performance data (would be calculated from real metrics in a production app)
      const performanceData = {
        campaigns: campaigns.length,
        campaignsChange: 8,
        openTasks: 42,
        openTasksChange: 12,
        conversionRate: 3.2,
        conversionRateChange: 0.8,
        teamProductivity: 87,
        teamProductivityChange: 5,
        teamMembers: [
          {
            id: 1,
            name: "Jane Doe",
            email: "jane.doe@example.com",
            role: "Marketing Manager",
            tasksCompleted: 24,
            tasksTotal: 30,
            onTimeRate: 92,
            productivityScore: 90,
            avatar: "JD"
          },
          {
            id: 2,
            name: "Mike Smith",
            email: "mike.smith@example.com",
            role: "Content Creator",
            tasksCompleted: 18,
            tasksTotal: 25,
            onTimeRate: 78,
            productivityScore: 72,
            avatar: "MS"
          },
          {
            id: 3,
            name: "Anna Roberts",
            email: "anna.roberts@example.com",
            role: "Social Media Specialist",
            tasksCompleted: 32,
            tasksTotal: 35,
            onTimeRate: 94,
            productivityScore: 95,
            avatar: "AR"
          }
        ]
      };
      
      return res.status(200).json({
        campaigns,
        metrics,
        activities: activities.slice(0, 10), // Latest 10 activities
        roles,
        performanceData
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // EQUIPMENT TYPE (CATEGORY) ROUTES
  app.get("/api/equipment/types", authenticate, async (_req, res) => {
    try {
      res.json(await listEquipmentTypes());
    } catch {
      res.status(500).json({ message: "Ошибка загрузки категорий оборудования" });
    }
  });

  app.post("/api/equipment/types", authenticate, requireRole(equipmentEditRoles), async (req, res) => {
    try {
      const name = String(req.body.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Укажите название категории" });
      res.status(201).json(await createEquipmentType(name));
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  // EQUIPMENT ROUTES
  app.get("/api/equipment", authenticate, async (req, res) => {
    try {
      let equipmentList = await storage.getAllEquipment();
      const scope = await getSubdivisionScopeForRequest(req);
      if (scope) {
        equipmentList = filterBySubdivisionScope(equipmentList, scope);
      }
      const subdivisionId = req.query.subdivisionId
        ? Number(req.query.subdivisionId)
        : undefined;
      if (subdivisionId && !Number.isNaN(subdivisionId)) {
        equipmentList = equipmentList.filter((e) => e.subdivisionId === subdivisionId);
      }
      return res.status(200).json(equipmentList.map((item) => normalizeEquipmentRecord(item)));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/equipment/:id", authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const item = await storage.getEquipment(id);
      if (!item) {
        return res.status(404).json({ message: "Оборудование не найдено" });
      }
      const scope = await getSubdivisionScopeForRequest(req);
      if (scope && !scope.viewAll) {
        const { canAccessSubdivision } = await import("@shared/subdivision-scope");
        if (!canAccessSubdivision(scope, item.subdivisionId)) {
          return subdivisionForbidden(res);
        }
      }
      return res.status(200).json(normalizeEquipmentRecord(item));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/equipment", authenticate, requireRole(equipmentEditRoles), async (req, res) => {
    try {
      const payload = parseEquipmentCreatePayload(req.body);
      if (!payload.id?.trim()) {
        const existing = await storage.getAllEquipment();
        payload.id = generateNextEquipmentId(existing.map((item) => item.id));
      }
      if (!payload.name) {
        return res.status(400).json({ message: "Название оборудования обязательно" });
      }
      if (!payload.type) {
        return res.status(400).json({ message: "Тип оборудования обязателен" });
      }

      const subFields = await resolveSubdivisionFields(
        payload.subdivisionId,
        payload.subdivisionName ?? payload.department
      );
      if (!subFields.subdivisionId) {
        return res.status(400).json({ message: "Укажите подразделение" });
      }
      const scope = await getSubdivisionScopeForRequest(req);
      if (scope) {
        try {
          assertSubdivisionAccess(scope, subFields.subdivisionId);
        } catch {
          return subdivisionForbidden(res);
        }
      }
      payload.subdivisionId = subFields.subdivisionId;
      payload.subdivisionName = subFields.subdivisionName;
      payload.department = subFields.subdivisionName ?? payload.department;

      await findOrCreateEquipmentType(payload.type);
      const equipmentItem = await storage.createEquipment(payload);
      return res.status(201).json(normalizeEquipmentRecord(equipmentItem));
    } catch (error: any) {
      if (error.message?.includes("duplicate key")) {
        return res.status(409).json({ message: "Оборудование с таким ID уже существует. Обновите страницу и попробуйте снова." });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/equipment/:id", authenticate, requireRole(equipmentEditRoles), async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getEquipment(id);
      if (!existing) {
        return res.status(404).json({ message: "Оборудование не найдено" });
      }

      const updateData = parseEquipmentUpdatePayload(req.body);
      const actor = req.user ? { id: req.user.id, name: req.user.name } : undefined;

      if (updateData.type?.trim()) {
        await findOrCreateEquipmentType(updateData.type);
      }

      if (updateData.subdivisionId !== undefined || updateData.subdivisionName !== undefined) {
        const subFields = await resolveSubdivisionFields(
          updateData.subdivisionId,
          updateData.subdivisionName ?? updateData.department
        );
        updateData.subdivisionId = subFields.subdivisionId;
        updateData.subdivisionName = subFields.subdivisionName;
        if (subFields.subdivisionName) updateData.department = subFields.subdivisionName;
        const scope = await getSubdivisionScopeForRequest(req);
        if (scope) {
          try {
            assertSubdivisionAccess(scope, subFields.subdivisionId);
          } catch {
            return subdivisionForbidden(res);
          }
        }
      } else {
        const scope = await getSubdivisionScopeForRequest(req);
        if (scope) {
          try {
            assertSubdivisionAccess(scope, existing.subdivisionId);
          } catch {
            return subdivisionForbidden(res);
          }
        }
      }

      const equipmentItem = await storage.updateEquipment(id, updateData);
      if (!equipmentItem) {
        return res.status(404).json({ message: "Оборудование не найдено" });
      }

      if (updateData.status !== undefined) {
        await logEquipmentStatusChange(id, existing.status, equipmentItem.status, actor);
      }
      if (updateData.location !== undefined) {
        await logEquipmentLocationChange(id, existing.location, equipmentItem.location, actor);
      }

      return res.status(200).json(normalizeEquipmentRecord(equipmentItem));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/equipment/:id/links", authenticate, async (req, res) => {
    try {
      const links = await getEquipmentLinksForEquipment(req.params.id);
      return res.status(200).json(links);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/equipment/:id/activity", authenticate, async (req, res) => {
    try {
      const activity = await getEquipmentActivity(req.params.id);
      return res.status(200).json(activity);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/equipment/:id/link-history", authenticate, async (req, res) => {
    try {
      const history = await getEquipmentLinkHistory(req.params.id);
      return res.status(200).json(history);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/equipment/:id/comments", authenticate, async (req, res) => {
    try {
      return res.status(200).json(await listEquipmentComments(req.params.id));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/equipment/:id/comments", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const parsed = addEquipmentCommentSchema.parse(req.body);
      const row = await addEquipmentComment(req.params.id, parsed.body, req.user);
      return res.status(201).json(row);
    } catch (error: any) {
      return res.status(400).json({ message: error.message ?? "Ошибка" });
    }
  });

  app.put(
    "/api/equipment/:id/comments/:commentId",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Authentication required" });
        const commentId = Number(req.params.commentId);
        if (!Number.isFinite(commentId)) {
          return res.status(400).json({ message: "Некорректный ID заметки" });
        }
        const parsed = updateEquipmentCommentSchema.parse(req.body);
        const row = await updateEquipmentComment(commentId, parsed.body, req.user);
        return res.status(200).json(row);
      } catch (error: any) {
        const status =
          error.message === "Заметка не найдена"
            ? 404
            : error.message?.includes("Недостаточно прав")
              ? 403
              : 400;
        return res.status(status).json({ message: error.message ?? "Ошибка" });
      }
    }
  );

  app.delete(
    "/api/equipment/:id/comments/:commentId",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Authentication required" });
        const commentId = Number(req.params.commentId);
        if (!Number.isFinite(commentId)) {
          return res.status(400).json({ message: "Некорректный ID заметки" });
        }
        await deleteEquipmentComment(commentId, req.user);
        return res.status(200).json({ message: "Заметка удалена" });
      } catch (error: any) {
        const status =
          error.message === "Заметка не найдена"
            ? 404
            : error.message?.includes("Недостаточно прав")
              ? 403
              : 400;
        return res.status(status).json({ message: error.message ?? "Ошибка" });
      }
    }
  );

  app.put(
    "/api/equipment/:id/links",
    authenticate,
    requireRole(equipmentEditRoles),
    async (req, res) => {
      try {
        const parsed = syncEquipmentLinksSchema.parse(req.body);
        const actor = req.user ? { id: req.user.id, name: req.user.name } : undefined;
        const links = await syncEquipmentLinks(req.params.id, parsed.links, actor);
        return res.status(200).json(links);
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
    }
  );

  app.delete("/api/equipment/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const { id } = req.params;
      await deleteEquipmentLinksForEquipment(id);
      await deleteEquipmentCommentsForEquipment(id);
      const deleted = await storage.deleteEquipment(id);
      if (!deleted) {
        return res.status(404).json({ message: "Оборудование не найдено" });
      }
      return res.status(200).json({ message: "Оборудование удалено" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

// Helper function to safely parse and validate dates
function parseMaintenanceDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// MAINTENANCE RECORDS ROUTES
app.get("/api/maintenance", authenticate, async (req, res) => {
  try {
    let records = await storage.getAllMaintenanceRecords();
    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope && !subScope.viewAll) {
      const { filterMaintenanceByScope } = await import("./subdivision-equipment-filter");
      records = await filterMaintenanceByScope(records, subScope);
    }
    return res.status(200).json(records);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/maintenance", authenticate, requireRole(writeRoles), async (req, res) => {
  try {
    console.log("MAINTENANCE CREATE BODY:", req.body);

    const scheduledDate = parseMaintenanceDate(req.body.scheduledDate);
    const completedDate = parseMaintenanceDate(req.body.completedDate);

    if (!scheduledDate) {
      return res.status(400).json({ message: "Некорректная scheduledDate" });
    }

    if (req.body.completedDate !== undefined && req.body.completedDate !== null && req.body.completedDate !== "" && !completedDate) {
      return res.status(400).json({ message: "Некорректная completedDate" });
    }

    const record = await storage.createMaintenanceRecord({
      equipmentId: String(req.body.equipmentId ?? ""),
      equipmentName: String(req.body.equipmentName ?? ""),
      maintenanceType: String(req.body.maintenanceType ?? ""),
      scheduledDate,
      completedDate,
      responsible: String(req.body.responsible ?? ""),
      status: String(req.body.status ?? "scheduled"),
      priority: String(req.body.priority ?? "medium"),
      notes: req.body.notes ? String(req.body.notes) : null,
      duration: req.body.duration ? String(req.body.duration) : null,
      createdById: req.user?.id,
      createdByName: req.user?.name,
    });

    if (req.user) {
      await storage.createMaintenanceStatusHistory({
        maintenanceRecordId: record.id,
        fromStatus: null,
        toStatus: record.status,
        changedById: req.user.id,
        changedByName: req.user.name,
        comment: "Создание записи ТО",
      });
    }

    const partReservation = req.body.partReservation as
      | { partId?: number; quantity?: number }
      | undefined;
    if (partReservation?.partId && partReservation?.quantity && req.user) {
      await reservePartForWork(
        Number(partReservation.partId),
        Number(partReservation.quantity),
        req.user,
        {
          maintenanceId: record.id,
          equipmentId: record.equipmentId,
          equipmentName: record.equipmentName,
        }
      );
    }

    if (req.user) {
      try {
        const { ensureMaintenanceTask, afterMaintenanceScheduleChange } = await import(
          "./maintenance-scheduling-service"
        );
        await ensureMaintenanceTask(record, req.user);
        await afterMaintenanceScheduleChange(record.equipmentId);
      } catch (taskErr) {
        console.error("Auto-task from maintenance failed:", taskErr);
      }
    }

    if (record.equipmentId && req.user) {
      const { syncToirAndRecalculateProduction } = await import("./production-toir-integration-service");
      await syncToirAndRecalculateProduction(record.equipmentId, {
        id: req.user.id,
        name: req.user.name,
      });
    }

    return res.status(201).json(record);
  } catch (error: any) {
    console.error("MAINTENANCE CREATE ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.put("/api/maintenance/:id", authenticate, requireRole(writeRoles), async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await storage.getMaintenanceRecord(id);
    if (!existing) {
      return res.status(404).json({ message: "Запись о техобслуживании не найдена" });
    }

    const updateData: any = {
      equipmentId: req.body.equipmentId !== undefined ? String(req.body.equipmentId) : undefined,
      equipmentName: req.body.equipmentName !== undefined ? String(req.body.equipmentName) : undefined,
      maintenanceType: req.body.maintenanceType !== undefined ? String(req.body.maintenanceType) : undefined,
      responsible: req.body.responsible !== undefined ? String(req.body.responsible) : undefined,
      status: req.body.status !== undefined ? String(req.body.status) : undefined,
      priority: req.body.priority !== undefined ? String(req.body.priority) : undefined,
      notes: req.body.notes !== undefined ? (req.body.notes ? String(req.body.notes) : null) : undefined,
      duration: req.body.duration !== undefined ? (req.body.duration ? String(req.body.duration) : null) : undefined,
      lastModifiedById: req.user?.id,
      lastModifiedByName: req.user?.name,
      updatedAt: new Date(),
    };

    if (req.body.scheduledDate !== undefined) {
      const scheduledDate = parseMaintenanceDate(req.body.scheduledDate);
      if (!scheduledDate) {
        return res.status(400).json({ message: "Некорректная scheduledDate" });
      }
      updateData.scheduledDate = scheduledDate;
    }

    if (req.body.completedDate !== undefined) {
      if (req.body.completedDate === null || req.body.completedDate === "") {
        updateData.completedDate = null;
      } else {
        const completedDate = parseMaintenanceDate(req.body.completedDate);
        if (!completedDate) {
          return res.status(400).json({ message: "Некорректная completedDate" });
        }
        updateData.completedDate = completedDate;
      }
    }

    const record = await storage.updateMaintenanceRecord(id, updateData);

    if (!record) {
      return res.status(404).json({ message: "Запись о техобслуживании не найдена" });
    }

    if (req.user && updateData.scheduledDate) {
      try {
        const { onMaintenanceScheduledDateChanged } = await import("./maintenance-scheduling-service");
        await onMaintenanceScheduledDateChanged(record, existing.scheduledDate, req.user);
      } catch (syncErr) {
        console.error("Maintenance date sync failed:", syncErr);
      }
    } else if (record.equipmentId && (req.body.status !== undefined || req.body.scheduledDate !== undefined)) {
      try {
        const { afterMaintenanceScheduleChange } = await import("./maintenance-scheduling-service");
        await afterMaintenanceScheduleChange(record.equipmentId);
      } catch (syncErr) {
        console.error("Equipment next maintenance sync failed:", syncErr);
      }
    }

      if (req.user && req.body.status !== undefined && req.body.status !== existing.status) {
        await storage.createMaintenanceStatusHistory({
          maintenanceRecordId: id,
          fromStatus: existing.status,
          toStatus: req.body.status,
          changedById: req.user.id,
          changedByName: req.user.name,
        });

        if (req.body.status === "completed" || req.body.status === "done") {
          await storage.updateMaintenanceRecord(id, {
            closedById: req.user.id,
            closedByName: req.user.name,
          });
          await issueMaintenanceReservations(id, req.user);
        }
      }

      const partReservation = req.body.partReservation as
        | { partId?: number; quantity?: number }
        | undefined;
      if (partReservation?.partId && partReservation?.quantity && req.user) {
        await reservePartForWork(
          Number(partReservation.partId),
          Number(partReservation.quantity),
          req.user,
          {
            maintenanceId: id,
            equipmentId: record.equipmentId,
            equipmentName: record.equipmentName,
          }
        );
      }

    const equipmentIdsToSync = new Set<string>();
    if (record.equipmentId) equipmentIdsToSync.add(record.equipmentId);
    if (existing.equipmentId && existing.equipmentId !== record.equipmentId) {
      equipmentIdsToSync.add(existing.equipmentId);
    }
    if (equipmentIdsToSync.size > 0 && req.user) {
      const { syncToirAndRecalculateProduction } = await import("./production-toir-integration-service");
      const actor = { id: req.user.id, name: req.user.name };
      for (const equipmentId of equipmentIdsToSync) {
        await syncToirAndRecalculateProduction(equipmentId, actor);
      }
    }

    return res.status(200).json(record);
  } catch (error: any) {
    console.error("MAINTENANCE UPDATE ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/maintenance/:id/reschedule", authenticate, requireRole(writeRoles), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scheduledDate = parseMaintenanceDate(req.body.scheduledDate);
    if (!scheduledDate) {
      return res.status(400).json({ message: "Некорректная scheduledDate" });
    }
    const reason = String(req.body.reason ?? "");
    const { rescheduleMaintenance } = await import("./maintenance-scheduling-service");
    const record = await rescheduleMaintenance(id, scheduledDate, reason, req.user!);
    return res.status(200).json(record);
  } catch (error: any) {
    const message = error?.message ?? "Ошибка переноса ТО";
    const status =
      message.includes("не найдена") ? 404 : message.includes("Нельзя") ? 400 : 400;
    return res.status(status).json({ message });
  }
});

app.delete("/api/maintenance/:id", authenticate, requireRole(writeRoles), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getMaintenanceRecord(id);
    const deleted = await storage.deleteMaintenanceRecord(id);
    if (!deleted) {
      return res.status(404).json({ message: "Запись о техобслуживании не найдена" });
    }
    if (existing?.equipmentId && req.user) {
      try {
        const { afterMaintenanceScheduleChange } = await import("./maintenance-scheduling-service");
        await afterMaintenanceScheduleChange(existing.equipmentId);
      } catch (syncErr) {
        console.error("Equipment next maintenance sync failed:", syncErr);
      }
      const { syncToirAndRecalculateProduction } = await import("./production-toir-integration-service");
      await syncToirAndRecalculateProduction(existing.equipmentId, {
        id: req.user.id,
        name: req.user.name,
      });
    }
    return res.status(200).json({ message: "Запись удалена" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

  // REMARKS ROUTES
  app.get("/api/remarks", authenticate, async (req, res) => {
    try {
      let remarks = await storage.getAllRemarks();
      const scope = await getSubdivisionScopeForRequest(req);
      if (scope) {
        remarks = filterBySubdivisionScope(remarks, scope);
      }
      return res.status(200).json(remarks);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/remarks", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const remark = await storage.createRemark(req.body);
      try {
        await createTaskFromRemark(remark, req.user);
      } catch (taskErr) {
        console.error("Auto-task from remark failed:", taskErr);
      }
      return res.status(201).json(remark);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/remarks/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const { id } = req.params;
      const remark = await storage.updateRemark(id, req.body);
      if (!remark) {
        return res.status(404).json({ message: "Замечание не найдено" });
      }
      return res.status(200).json(remark);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/remarks/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteRemark(id);
      if (!deleted) {
        return res.status(404).json({ message: "Замечание не найдено" });
      }
      return res.status(200).json({ message: "Замечание удалено" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // INSPECTION CHECKLISTS ROUTES
  app.get("/api/inspection-checklists", authenticate, async (req, res) => {
    try {
      const checklists = await storage.getAllInspectionChecklists();
      return res.status(200).json(checklists);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/inspection-checklists/:equipmentId", authenticate, async (req, res) => {
    try {
      const { equipmentId } = req.params;
      const checklist = await storage.getInspectionChecklistByEquipmentId(equipmentId);
      if (!checklist) {
        return res.status(404).json({ message: "Чек-лист для данного оборудования не найден" });
      }
      return res.status(200).json(checklist);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/inspection-checklists", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const checklistData = {
        ...req.body,
        createdBy: req.user?.name || req.body.createdBy || 'Администратор',
      };
      const checklist = await storage.createInspectionChecklist(checklistData);
      return res.status(201).json(checklist);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/inspection-checklists/:id", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const checklist = await storage.updateInspectionChecklist(id, req.body);
      if (!checklist) {
        return res.status(404).json({ message: "Чек-лист не найден" });
      }
      return res.status(200).json(checklist);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/inspection-checklists/:id", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteInspectionChecklist(id);
      if (!deleted) {
        return res.status(404).json({ message: "Чек-лист не найден" });
      }
      return res.status(200).json({ message: "Чек-лист удален" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // DAILY INSPECTIONS ROUTES
  app.get("/api/daily-inspections", authenticate, async (req, res) => {
    try {
      let inspections = await storage.getAllDailyInspections();
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope && !subScope.viewAll) {
        const { filterInspectionsByScope } = await import("./subdivision-equipment-filter");
        inspections = await filterInspectionsByScope(inspections, subScope);
      }
      return res.status(200).json(inspections);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/daily-inspections/equipment/:equipmentId", authenticate, async (req, res) => {
    try {
      const { equipmentId } = req.params;
      const inspections = await storage.getDailyInspectionsByEquipmentId(equipmentId);
      return res.status(200).json(inspections);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/daily-inspections", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const checkResults = req.body.checkResults as string[] | undefined;
      const issuesCount =
        req.body.issuesCount != null
          ? Number(req.body.issuesCount)
          : countIssuesFromCheckResults(checkResults);
      const workingStatus =
        req.body.workingStatus ?? deriveWorkingStatus(checkResults);

      const equipmentId = String(req.body.equipmentId ?? "");
      const inspectionDate = new Date(req.body.inspectionDate);
      const todayList = await storage.getDailyInspectionsByDate(inspectionDate);
      const existingToday = todayList.find((row) => row.equipmentId === equipmentId);

      const inspectionData = {
        ...req.body,
        inspectedBy: req.user.name,
        inspectionDate,
        issuesCount,
        workingStatus,
        status: "completed",
      };

      const inspection = existingToday
        ? await storage.updateDailyInspection(existingToday.id, {
            ...inspectionData,
            updatedAt: new Date(),
          })
        : await storage.createDailyInspection(inspectionData);

      if (!inspection) {
        return res.status(500).json({ message: "Не удалось сохранить осмотр" });
      }

      try {
        await syncRemarkFromDailyInspection(inspection, req.user);
      } catch (taskErr) {
        console.error("Sync remark from inspection failed:", taskErr);
      }

      return res.status(existingToday ? 200 : 201).json(inspection);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/daily-inspections/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const id = parseInt(req.params.id);
      const checkResults = req.body.checkResults as string[] | undefined;
      const issuesCount =
        req.body.issuesCount != null
          ? Number(req.body.issuesCount)
          : checkResults
            ? countIssuesFromCheckResults(checkResults)
            : undefined;
      const inspectionData: Record<string, unknown> = {
        ...req.body,
        inspectionDate: req.body.inspectionDate ? new Date(req.body.inspectionDate) : undefined,
        inspectedBy: req.user.name,
        updatedAt: new Date(),
      };
      if (issuesCount != null) inspectionData.issuesCount = issuesCount;
      if (checkResults) {
        inspectionData.workingStatus =
          req.body.workingStatus ?? deriveWorkingStatus(checkResults);
      }
      const inspection = await storage.updateDailyInspection(id, inspectionData);
      if (!inspection) {
        return res.status(404).json({ message: "Осмотр не найден" });
      }
      try {
        await syncRemarkFromDailyInspection(inspection, req.user);
      } catch (taskErr) {
        console.error("Sync remark from inspection failed:", taskErr);
      }
      return res.status(200).json(inspection);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/daily-inspections/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteDailyInspection(id);
      if (!deleted) {
        return res.status(404).json({ message: "Осмотр не найден" });
      }
      return res.status(200).json({ message: "Осмотр удален" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notifications", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const forceSync = req.query.sync === "1";
      const skipSync = req.query.sync === "0";
      if (!skipSync) {
        const last = lastReminderSyncByUser.get(user.id) ?? 0;
        if (forceSync || Date.now() - last >= REMINDER_SYNC_INTERVAL_MS) {
          await syncTaskReminderNotifications(user.id, user.role);
          lastReminderSyncByUser.set(user.id, Date.now());
        }
      }
      const list = await storage.getActiveNotifications(user.id);
      res.json(list.slice(0, 50));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки уведомлений" });
    }
  });

  app.patch("/api/notifications/:id/read", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const note = await storage.getNotification(id);
      if (!note || note.userId !== user.id) {
        return res.status(404).json({ message: "Уведомление не найдено" });
      }
      const shouldArchive =
        req.query.archive === "1" ||
        req.query.archive === "true" ||
        (req.body && typeof req.body === "object" && (req.body as { archive?: boolean }).archive === true);
      const updated = shouldArchive
        ? await storage.archiveNotification(id)
        : await storage.markNotificationAsRead(id);
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.patch("/api/notifications/:id/dismiss", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const note = await storage.getNotification(id);
      if (!note || note.userId !== user.id) {
        return res.status(404).json({ message: "Уведомление не найдено" });
      }
      const updated = await storage.archiveNotification(id);
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post("/api/notifications/dismiss-all", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const count = await storage.archiveAllNotificationsForUser(user.id);
      lastReminderSyncByUser.set(user.id, Date.now());
      res.json({ dismissed: count });
    } catch {
      res.status(500).json({ message: "Ошибка" });
    }
  });

  registerServiceRequestRoutes(app, authenticate, requireRole);
  registerUploadRoutes(app, authenticate);
  registerAssetManagementRoutes(app, authenticate, requireRole);
  registerWarehouseRoutes(app, authenticate, requireRole);
  registerPermissionsRoutes(app, authenticate, requireRole);
  registerSubdivisionRoutes(app, authenticate, requireRole);
  registerProductionRoutes(app, authenticate);
  registerChatRoutes(app, authenticate);

  try {
    await ensureDefaultRoleProfiles();
    await initSubdivisionSystem();
  } catch (error) {
    console.error("Startup DB setup warning (server will still start):", error);
  }
  initTelegramBot();

  const presenceSweepMs = 5 * 60 * 1000;
  setInterval(() => {
    expireStalePresenceUsers().catch((err) => console.error("presence sweep failed:", err));
  }, presenceSweepMs);

  const maintenanceSchedulerMs = 60 * 60 * 1000;
  const runMaintenanceScheduler = () => {
    import("./maintenance-scheduling-service")
      .then((m) => m.runMaintenanceTaskScheduler())
      .catch((err) => console.error("maintenance task scheduler failed:", err));
  };
  runMaintenanceScheduler();
  setInterval(runMaintenanceScheduler, maintenanceSchedulerMs);
  
  return httpServer;
}
