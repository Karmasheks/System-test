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
}
