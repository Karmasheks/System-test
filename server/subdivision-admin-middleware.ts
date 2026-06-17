import type { Request } from "express";
import { storage } from "./storage";
import {
  canManageSubdivisionId,
  isSystemAdmin,
  normalizeExtraSubdivisionIds,
  resolveManagedSubdivisionIds,
} from "@shared/subdivision-scope";
import { isSubdivisionAdminRole } from "@shared/subdivision-admin-roles";
import { canAssignAdminPrivileges, isSuperAdminUser } from "@shared/super-admin";
import type { User } from "@shared/schema";

export async function getActorUser(req: Request): Promise<User | null> {
  if (!req.user) return null;
  const user = await storage.getUser(req.user.id);
  return user ?? null;
}

export async function requireSystemAdminUser(req: Request): Promise<User> {
  const user = await getActorUser(req);
  if (!user || !isSystemAdmin(user.role)) {
    const err = new Error("Только системный администратор");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return user;
}

export async function requireSuperAdminUser(req: Request): Promise<User> {
  const user = await getActorUser(req);
  if (!user || !isSuperAdminUser(user)) {
    const err = new Error("Только главный администратор системы");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
  return user;
}

export async function requireSystemAdminOrSubdivisionAdmin(req: Request): Promise<User> {
  const user = await getActorUser(req);
  if (!user) {
    const err = new Error("Authentication required");
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
  if (isSystemAdmin(user.role)) return user;
  if (resolveManagedSubdivisionIds(user).length > 0) return user;
  const err = new Error("Недостаточно прав");
  (err as Error & { statusCode: number }).statusCode = 403;
  throw err;
}

export function canActorManageUser(
  actor: User,
  target: Pick<User, "role" | "subdivisionId" | "managedSubdivisionIds" | "isSuperAdmin">
): boolean {
  if (isSuperAdminUser(actor)) return true;
  if (isSuperAdminUser(target)) return false;
  if (isSystemAdmin(target.role)) return false;
  const managed = new Set(resolveManagedSubdivisionIds(actor));
  if (target.subdivisionId != null && managed.has(target.subdivisionId)) return true;
  return resolveManagedSubdivisionIds(target).some((id) => managed.has(id));
}

export function filterUsersForActor(actor: User, list: User[]): User[] {
  if (isSystemAdmin(actor.role)) return list;
  const managed = new Set(resolveManagedSubdivisionIds(actor));
  return list.filter((u) => {
    if (isSuperAdminUser(u)) return false;
    if (isSystemAdmin(u.role)) return false;
    if (u.subdivisionId != null && managed.has(u.subdivisionId)) return true;
    return resolveManagedSubdivisionIds(u).some((id) => managed.has(id));
  });
}

export async function usersAdminGuard(
  req: Request,
  res: import("express").Response
): Promise<User | null> {
  const user = await getActorUser(req);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  if (isSystemAdmin(user.role)) return user;
  if (resolveManagedSubdivisionIds(user).length > 0) return user;
  res.status(403).json({ message: "Доступ запрещен" });
  return null;
}

export function sanitizeUserWritePayload(actor: User, data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...data };

  if (!canAssignAdminPrivileges(actor)) {
    delete sanitized.managedSubdivisionIds;
    delete sanitized.viewAllSubdivisions;
    delete sanitized.isSuperAdmin;

    if (sanitized.role === "admin") {
      throw new Error("Назначать системного администратора может только главный администратор");
    }
    if (typeof sanitized.role === "string" && isSubdivisionAdminRole(sanitized.role)) {
      throw new Error("Права администратора подразделения назначает только главный администратор");
    }
  }

  if (!isSystemAdmin(actor.role)) {
    if (sanitized.subdivisionId !== undefined) {
      const subId =
        sanitized.subdivisionId === null || sanitized.subdivisionId === ""
          ? null
          : Number(sanitized.subdivisionId);
      if (subId == null || !canManageSubdivisionId(actor, subId)) {
        throw new Error("Подразделение вне вашей зоны управления");
      }
      sanitized.subdivisionId = subId;
    }

    if (sanitized.extraSubdivisionIds !== undefined) {
      const extras = normalizeExtraSubdivisionIds(sanitized.extraSubdivisionIds);
      for (const id of extras) {
        if (!canManageSubdivisionId(actor, id)) {
          throw new Error("Дополнительное подразделение вне вашей зоны управления");
        }
      }
      sanitized.extraSubdivisionIds = extras;
    }
  }

  return sanitized;
}

export function assertSuperAdminTargetEditable(
  actor: User,
  target: User,
  updateData: Record<string, unknown>
): void {
  if (!isSuperAdminUser(target)) return;

  if (!isSuperAdminUser(actor)) {
    throw new Error("Главного администратора может редактировать только он сам");
  }

  if (updateData.role !== undefined && updateData.role !== "admin") {
    throw new Error("Роль главного администратора не может быть изменена");
  }
  if (updateData.isSuperAdmin === false) {
    throw new Error("Не можно отозвать статус главного администратора");
  }
  if (updateData.isActive === false) {
    throw new Error("Главного администратора не можно деактивировать");
  }
}
