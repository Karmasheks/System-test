import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { AuthenticatedUser } from "./routes";
import { storage } from "./storage";
import { getEffectivePermissionsForUser } from "./permissions-service";
import { canEditLevel, canViewLevel } from "@shared/permissions-constants";
import { filterBySubdivisionScope, canAccessSubdivision } from "@shared/subdivision-scope";
import {
  assertSubdivisionAccess,
  getSubdivisionScopeForRequest,
  subdivisionForbidden,
} from "./subdivision-scope-middleware";
import {
  insertProductSchema,
  insertMaterialSchema,
  insertProductBomSchema,
  insertProductEquipmentSchema,
  insertProductionOrderSchema,
  insertProductionScheduleSchema,
  insertProductionFactSchema,
  insertProductionDowntimeSchema,
  insertProductionToolingSchema,
  insertProductionDailyPlanSchema,
  productionOrderStatusSchema,
  productionOrderPrioritySchema,
} from "@shared/schema";
import {
  listProducts,
  filterProductsByScope,
  getProduct,
  createProduct,
  updateProduct,
  archiveProduct,
  listMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  archiveMaterial,
  listBom,
  addBomLine,
  removeBomLine,
  listProductEquipment,
  upsertProductEquipment,
  removeProductEquipment,
  listProductionOrders,
  getProductionOrder,
  createProductionOrder,
  updateProductionOrder,
  updateOrderStatus,
  getOrderRemainingQuantity,
  listSchedule,
  assignScheduleSlot,
  updateScheduleSlot,
  cancelScheduleSlot,
  listFacts,
  createProductionFact,
  addProductionDowntime,
  getProductionAnalytics,
  calculateOrderMaterialRequirements,
  listPlanConflicts,
  resolvePlanConflict,
  getProductionPlanningSettings,
  updateProductionPlanningSettings,
} from "./production-service";
import { listMaterialStocksBySubdivision, getInternalWarehouseSummary } from "./production-materials-service";
import {
  listProductionTooling,
  createProductionTooling,
  updateProductionTooling,
  getProductionTooling,
  getProductionToolingDetail,
  createProductFromTooling,
  syncToolingFromProduct,
  recordToolingMaintenance,
  listToolingMaintenanceDue,
} from "./production-tooling-service";
import {
  getDailyPlanGrid,
  bulkUpsertDailyPlan,
} from "./production-daily-plan-service";
import { createPlanningDemand } from "./production-planning-demand-service";
import {
  listShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  getShiftTemplate,
  ensureDefaultShiftTemplate,
  setDefaultShiftTemplate,
  getActiveShiftPattern,
} from "./shift-template-service";
import {
  listProductShiftNorms,
  bulkUpsertProductShiftNorms,
  resolveNormsForProduct,
} from "./product-shift-norm-service";
import { shiftTemplatePatternSchema } from "@shared/shift-template-types";
import { checkScheduleConflicts } from "./production-conflicts-service";
import { exportOrdersJson, importOrdersFromRows, previewMappedImportRows, importMappedOrders, getImportBatch, buildProductionExport } from "./production-import-export-service";
import {
  getEquipmentProductionSummary,
  getScheduleToirOverlay,
} from "./production-toir-integration-service";
import { getOeeAnalytics } from "./production-oee-service";
import {
  productionImportPreviewSchema,
  productionImportConfirmSchema,
  PRODUCTION_EXPORT_TYPES,
} from "@shared/production-excel-fields";
import { productionDisplayConfigSchema } from "@shared/production-display-config";

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;

const subdivisionIdsSchema = z.array(z.number().int().positive()).optional();

const createProductBodySchema = insertProductSchema.extend({
  subdivisionIds: subdivisionIdsSchema,
});
const updateProductBodySchema = createProductBodySchema.partial();

const createMaterialBodySchema = insertMaterialSchema.extend({
  subdivisionIds: subdivisionIdsSchema,
  productId: z.number().int().positive().nullable().optional(),
});
const updateMaterialBodySchema = createMaterialBodySchema.partial();

const bomRequirementSchema = z.object({
  productId: z.number().int().positive(),
  subdivisionId: z.number().int().positive(),
  quantity: z.number().positive(),
});

