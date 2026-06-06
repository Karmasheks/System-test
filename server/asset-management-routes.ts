import type { Express, Request, Response } from "express";
import type { AuthenticatedUser } from "./routes";
import {
  insertContactSchema,
  insertSupplierSchema,
  createBudgetEntryRequestSchema,
  insertBudgetEntrySchema,
  insertDocumentSchema,
  linkBudgetToRequestSchema,
} from "@shared/schema";
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listBudgetEntries,
  createBudgetEntry,
  updateBudgetEntry,
  deleteBudgetEntry,
  getBudgetSummary,
  linkBudgetToServiceRequest,
  listDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  listDocumentCategories,
  createDocumentCategory,
  getCalendarEvents,
  getCalendarStats,
  getReportsData,
  getBudgetReport,
  seedDefaultDocumentCategories,
} from "./asset-management-storage";
import { getStatusDurationReport } from "./status-duration-reports";
import { getUserWorkReport } from "./user-work-report";
import { getEmployeeWorkReport } from "./employee-work-report";
import {
  createWarehousePartFromBudget,
  addWarehouseMovement,
} from "./warehouse-storage";

async function syncBudgetWithWarehouse(
  input: {
    linkToWarehouse?: boolean;
    warehouseInitialQuantity?: number;
    warehouseCategoryId?: number | null;
    title: string;
    amount: number;
    category: string;
    storageLocation?: string | null;
    notes?: string | null;
    warehousePartId?: number | null;
    addStock?: boolean;
  },
  user: { id: number; name: string }
): Promise<number | null> {
  if (!input.linkToWarehouse) return input.warehousePartId ?? null;

  const qty = input.warehouseInitialQuantity ?? 1;

  if (input.warehousePartId) {
    if (input.addStock && qty > 0) {
      await addWarehouseMovement(
        input.warehousePartId,
        {
          type: "in",
          quantity: qty,
          comment: `Приход по расходу: ${input.title}`,
        },
        user
      );
    }
    return input.warehousePartId;
  }

  const part = await createWarehousePartFromBudget(
    {
      title: input.title,
      amount: input.amount,
      budgetCategory: input.category,
      warehouseCategoryId: input.warehouseCategoryId,
      storageLocation: input.storageLocation,
      notes: input.notes,
      initialQuantity: qty,
    },
    user
  );
  return part.id;
}

function readBudgetWarehouseOptions(body: Record<string, unknown>) {
  return {
    linkToWarehouse: body.linkToWarehouse === true || body.linkToWarehouse === "true",
    warehouseInitialQuantity:
      body.warehouseInitialQuantity != null && body.warehouseInitialQuantity !== ""
        ? Number(body.warehouseInitialQuantity)
        : 1,
    warehouseCategoryId:
      body.warehouseCategoryId != null && body.warehouseCategoryId !== ""
        ? Number(body.warehouseCategoryId)
        : null,
  };
}

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;
type RoleMiddleware = (roles: string[]) => (req: Request, res: Response, next: Function) => void;

