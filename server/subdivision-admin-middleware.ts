import type { Request } from "express";
import { storage } from "./storage";
import {
  canManageSubdivisionId,
  isSystemAdmin,
  normalizeExtraSubdivisionIds,
  resolveManagedSubdivisionIds,
} from "@shared/subdivision-scope";
import { isSubdivisionAdminRole } from "@shared/subdivision-admin-roles";
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
  target: Pick<User, "role" | "subdivisionId" | "managedSubdivisionIds">
): boolean {
  if (isSystemAdmin(actor.role)) return true;
  if (target.role === "admin") return false;
  const managed = new Set(resolveManagedSubdivisionIds(actor));
  if (target.subdivisionId != null && managed.has(target.subdivisionId)) return true;
  return resolveManagedSubdivisionIds(target).some((id) => managed.has(id));
}

export function filterUsersForActor(actor: User, list: User[]): User[] {
  if (isSystemAdmin(actor.role)) return list;
  const managed = new Set(resolveManagedSubdivisionIds(actor));
  return list.filter((u) => {
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
  if (isSystemAdmin(actor.role)) return data;

  const sanitized = { ...data };
  delete sanitized.managedSubdivisionIds;
  delete sanitized.viewAllSubdivisions;

  if (sanitized.role === "admin") {
    throw new Error("Нельзя назначать роль системного администратора");
  }
  if (typeof sanitized.role === "string" && isSubdivisionAdminRole(sanitized.role)) {
    throw new Error("Роль администратора подразделения назначает только системный администратор");
  }

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

  return sanitized;
}