const createProductFromToolingSchema = z.object({
  sapCode: z.string().min(1),
  name: z.string().optional(),
  defaultShiftNorm: z.number().positive().optional(),
});

const toolingBodySchema = insertProductionToolingSchema.extend({
  productIds: z.array(z.number().int().positive()).optional(),
  skipCycleRecalc: z.boolean().optional(),
});

const toolingMaintenanceSchema = z.object({
  comment: z.string().optional(),
  performedAt: z.coerce.date().optional(),
  cyclesAtMaintenance: z.number().int().min(0).optional(),
});

const planningDemandSchema = z.object({
  subdivisionId: z.number().int().positive(),
  productId: z.number().int().positive(),
  requestedQuantity: z.number().positive(),
  equipmentId: z.string().min(1),
  toolingId: z.number().int().positive().optional(),
  pfNumber: z.string().optional(),
  desiredStartDate: z.string().optional(),
  desiredEndDate: z.string().optional(),
  priority: productionOrderPrioritySchema.optional(),
  comment: z.string().optional(),
  orderNumber: z.string().optional(),
  shiftNormOverride: z.number().positive().optional(),
  cycleTimeSecOverride: z.number().int().positive().optional(),
  setupTimeMin: z.number().int().min(0).optional(),
  activeShiftCodes: z.array(z.string().min(1)).optional(),
  planDistribution: z
    .array(
      z.object({
        planDate: z.string().min(1),
        shiftCode: z.string().min(1),
        plannedQuantity: z.number().min(0),
      })
    )
    .optional(),
});

