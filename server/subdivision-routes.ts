import type { Express, Request, Response } from "express";
import type { AuthenticatedUser } from "./routes";
import {
  createSubdivision,
  listAllSubdivisions,
  listSubdivisions,
  getSubdivisionUsage,
  removeSubdivision,
  renameSubdivision,
} from "./subdivision-service";
import { requireSystemAdminUser } from "./subdivision-admin-middleware";
import {
  returnEquipmentFromRepair,
  sendEquipmentForRepair,
  transferEquipmentSubdivision,
  transferUserSubdivision,
  transferWarehousePartSubdivision,
} from "./subdivision-transfer-service";

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;
type RoleMiddleware = (roles: string[]) => (req: Request, res: Response, next: Function) => void;

export function registerSubdivisionRoutes(
  app: Express,
  authenticate: AuthMiddleware,
  requireRole: RoleMiddleware
) {
  app.get("/api/subdivisions", authenticate, async (_req, res) => {
    try {
      res.json(await listSubdivisions());
    } catch {
      res.status(500).json({ message: "Ошибка загрузки подразделений" });
    }
  });

  app.get("/api/subdivisions/all", authenticate, requireRole(["admin"]), async (_req, res) => {
    try {
      res.json(await listAllSubdivisions());
    } catch {
      res.status(500).json({ message: "Ошибка загрузки подразделений" });
    }
  });

  app.post("/api/subdivisions", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const name = String(req.body.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Укажите название подразделения" });
      res.status(201).json(await createSubdivision(name));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания подразделения";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/subdivisions/:id", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const name = String(req.body.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Укажите название" });
      const row = await renameSubdivision(id, name);
      res.json(row);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка переименования";
      const status = message.includes("не найдено") ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.get("/api/subdivisions/:id/usage", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      res.json(await getSubdivisionUsage(id));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки" });
    }
  });

  app.delete("/api/subdivisions/:id", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await removeSubdivision(id);
      if (result.mode === "deactivated") {
        const { usage } = result;
        const parts = [
          usage.users ? `сотрудники: ${usage.users}` : "",
          usage.equipment ? `оборудование: ${usage.equipment}` : "",
          usage.warehouseParts ? `склад: ${usage.warehouseParts}` : "",
          usage.tasks ? `задачи: ${usage.tasks}` : "",
          usage.serviceRequests ? `заявки: ${usage.serviceRequests}` : "",
          usage.remarks ? `замечания: ${usage.remarks}` : "",
        ].filter(Boolean);
        return res.json({
          ok: true,
          mode: "deactivated",
          message: `Подразделение скрыто из справочника (есть связи: ${parts.join(", ")}). Данные сохранены.`,
          usage,
        });
      }
      res.json({ ok: true, mode: "deleted", message: "Подразделение удалено" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка удаления";
      res.status(400).json({ message });
    }
  });

  app.post("/api/subdivisions/transfers/equipment", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const actor = await requireSystemAdminUser(req);
      const equipmentId = String(req.body.equipmentId ?? "").trim();
      const targetSubdivisionId = Number(req.body.targetSubdivisionId);
      if (!equipmentId || Number.isNaN(targetSubdivisionId)) {
        return res.status(400).json({ message: "Укажите оборудование и целевое подразделение" });
      }
      const result = await transferEquipmentSubdivision(equipmentId, targetSubdivisionId, {
        id: actor.id,
        name: actor.name,
      });
      res.json(result);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      res.status(err.statusCode ?? 400).json({ message: err.message ?? "Ошибка переноса" });
    }
  });

  app.post("/api/subdivisions/transfers/warehouse-part", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const actor = await requireSystemAdminUser(req);
      const partId = Number(req.body.partId);
      const targetSubdivisionId = Number(req.body.targetSubdivisionId);
      if (Number.isNaN(partId) || Number.isNaN(targetSubdivisionId)) {
        return res.status(400).json({ message: "Укажите запчасть и целевое подразделение" });
      }
      const result = await transferWarehousePartSubdivision(partId, targetSubdivisionId, {
        id: actor.id,
        name: actor.name,
      });
      res.json(result);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      res.status(err.statusCode ?? 400).json({ message: err.message ?? "Ошибка переноса" });
    }
  });

  app.post("/api/subdivisions/transfers/user", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      await requireSystemAdminUser(req);
      const userId = Number(req.body.userId);
      const targetSubdivisionId = Number(req.body.targetSubdivisionId);
      if (Number.isNaN(userId) || Number.isNaN(targetSubdivisionId)) {
        return res.status(400).json({ message: "Укажите сотрудника и целевое подразделение" });
      }
      const result = await transferUserSubdivision(userId, targetSubdivisionId);
      res.json(result);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      res.status(err.statusCode ?? 400).json({ message: err.message ?? "Ошибка переноса" });
    }
  });

  app.post("/api/subdivisions/transfers/equipment/repair", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const actor = await requireSystemAdminUser(req);
      const equipmentId = String(req.body.equipmentId ?? "").trim();
      const repairSubdivisionId = Number(req.body.repairSubdivisionId);
      if (!equipmentId || Number.isNaN(repairSubdivisionId)) {
        return res.status(400).json({ message: "Укажите оборудование и подразделение для ремонта" });
      }
      const result = await sendEquipmentForRepair(
        equipmentId,
        repairSubdivisionId,
        { id: actor.id, name: actor.name },
        req.body.comment
      );
      res.json(result);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      res.status(err.statusCode ?? 400).json({ message: err.message ?? "Ошибка отправки на ремонт" });
    }
  });

  app.post("/api/subdivisions/transfers/equipment/repair/return", authenticate, requireRole(["admin"]), async (req, res) => {
    try {
      const actor = await requireSystemAdminUser(req);
      const equipmentId = String(req.body.equipmentId ?? "").trim();
      if (!equipmentId) {
        return res.status(400).json({ message: "Укажите оборудование" });
      }
      const result = await returnEquipmentFromRepair(equipmentId, {
        id: actor.id,
        name: actor.name,
      });
      res.json(result);
    } catch (e: unknown) {
      const err = e as Error & { statusCode?: number };
      res.status(err.statusCode ?? 400).json({ message: err.message ?? "Ошибка возврата с ремонта" });
    }
  });
}