export function registerAssetManagementRoutes(
  app: Express,
  authenticate: AuthMiddleware,
  requireRole: RoleMiddleware
) {
  const writeRoles = ["admin", "manager", "engineer", "technician", "service_engineer", "operator"];

  seedDefaultDocumentCategories().catch(() => {});

  // Contacts
  app.get("/api/contacts", authenticate, async (req, res) => {
    try {
      const equipmentId = req.query.equipmentId as string | undefined;
      res.json(await listContacts(equipmentId ? { equipmentId } : undefined));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки контактов" });
    }
  });

  app.post("/api/contacts", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const body = insertContactSchema.parse(req.body);
      res.status(201).json(await createContact(body));
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.put("/api/contacts/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const body = insertContactSchema.partial().parse(req.body);
      const row = await updateContact(Number(req.params.id), body);
      if (!row) return res.status(404).json({ message: "Не найдено" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.delete("/api/contacts/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    const ok = await deleteContact(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Не найдено" });
    res.json({ ok: true });
  });

  // Suppliers
  app.get("/api/suppliers", authenticate, async (req, res) => {
    try {
      const equipmentId = req.query.equipmentId as string | undefined;
      res.json(await listSuppliers(equipmentId ? { equipmentId } : undefined));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки поставщиков" });
    }
  });

  app.post("/api/suppliers", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const body = insertSupplierSchema.parse(req.body);
      res.status(201).json(await createSupplier(body));
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.put("/api/suppliers/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const body = insertSupplierSchema.partial().parse(req.body);
      const row = await updateSupplier(Number(req.params.id), body);
      if (!row) return res.status(404).json({ message: "Не найдено" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.delete("/api/suppliers/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    const ok = await deleteSupplier(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Не найдено" });
    res.json({ ok: true });
  });

  // Budget
  app.get("/api/budget", authenticate, async (req, res) => {
    try {
      const { equipmentId, from, to, category } = req.query;
      const list = await listBudgetEntries({
        equipmentId: equipmentId as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        category: category as string | undefined,
      });
      res.json(list);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки бюджета" });
    }
  });

  app.get("/api/budget/summary", authenticate, async (req, res) => {
    try {
      const equipmentId = req.query.equipmentId as string | undefined;
      res.json(await getBudgetSummary(equipmentId));
    } catch {
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post("/api/budget", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const warehouseOpts = readBudgetWarehouseOptions(req.body);
      const parsed = createBudgetEntryRequestSchema.parse({
        ...req.body,
        createdById: user.id,
        createdByName: user.name,
      });
      const { linkToWarehouse: parsedLink, warehouseInitialQuantity: parsedQty, warehouseCategoryId: parsedCatId, ...budgetFields } = parsed;

      const linkToWarehouse = warehouseOpts.linkToWarehouse || parsedLink === true;
      const warehouseInitialQuantity = warehouseOpts.warehouseInitialQuantity ?? parsedQty;
      const warehouseCategoryId = warehouseOpts.warehouseCategoryId ?? parsedCatId ?? null;

      if (linkToWarehouse && !budgetFields.warehousePartId && !warehouseCategoryId) {
        return res.status(400).json({ message: "Выберите категорию запчасти на складе" });
      }

      const warehousePartId = await syncBudgetWithWarehouse(
        {
          linkToWarehouse,
          warehouseInitialQuantity,
          warehouseCategoryId,
          title: budgetFields.title,
          amount: budgetFields.amount,
          category: budgetFields.category,
          storageLocation: budgetFields.storageLocation,
          notes: budgetFields.notes,
          warehousePartId: budgetFields.warehousePartId,
          addStock: true,
        },
        user
      );

      const entryData = {
        ...budgetFields,
        ...(linkToWarehouse
          ? {
              warehousePartId,
              equipmentId: null,
              equipmentName: null,
            }
          : {
              warehousePartId: null,
              storageLocation: null,
            }),
      };

      res.status(201).json(await createBudgetEntry(entryData));
    } catch (e: any) {
      console.error("BUDGET CREATE ERROR:", e);
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.put("/api/budget/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const warehouseOpts = readBudgetWarehouseOptions(req.body);
      const parsed = createBudgetEntryRequestSchema.partial().parse(req.body);
      const { linkToWarehouse: parsedLink, warehouseInitialQuantity: parsedQty, warehouseCategoryId: parsedCatId, ...budgetFields } = parsed;

      const linkToWarehouse =
        warehouseOpts.linkToWarehouse || parsedLink === true
          ? true
          : parsedLink === false
            ? false
            : undefined;

      let updateData: typeof budgetFields & { warehousePartId?: number | null } = { ...budgetFields };

      if (linkToWarehouse === true) {
        const warehouseInitialQuantity = warehouseOpts.warehouseInitialQuantity ?? parsedQty;
        const warehouseCategoryId = warehouseOpts.warehouseCategoryId ?? parsedCatId ?? null;

        const warehousePartId = await syncBudgetWithWarehouse(
          {
            linkToWarehouse: true,
            warehouseInitialQuantity,
            warehouseCategoryId,
            title: String(budgetFields.title ?? req.body.title ?? ""),
            amount: Number(budgetFields.amount ?? req.body.amount ?? 0),
            category: String(budgetFields.category ?? req.body.category ?? "parts"),
            storageLocation: budgetFields.storageLocation ?? req.body.storageLocation ?? null,
            notes: budgetFields.notes ?? req.body.notes ?? null,
            warehousePartId: budgetFields.warehousePartId ?? req.body.warehousePartId ?? null,
            addStock: false,
          },
          user
        );
        updateData = {
          ...updateData,
          warehousePartId,
          equipmentId: null,
          equipmentName: null,
        };
      } else if (linkToWarehouse === false) {
        updateData.warehousePartId = null;
        updateData.storageLocation = null;
      }

      const row = await updateBudgetEntry(Number(req.params.id), updateData);
      if (!row) return res.status(404).json({ message: "Не найдено" });
      res.json(row);
    } catch (e: any) {
      console.error("BUDGET UPDATE ERROR:", e);
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.delete("/api/budget/:id", authenticate, requireRole(["admin", "manager"]), async (req, res) => {
    const ok = await deleteBudgetEntry(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Не найдено" });
    res.json({ ok: true });
  });

  // Documents
  app.get("/api/documents", authenticate, async (req, res) => {
    try {
      const { equipmentId, category } = req.query;
      res.json(
        await listDocuments({
          equipmentId: equipmentId as string | undefined,
          category: category as string | undefined,
        })
      );
    } catch {
      res.status(500).json({ message: "Ошибка загрузки документов" });
    }
  });

  app.get("/api/document-categories", authenticate, async (_req, res) => {
    try {
      res.json(await listDocumentCategories());
    } catch {
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post("/api/document-categories", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const name = String(req.body.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Укажите название категории" });
      res.status(201).json(await createDocumentCategory(name));
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.post("/api/documents", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const body = insertDocumentSchema.parse({
        ...req.body,
        createdByName: user.name,
      });
      res.status(201).json(await createDocument(body));
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.put("/api/documents/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const body = insertDocumentSchema.partial().parse(req.body);
      const row = await updateDocument(Number(req.params.id), body);
      if (!row) return res.status(404).json({ message: "Не найдено" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.delete("/api/documents/:id", authenticate, requireRole(writeRoles), async (req, res) => {
    const ok = await deleteDocument(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Не найдено" });
    res.json({ ok: true });
  });

  // Calendar & reports
  app.get("/api/calendar/events", authenticate, async (req, res) => {
    try {
      const { from, to, equipmentId } = req.query;
      res.json(
        await getCalendarEvents(
          from as string | undefined,
          to as string | undefined,
          equipmentId as string | undefined
        )
      );
    } catch {
      res.status(500).json({ message: "Ошибка календаря" });
    }
  });

  app.get("/api/calendar/stats", authenticate, async (req, res) => {
    try {
      const { from, to, equipmentId } = req.query;
      res.json(
        await getCalendarStats(
          from as string | undefined,
          to as string | undefined,
          equipmentId as string | undefined
        )
      );
    } catch {
      res.status(500).json({ message: "Ошибка статистики" });
    }
  });

  app.get("/api/reports/equipment", authenticate, async (req, res) => {
    try {
      const { from, to, equipmentId } = req.query;
      res.json(
        await getReportsData(
          from as string | undefined,
          to as string | undefined,
          equipmentId as string | undefined
        )
      );
    } catch {
      res.status(500).json({ message: "Ошибка формирования отчёта" });
    }
  });

  app.get("/api/reports/budget", authenticate, async (req, res) => {
    try {
      const { from, to, equipmentId } = req.query;
      res.json(
        await getBudgetReport({
          from: from as string | undefined,
          to: to as string | undefined,
          equipmentId: equipmentId as string | undefined,
        })
      );
    } catch {
      res.status(500).json({ message: "Ошибка формирования отчёта по затратам" });
    }
  });

  app.get("/api/reports/status-durations", authenticate, async (req, res) => {
    try {
      const { from, to, equipmentId } = req.query;
      const report = await getStatusDurationReport({
        from: from ? new Date(String(from)) : undefined,
        to: to ? new Date(String(to)) : undefined,
        equipmentId: equipmentId ? String(equipmentId) : undefined,
      });
      res.json(report);
    } catch {
      res.status(500).json({ message: "Ошибка формирования отчёта по статусам" });
    }
  });

  app.get("/api/reports/user-work", authenticate, async (req, res) => {
    try {
      const { from, to } = req.query;
      const report = await getUserWorkReport({
        from: from ? new Date(String(from)) : undefined,
        to: to ? new Date(String(to)) : undefined,
      });
      res.json(report);
    } catch {
      res.status(500).json({ message: "Ошибка формирования отчёта по сотрудникам" });
    }
  });

  app.get("/api/reports/employee-work", authenticate, async (req, res) => {
    try {
      const userId = Number(req.query.userId);
      if (!userId || Number.isNaN(userId)) {
        return res.status(400).json({ message: "Укажите userId" });
      }
      const { from, to } = req.query;
      const parseFrom = (v: unknown) => {
        if (!v) return undefined;
        const d = new Date(String(v));
        d.setHours(0, 0, 0, 0);
        return d;
      };
      const parseTo = (v: unknown) => {
        if (!v) return undefined;
        const d = new Date(String(v));
        d.setHours(23, 59, 59, 999);
        return d;
      };
      const report = await getEmployeeWorkReport({
        userId,
        from: parseFrom(from),
        to: parseTo(to),
      });
      if (!report) {
        return res.status(404).json({ message: "Сотрудник не найден" });
      }
      res.json(report);
    } catch {
      res.status(500).json({ message: "Ошибка формирования отчёта по работам сотрудника" });
    }
  });

  app.patch("/api/service-requests/:id/budget", authenticate, requireRole(writeRoles), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { budgetEntryId } = linkBudgetToRequestSchema.parse(req.body);
      const row = await linkBudgetToServiceRequest(id, budgetEntryId);
      if (!row) return res.status(404).json({ message: "Заявка не найдена" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });
}