const shiftTemplateBodySchema = z.object({
  subdivisionId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  pattern: shiftTemplatePatternSchema,
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

const productShiftNormsBodySchema = z.object({
  subdivisionId: z.number().int().positive(),
  productId: z.number().int().positive(),
  norms: z.array(
    z.object({
      shiftCode: z.string().min(1),
      shiftNorm: z.number().positive(),
    })
  ),
});

const conflictCheckSchema = z.object({
  subdivisionId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  equipmentId: z.string().min(1),
  startTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  endTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  plannedQuantity: z.number().min(0).default(0),
  scheduleId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
});

const orderStatusSchema = z.object({
  status: productionOrderStatusSchema,
});

const scheduleAssignSchema = insertProductionScheduleSchema.extend({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

const scheduleUpdateSchema = scheduleAssignSchema.partial();

const factBodySchema = insertProductionFactSchema.extend({
  reportDate: z.coerce.date(),
  reserveMaterials: z.boolean().optional(),
});

const downtimeBodySchema = insertProductionDowntimeSchema.extend({
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});

const planningSettingsPatchSchema = z.object({
  subdivisionId: z.number().int().positive(),
  materialWriteoffMode: z.enum(["sync", "async", "manual"]).optional(),
  timezone: z.string().nullable().optional(),
  defaultShiftTemplateId: z.number().int().positive().nullable().optional(),
  displayConfig: productionDisplayConfigSchema.partial().optional(),
});

const importOrdersSchema = z.object({
  subdivisionId: z.number().int().positive(),
  fileName: z.string().optional(),
  rows: z.array(
    z.object({
      orderNumber: z.string().optional(),
      productId: z.number().int().positive(),
      requestedQuantity: z.number().positive(),
      priority: productionOrderPrioritySchema.optional(),
      desiredStartDate: z.string().optional(),
      desiredEndDate: z.string().optional(),
      comment: z.string().optional(),
    })
  ),
});

async function requireProductionView(req: Request, res: Response) {
  const fullUser = await storage.getUser((req.user as AuthenticatedUser).id);
  if (!fullUser) {
    res.status(401).json({ message: "Не авторизован" });
    return null;
  }
  const perms = await getEffectivePermissionsForUser(fullUser);
  if (!canViewLevel(perms.modules.production_planning)) {
    res.status(403).json({ message: "Нет доступа к планированию производства" });
    return null;
  }
  return { user: fullUser, perms };
}

async function requireProductionEdit(req: Request, res: Response) {
  const ctx = await requireProductionView(req, res);
  if (!ctx) return null;
  if (!canEditLevel(ctx.perms.modules.production_planning)) {
    res.status(403).json({ message: "Нет прав на редактирование планирования" });
    return null;
  }
  return ctx;
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function handleSubdivisionError(res: Response, err: unknown) {
  const status = (err as { statusCode?: number }).statusCode;
  if (status === 403) return subdivisionForbidden(res);
  return false;
}

export function registerProductionRoutes(app: Express, authenticate: AuthMiddleware) {
  app.get("/api/production/products", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const subdivisionId = req.query.subdivisionId
        ? Number(req.query.subdivisionId)
        : undefined;
      const search = req.query.search as string | undefined;
      const activeOnly = req.query.activeOnly === "true";

      let items = await listProducts({
        subdivisionId: subdivisionId && !Number.isNaN(subdivisionId) ? subdivisionId : undefined,
        search,
        activeOnly,
      });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        items = filterProductsByScope(items, subScope);
      }

      res.json(items);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки изделий" });
    }
  });

  app.get("/api/production/products/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const product = await getProduct(Number(req.params.id));
    if (!product) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope && !subScope.viewAll) {
      const allowed =
        canAccessSubdivision(subScope, product.subdivisionId) ||
        (product.isSharedAcrossSubdivisions &&
          product.subdivisionIds.some((sid) => canAccessSubdivision(subScope, sid)));
      if (!allowed) return subdivisionForbidden(res);
    }

    res.json(product);
  });

  app.post("/api/production/products", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = createProductBodySchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const { subdivisionIds, ...productData } = body;
      const product = await createProduct(productData, subdivisionIds);
      if (!product) {
        return res.status(400).json({ message: "Не удалось создать изделие" });
      }
      if (product.pfNumber) {
        await syncToolingFromProduct(product.id);
      }
      res.status(201).json(product);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/production/products/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const id = Number(req.params.id);
      const existing = await getProduct(id);
      if (!existing) return res.status(404).json({ message: "Не найдено" });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, existing.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const body = updateProductBodySchema.parse(req.body);
      const { subdivisionIds, ...productData } = body;
      const product = await updateProduct(id, productData, subdivisionIds);
      if (product?.pfNumber) {
        await syncToolingFromProduct(product.id);
      }
      res.json(product);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка обновления";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/production/products/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const existing = await getProduct(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, existing.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    const archived = await archiveProduct(existing.id);
    res.json(archived);
  });

  app.get("/api/production/products/:id/equipment", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const productId = Number(req.params.id);
    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const product = await getProduct(productId);
    if (!product) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(await listProductEquipment(productId, subdivisionId));
  });

  app.post("/api/production/products/:id/equipment", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const productId = Number(req.params.id);
      const product = await getProduct(productId);
      if (!product) return res.status(404).json({ message: "Не найдено" });

      const body = insertProductEquipmentSchema.parse({
        ...req.body,
        productId,
      });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      res.status(201).json(await upsertProductEquipment(body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/production/products/equipment/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const row = await removeProductEquipment(Number(req.params.id));
    if (!row) return res.status(404).json({ message: "Не найдено" });
    res.json(row);
  });

  app.get("/api/production/materials", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const subdivisionId = req.query.subdivisionId
        ? Number(req.query.subdivisionId)
        : undefined;
      const search = req.query.search as string | undefined;
      const activeOnly = req.query.activeOnly === "true";

      let items = await listMaterials({
        subdivisionId: subdivisionId && !Number.isNaN(subdivisionId) ? subdivisionId : undefined,
        search,
        activeOnly,
      });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        items = filterBySubdivisionScope(
          items.filter((m) => m.subdivisionId != null) as Array<{ subdivisionId: number }>,
          subScope
        ) as typeof items;
        const shared = items.filter(
          (m) => m.subdivisionId == null || m.isSharedAcrossSubdivisions
        );
        items = [...new Map([...items, ...shared].map((m) => [m.id, m])).values()];
      }

      res.json(items);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки материалов" });
    }
  });

  app.post("/api/production/materials", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = createMaterialBodySchema.parse(req.body);
      if (body.subdivisionId != null) {
        const subScope = await getSubdivisionScopeForRequest(req);
        if (subScope) {
          try {
            assertSubdivisionAccess(subScope, body.subdivisionId);
          } catch (e) {
            if (handleSubdivisionError(res, e)) return;
          }
        }
      }

      const { subdivisionIds, ...materialData } = body;
      const material = await createMaterial(materialData, subdivisionIds);
      res.status(201).json(material);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/production/materials/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const id = Number(req.params.id);
      const existing = await getMaterial(id);
      if (!existing) return res.status(404).json({ message: "Не найдено" });

      if (existing.subdivisionId != null) {
        const subScope = await getSubdivisionScopeForRequest(req);
        if (subScope) {
          try {
            assertSubdivisionAccess(subScope, existing.subdivisionId);
          } catch (e) {
            if (handleSubdivisionError(res, e)) return;
          }
        }
      }

      const body = updateMaterialBodySchema.parse(req.body);
      const { subdivisionIds, ...materialData } = body;
      const material = await updateMaterial(id, materialData, subdivisionIds);
      res.json(material);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка обновления";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/materials/stocks", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      res.json(await listMaterialStocksBySubdivision(subdivisionId));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки остатков" });
    }
  });

  app.get("/api/production/warehouse/summary", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const from = parseOptionalDate(req.query.from as string | undefined);
      const to = parseOptionalDate(req.query.to as string | undefined);
      res.json(await getInternalWarehouseSummary(subdivisionId, from, to));
    } catch {
      res.status(500).json({ message: "Ошибка сводки внутреннего склада" });
    }
  });

  app.get("/api/production/tooling", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      res.json(
        await listProductionTooling({
          subdivisionId,
          activeOnly: req.query.activeOnly === "true",
          search: req.query.search as string | undefined,
        })
      );
    } catch {
      res.status(500).json({ message: "Ошибка загрузки оснастки" });
    }
  });

  app.post("/api/production/tooling", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = toolingBodySchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }
      res.status(201).json(await createProductionTooling(body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/production/tooling/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const id = Number(req.params.id);
    const existing = await getProductionTooling(id);
    if (!existing) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, existing.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const body = toolingBodySchema.partial().parse(req.body);
      res.json(await updateProductionTooling(id, body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка обновления";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/tooling/maintenance-due", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      res.json(await listToolingMaintenanceDue(subdivisionId));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки ТО оснастки" });
    }
  });

  app.get("/api/production/tooling/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const id = Number(req.params.id);
    const detail = await getProductionToolingDetail(id);
    if (!detail) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, detail.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(detail);
  });

  app.post("/api/production/tooling/:id/maintenance", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const id = Number(req.params.id);
    const existing = await getProductionTooling(id);
    if (!existing) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, existing.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const body = toolingMaintenanceSchema.parse(req.body);
      const record = await recordToolingMaintenance(id, body, {
        id: ctx.user.id,
        name: ctx.user.name,
      });
      res.status(201).json({
        record,
        tooling: await getProductionToolingDetail(id),
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка записи ТО";
      res.status(400).json({ message });
    }
  });

  app.post("/api/production/tooling/:id/create-product", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const id = Number(req.params.id);
    const existing = await getProductionTooling(id);
    if (!existing) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, existing.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const body = createProductFromToolingSchema.parse(req.body);
      res.status(201).json(await createProductFromTooling(id, body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания изделия";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/daily-plan/grid", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const from =
        parseOptionalDate(req.query.from as string | undefined) ??
        new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const to =
        parseOptionalDate(req.query.to as string | undefined) ??
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

      res.json(
        await getDailyPlanGrid({
          subdivisionId,
          from,
          to,
          equipmentId: req.query.equipmentId as string | undefined,
        })
      );
    } catch {
      res.status(500).json({ message: "Ошибка загрузки календарного плана" });
    }
  });

  app.post("/api/production/daily-plan/bulk", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = z.object({
        subdivisionId: z.number().int().positive(),
        entries: z.array(
          z.object({
            equipmentId: z.string().min(1),
            orderId: z.number().int().positive().nullable().optional(),
            productId: z.number().int().positive().nullable().optional(),
            planDate: z.string().min(1),
            shiftCode: z.enum(["1", "2"]).optional(),
            plannedQuantity: z.number().min(0),
            pfNumber: z.string().nullable().optional(),
            toolingId: z.number().int().positive().nullable().optional(),
            comment: z.string().nullable().optional(),
          })
        ),
      }).parse(req.body);

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const results = await bulkUpsertDailyPlan(body.subdivisionId, body.entries);
      res.json({ updated: results.length, cells: results });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка сохранения";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/bom", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const productId = Number(req.query.productId);
    const subdivisionId = Number(req.query.subdivisionId);
    if (!productId || !subdivisionId) {
      return res.status(400).json({ message: "Укажите productId и subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(await listBom(productId, subdivisionId));
  });

  app.post("/api/production/bom", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = insertProductBomSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }
      res.status(201).json(await addBomLine(body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/production/bom/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const line = await removeBomLine(Number(req.params.id));
    if (!line) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, line.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(line);
  });

  app.post("/api/production/bom/calculate-requirement", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const body = bomRequirementSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const { calculateMaterialRequirements } = await import("./production-materials-service");
      const requirements = await calculateMaterialRequirements(
        body.productId,
        body.subdivisionId,
        body.quantity
      );
      res.json({ productId: body.productId, subdivisionId: body.subdivisionId, quantity: body.quantity, requirements });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка расчёта";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/orders", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const subdivisionId = req.query.subdivisionId ? Number(req.query.subdivisionId) : undefined;
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      const status = req.query.status as string | undefined;
      const priority = req.query.priority as string | undefined;

      let orders = await listProductionOrders({
        subdivisionId: subdivisionId && !Number.isNaN(subdivisionId) ? subdivisionId : undefined,
        productId: productId && !Number.isNaN(productId) ? productId : undefined,
        status,
        priority,
      });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        orders = filterBySubdivisionScope(orders, subScope);
      }

      res.json(orders);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки заказов" });
    }
  });

  app.get("/api/production/orders/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const order = await getProductionOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, order.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(order);
  });

  app.post("/api/production/orders", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = insertProductionOrderSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const user = req.user as AuthenticatedUser;
      const order = await createProductionOrder(body, { id: user.id, name: user.name });
      res.status(201).json(order);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания";
      res.status(400).json({ message });
    }
  });

  app.post("/api/production/orders/planning-demand", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = planningDemandSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const user = req.user as AuthenticatedUser;
      const result = await createPlanningDemand(body, { id: user.id, name: user.name });
      res.status(201).json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания потребности";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/production/orders/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const id = Number(req.params.id);
      const existing = await getProductionOrder(id);
      if (!existing) return res.status(404).json({ message: "Не найдено" });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, existing.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const body = insertProductionOrderSchema.partial().parse(req.body);
      const order = await updateProductionOrder(id, body);
      res.json(order);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка обновления";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/production/orders/:id/status", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const id = Number(req.params.id);
      const existing = await getProductionOrder(id);
      if (!existing) return res.status(404).json({ message: "Не найдено" });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, existing.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const { status } = orderStatusSchema.parse(req.body);
      const order = await updateOrderStatus(id, status);
      res.json(order);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/orders/:id/remaining", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const id = Number(req.params.id);
    const existing = await getProductionOrder(id);
    if (!existing) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, existing.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(await getOrderRemainingQuantity(id));
  });

  app.get("/api/production/schedule", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const subdivisionId = req.query.subdivisionId ? Number(req.query.subdivisionId) : undefined;
      const equipmentId = req.query.equipmentId as string | undefined;
      const orderId = req.query.orderId ? Number(req.query.orderId) : undefined;
      const from = parseOptionalDate(req.query.from as string | undefined);
      const to = parseOptionalDate(req.query.to as string | undefined);

      let slots = await listSchedule({
        subdivisionId: subdivisionId && !Number.isNaN(subdivisionId) ? subdivisionId : undefined,
        equipmentId,
        orderId: orderId && !Number.isNaN(orderId) ? orderId : undefined,
        from,
        to,
      });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        slots = filterBySubdivisionScope(slots, subScope);
      }

      res.json(slots);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки графика" });
    }
  });

  app.post("/api/production/schedule", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = scheduleAssignSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const user = req.user as AuthenticatedUser;
      const result = await assignScheduleSlot(body, { id: user.id, name: user.name });
      res.status(201).json(result);
    } catch (e: unknown) {
      const conflicts = (e as { conflicts?: unknown }).conflicts;
      if (conflicts) {
        return res.status(409).json({
          message: e instanceof Error ? e.message : "Конфликты планирования",
          conflicts,
        });
      }
      const message = e instanceof Error ? e.message : "Ошибка планирования";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/production/schedule/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const id = Number(req.params.id);
      const { getScheduleSlot } = await import("./production-service");
      const existing = await getScheduleSlot(id);
      if (!existing) return res.status(404).json({ message: "Не найдено" });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, existing.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const body = scheduleUpdateSchema.parse(req.body);
      const user = req.user as AuthenticatedUser;
      const result = await updateScheduleSlot(id, body, { id: user.id, name: user.name });
      res.json(result);
    } catch (e: unknown) {
      const conflicts = (e as { conflicts?: unknown }).conflicts;
      if (conflicts) {
        return res.status(409).json({
          message: e instanceof Error ? e.message : "Конфликты планирования",
          conflicts,
        });
      }
      const message = e instanceof Error ? e.message : "Ошибка обновления";
      res.status(400).json({ message });
    }
  });

  app.post("/api/production/schedule/:id/cancel", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const { getScheduleSlot, cancelScheduleSlot } = await import("./production-service");
    const existing = await getScheduleSlot(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, existing.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(await cancelScheduleSlot(existing.id));
  });

  app.get("/api/production/equipment/:equipmentId/plan-summary", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const equipmentId = req.params.equipmentId;
    const eq = await storage.getEquipment(equipmentId);
    if (!eq) return res.status(404).json({ message: "Оборудование не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, eq.subdivisionId ?? eq.homeSubdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const subdivisionId = eq.subdivisionId ?? eq.homeSubdivisionId;
      const settings =
        subdivisionId != null ? await getProductionPlanningSettings(subdivisionId) : null;
      const card = settings?.displayConfig.equipmentCard;
      const timeline = settings?.displayConfig.timeline;
      res.json(
        await getEquipmentProductionSummary(equipmentId, {
          horizonDays: card?.horizonDays,
          maxSlots: card?.maxSlots,
          slotStatuses: timeline?.slotStatuses,
        })
      );
    } catch {
      res.status(500).json({ message: "Ошибка загрузки производственного плана" });
    }
  });

  app.get("/api/production/schedule/toir-overlay", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    const from = parseOptionalDate(req.query.from as string | undefined) ?? new Date();
    const to =
      parseOptionalDate(req.query.to as string | undefined) ??
      new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const equipmentId = req.query.equipmentId as string | undefined;

    try {
      const settings = await getProductionPlanningSettings(subdivisionId);
      const timeline = settings.displayConfig.timeline;
      res.json(
        await getScheduleToirOverlay(
          {
            subdivisionId,
            from,
            to,
            equipmentId,
          },
          {
            showMaintenance: timeline.showMaintenanceOverlay,
            showRepair: timeline.showRepairOverlay,
            maintenanceDefaultHours: timeline.maintenanceDefaultHours,
            repairDefaultHours: timeline.repairDefaultHours,
          }
        )
      );
    } catch {
      res.status(500).json({ message: "Ошибка загрузки overlay ТОиР" });
    }
  });

  app.get("/api/production/shift-templates", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;
    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId) return res.status(400).json({ message: "Укажите subdivisionId" });
    try {
      await ensureDefaultShiftTemplate(subdivisionId);
      res.json(await listShiftTemplates(subdivisionId));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки шаблонов смен" });
    }
  });

  app.get("/api/production/shift-templates/active", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;
    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId) return res.status(400).json({ message: "Укажите subdivisionId" });
    try {
      res.json(await getActiveShiftPattern(subdivisionId));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки смен" });
    }
  });

  app.post("/api/production/shift-templates", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;
    try {
      const body = shiftTemplateBodySchema.parse(req.body);
      res.status(201).json(await createShiftTemplate(body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка создания";
      res.status(400).json({ message });
    }
  });

  app.patch("/api/production/shift-templates/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;
    try {
      const body = shiftTemplateBodySchema.partial().parse(req.body);
      const row = await updateShiftTemplate(Number(req.params.id), body);
      if (!row) return res.status(404).json({ message: "Не найдено" });
      res.json(row);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка обновления";
      res.status(400).json({ message });
    }
  });

  app.post("/api/production/shift-templates/default", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;
    try {
      const body = z
        .object({
          subdivisionId: z.number().int().positive(),
          templateId: z.number().int().positive().nullable(),
        })
        .parse(req.body);
      await setDefaultShiftTemplate(body.subdivisionId, body.templateId);
      res.json({ ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/products/:id/shift-norms", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;
    const productId = Number(req.params.id);
    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId) return res.status(400).json({ message: "Укажите subdivisionId" });
    try {
      const pattern = await getActiveShiftPattern(subdivisionId);
      const stored = await listProductShiftNorms(productId, subdivisionId);
      const resolved = await resolveNormsForProduct(productId, subdivisionId, pattern.slots);
      res.json({ stored, resolved, slots: pattern.slots });
    } catch {
      res.status(500).json({ message: "Ошибка загрузки норм" });
    }
  });

  app.put("/api/production/products/:id/shift-norms", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;
    try {
      const productId = Number(req.params.id);
      const body = productShiftNormsBodySchema.parse({ ...req.body, productId });
      const rows = await bulkUpsertProductShiftNorms(
        body.subdivisionId,
        body.productId,
        body.norms
      );
      res.json(rows);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка сохранения";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/settings", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      res.json(await getProductionPlanningSettings(subdivisionId));
    } catch {
      res.status(500).json({ message: "Ошибка загрузки настроек" });
    }
  });

  app.patch("/api/production/settings", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = planningSettingsPatchSchema.parse(req.body);
      const subdivisionId = body.subdivisionId;

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const { displayConfig, ...rest } = body;
      res.json(
        await updateProductionPlanningSettings(subdivisionId, {
          ...rest,
          displayConfig: displayConfig ?? undefined,
        })
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка сохранения настроек";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/facts", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const subdivisionId = req.query.subdivisionId ? Number(req.query.subdivisionId) : undefined;
      const orderId = req.query.orderId ? Number(req.query.orderId) : undefined;
      const equipmentId = req.query.equipmentId as string | undefined;
      const from = parseOptionalDate(req.query.from as string | undefined);
      const to = parseOptionalDate(req.query.to as string | undefined);

      let facts = await listFacts({
        subdivisionId: subdivisionId && !Number.isNaN(subdivisionId) ? subdivisionId : undefined,
        orderId: orderId && !Number.isNaN(orderId) ? orderId : undefined,
        equipmentId,
        from,
        to,
      });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        facts = filterBySubdivisionScope(facts, subScope);
      }

      res.json(facts);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки факта" });
    }
  });

  app.post("/api/production/facts", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const parsed = factBodySchema.parse(req.body);
      const { reserveMaterials, ...factInput } = parsed;
      const factData = {
        ...factInput,
        reportDate:
          parsed.reportDate instanceof Date
            ? parsed.reportDate.toISOString().slice(0, 10)
            : String(parsed.reportDate),
      };

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, factData.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const user = req.user as AuthenticatedUser;
      const result = await createProductionFact(factData, { id: user.id, name: user.name }, {
        reserveMaterials,
      });
      res.status(201).json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка сохранения факта";
      res.status(400).json({ message });
    }
  });

  app.post("/api/production/facts/downtimes", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = downtimeBodySchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }
      res.status(201).json(await addProductionDowntime(body));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/conflicts", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    const onlyUnresolved = req.query.resolved !== "true";
    res.json(await listPlanConflicts(subdivisionId, onlyUnresolved));
  });

  app.patch("/api/production/conflicts/:id/resolve", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    const conflict = await resolvePlanConflict(Number(req.params.id));
    if (!conflict) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, conflict.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(conflict);
  });

  app.post("/api/production/conflicts/check", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const body = conflictCheckSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const conflicts = await checkScheduleConflicts({
        subdivisionId: body.subdivisionId,
        orderId: body.orderId,
        equipmentId: body.equipmentId,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        plannedQuantity: body.plannedQuantity,
        scheduleId: body.scheduleId,
        productId: body.productId,
      });

      res.json({
        conflicts,
        conflictStatus:
          conflicts.some((c) => c.severity === "blocking")
            ? "blocked"
            : conflicts.length > 0
              ? "warning"
              : "none",
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка проверки";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/analytics", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const from = parseOptionalDate(req.query.from as string | undefined);
      const to = parseOptionalDate(req.query.to as string | undefined);
      res.json(await getProductionAnalytics({ subdivisionId, from, to }));
    } catch {
      res.status(500).json({ message: "Ошибка аналитики" });
    }
  });

  app.get("/api/production/oee/analytics", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    try {
      const from = parseOptionalDate(req.query.from as string | undefined);
      const to = parseOptionalDate(req.query.to as string | undefined);
      const equipmentId =
        typeof req.query.equipmentId === "string" && req.query.equipmentId.trim()
          ? req.query.equipmentId.trim()
          : undefined;
      res.json(
        await getOeeAnalytics({ subdivisionId, from, to, equipmentId })
      );
    } catch {
      res.status(500).json({ message: "Ошибка OEE-аналитики" });
    }
  });

  app.get("/api/production/orders/:id/material-requirements", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const id = Number(req.params.id);
    const existing = await getProductionOrder(id);
    if (!existing) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, existing.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(await calculateOrderMaterialRequirements(id));
  });

  app.get("/api/production/export/orders", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(await exportOrdersJson(subdivisionId));
  });

  app.get("/api/production/export/:type", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const type = req.params.type;
    if (!PRODUCTION_EXPORT_TYPES.includes(type as typeof PRODUCTION_EXPORT_TYPES[number])) {
      return res.status(400).json({ message: "Неверный тип экспорта" });
    }

    const subdivisionId = Number(req.query.subdivisionId);
    if (!subdivisionId || Number.isNaN(subdivisionId)) {
      return res.status(400).json({ message: "Укажите subdivisionId" });
    }

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    const from = parseOptionalDate(req.query.from as string | undefined);
    const to = parseOptionalDate(req.query.to as string | undefined);

    try {
      const { buffer, filename } = await buildProductionExport(
        type as typeof PRODUCTION_EXPORT_TYPES[number],
        subdivisionId,
        { from, to }
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка экспорта";
      res.status(500).json({ message });
    }
  });

  app.post("/api/production/import/preview", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    try {
      const body = productionImportPreviewSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.defaultSubdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const preview = await previewMappedImportRows(body.defaultSubdivisionId, body.rows);
      res.json({
        fileName: body.fileName,
        rowsTotal: body.rows.length,
        rowsValid: preview.filter((p) => p.valid).length,
        rowsInvalid: preview.filter((p) => !p.valid).length,
        preview,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка предпросмотра";
      res.status(400).json({ message });
    }
  });

  app.post("/api/production/import/confirm", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = productionImportConfirmSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.defaultSubdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const user = req.user as AuthenticatedUser;
      const result = await importMappedOrders(
        body.defaultSubdivisionId,
        body.rows,
        { id: user.id, name: user.name },
        body.fileName ?? "import.xlsx"
      );
      res.status(201).json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка импорта";
      res.status(400).json({ message });
    }
  });

  app.get("/api/production/import/batches/:id", authenticate, async (req, res) => {
    const ctx = await requireProductionView(req, res);
    if (!ctx) return;

    const batch = await getImportBatch(Number(req.params.id));
    if (!batch) return res.status(404).json({ message: "Не найдено" });

    const subScope = await getSubdivisionScopeForRequest(req);
    if (subScope) {
      try {
        assertSubdivisionAccess(subScope, batch.batch.subdivisionId);
      } catch (e) {
        if (handleSubdivisionError(res, e)) return;
      }
    }

    res.json(batch);
  });

  app.post("/api/production/import/orders", authenticate, async (req, res) => {
    const ctx = await requireProductionEdit(req, res);
    if (!ctx) return;

    try {
      const body = importOrdersSchema.parse(req.body);
      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, body.subdivisionId);
        } catch (e) {
          if (handleSubdivisionError(res, e)) return;
        }
      }

      const user = req.user as AuthenticatedUser;
      const batch = await importOrdersFromRows(
        body.subdivisionId,
        body.rows,
        { id: user.id, name: user.name },
        body.fileName
      );
      res.status(201).json(batch);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка импорта";
      res.status(400).json({ message });
    }
  });
}
