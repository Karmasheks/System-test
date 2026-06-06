import type { Express, Request, Response } from "express";
import type { AuthenticatedUser } from "./routes";
import {
  insertWarehousePartSchema,
  createWarehousePartSchema,
  addWarehouseMovementSchema,
  addWarehouseCommentSchema,
} from "@shared/schema";
import {
  seedWarehouseCategories,
  listWarehouseCategories,
  createWarehouseCategory,
  findOrCreateWarehouseCategory,
  listWarehouseParts,
  getWarehousePart,
  createWarehousePart,
  updateWarehousePart,
  deleteWarehousePart,
  listWarehouseMovements,
  addWarehouseMovement,
  listPartComments,
  addPartComment,
  listUnresolvedStockAlerts,
  resolveStockAlert,
  getWarehouseDashboardStats,
} from "./warehouse-storage";
import { listRecentWarehouseActivity } from "./part-reservation-service";
import { listEnrichedPartReservations } from "./warehouse-writeoff-service";
import { resolveSubdivisionFields } from "./subdivision-service";
import {
  assertSubdivisionAccess,
  getSubdivisionScopeForRequest,
  subdivisionForbidden,
} from "./subdivision-scope-middleware";
import { filterBySubdivisionScope } from "@shared/subdivision-scope";

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;
type RoleMiddleware = (roles: string[]) => (req: Request, res: Response, next: Function) => void;

export function registerWarehouseRoutes(
  app: Express,
  authenticate: AuthMiddleware,
  requireRole: RoleMiddleware
) {
  const writeRoles = ["admin", "manager", "engineer", "technician", "service_engineer", "operator"];

  seedWarehouseCategories().catch(() => {});

  app.get("/api/warehouse/categories", authenticate, async (_req, res) => {
    try {
      res.json(await listWarehouseCategories());
    } catch {
      res.status(500).json({ message: "Ошибка загрузки категорий" });
    }
  });

  app.post("/api/warehouse/categories", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const name = String(req.body.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Укажите название категории" });
      res.status(201).json(await createWarehouseCategory(name));
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.get("/api/warehouse/parts", authenticate, async (req, res) => {
    try {
      const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
      const equipmentId = req.query.equipmentId as string | undefined;
      const search = req.query.search as string | undefined;
      const lowStock = req.query.lowStock === "true";
      const subdivisionId = req.query.subdivisionId ? Number(req.query.subdivisionId) : undefined;
      let parts = await listWarehouseParts({
        categoryId,
        equipmentId,
        search,
        lowStock,
        subdivisionId: subdivisionId && !Number.isNaN(subdivisionId) ? subdivisionId : undefined,
      });
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        parts = filterBySubdivisionScope(parts, subScope);
      }
      res.json(parts);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки запчастей" });
    }
  });

  app.get("/api/warehouse/parts/:id", authenticate, async (req, res) => {
    const part = await getWarehousePart(Number(req.params.id));
    if (!part) return res.status(404).json({ message: "Не найдено" });
    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, part.subdivisionId);
      } catch {
        return subdivisionForbidden(res);
      }
    }
    res.json(part);
  });

  app.post("/api/warehouse/parts", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      let body = createWarehousePartSchema.parse(req.body);
      if (!body.categoryId && body.categoryName?.trim()) {
        const cat = await findOrCreateWarehouseCategory(body.categoryName.trim());
        body = { ...body, categoryId: cat.id, categoryName: cat.name };
      }
      const subFields = await resolveSubdivisionFields(body.subdivisionId, body.subdivisionName);
      if (!subFields.subdivisionId) {
        return res.status(400).json({ message: "Укажите подразделение" });
      }
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, subFields.subdivisionId);
        } catch {
          return subdivisionForbidden(res);
        }
      }
      body = { ...body, subdivisionId: subFields.subdivisionId, subdivisionName: subFields.subdivisionName };
      res.status(201).json(await createWarehousePart(body, user));
    } catch (e: any) {
      console.error("WAREHOUSE CREATE ERROR:", e);
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.put("/api/warehouse/parts/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const existing = await getWarehousePart(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Не найдено" });

      let body = insertWarehousePartSchema.partial().parse(req.body);
      if (!body.categoryId && body.categoryName?.trim()) {
        const cat = await findOrCreateWarehouseCategory(body.categoryName.trim());
        body = { ...body, categoryId: cat.id, categoryName: cat.name };
      }
      if (body.subdivisionId !== undefined || body.subdivisionName !== undefined) {
        const subFields = await resolveSubdivisionFields(body.subdivisionId, body.subdivisionName);
        body = { ...body, subdivisionId: subFields.subdivisionId, subdivisionName: subFields.subdivisionName };
        const subScope = await getSubdivisionScopeForRequest(req);
        if (subScope) {
          try {
            assertSubdivisionAccess(subScope, subFields.subdivisionId);
          } catch {
            return subdivisionForbidden(res);
          }
        }
      } else {
        const subScope = await getSubdivisionScopeForRequest(req);
        if (subScope) {
          try {
            assertSubdivisionAccess(subScope, existing.subdivisionId);
          } catch {
            return subdivisionForbidden(res);
          }
        }
      }
      const row = await updateWarehousePart(Number(req.params.id), body);
      if (!row) return res.status(404).json({ message: "Не найдено" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.delete("/api/warehouse/parts/:id", authenticate, requireRole(["admin", "manager"]), async (req, res) => {
    const ok = await deleteWarehousePart(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Не найдено" });
    res.json({ ok: true });
  });

  app.get("/api/warehouse/parts/:id/movements", authenticate, async (req, res) => {
    res.json(await listWarehouseMovements(Number(req.params.id)));
  });

  app.get("/api/warehouse/parts/:id/reservations", authenticate, async (req, res) => {
    try {
      res.json(await listEnrichedPartReservations(Number(req.params.id)));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки резервов" });
    }
  });

  app.post("/api/warehouse/parts/:id/movements", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const body = addWarehouseMovementSchema.parse(req.body);
      const result = await addWarehouseMovement(Number(req.params.id), body, user);
      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.get("/api/warehouse/parts/:id/comments", authenticate, async (req, res) => {
    res.json(await listPartComments(Number(req.params.id)));
  });

  app.post("/api/warehouse/parts/:id/comments", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const parsed = addWarehouseCommentSchema.parse(req.body);
      res.status(201).json(await addPartComment(Number(req.params.id), parsed.body, user));
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.get("/api/warehouse/alerts", authenticate, async (_req, res) => {
    try {
      res.json(await listUnresolvedStockAlerts());
    } catch {
      res.status(500).json({ message: "Ошибка загрузки оповещений" });
    }
  });

  app.patch("/api/warehouse/alerts/:id/resolve", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const row = await resolveStockAlert(Number(req.params.id), user, {
        resolutionType: req.body.resolutionType ? String(req.body.resolutionType) : "other",
        comment: req.body.comment ? String(req.body.comment) : undefined,
      });
      if (!row) return res.status(404).json({ message: "Не найдено" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.get("/api/warehouse/dashboard", authenticate, async (_req, res) => {
    try {
      res.json(await getWarehouseDashboardStats());
    } catch {
      res.status(500).json({ message: "Ошибка загрузки статистики склада" });
    }
  });

  app.get("/api/warehouse/activity", authenticate, async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      res.json(await listRecentWarehouseActivity(limit));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки журнала склада" });
    }
  });
}
