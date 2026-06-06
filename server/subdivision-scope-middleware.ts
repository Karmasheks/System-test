import type { Request } from "express";
import { storage } from "./storage";
import {
  canAccessSubdivision,
  resolveSubdivisionScope,
  type SubdivisionScope,
} from "@shared/subdivision-scope";

export async function getSubdivisionScopeForRequest(req: Request): Promise<SubdivisionScope | null> {
  if (!req.user) return null;
  const fullUser = await storage.getUser(req.user.id);
  if (!fullUser) return { viewAll: false, ids: [] };
  return resolveSubdivisionScope(fullUser);
}

export function assertSubdivisionAccess(scope: SubdivisionScope, subdivisionId: number | null | undefined) {
  if (!canAccessSubdivision(scope, subdivisionId)) {
    const err = new Error("Нет доступа к данным этого подразделения");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

export function subdivisionForbidden(res: { status: (n: number) => { json: (b: unknown) => void } }, message?: string) {
  return res.status(403).json({ message: message ?? "Нет доступа к данным этого подразделения" });
}
