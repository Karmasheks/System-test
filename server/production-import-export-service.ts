import * as XLSX from "xlsx";
import { db } from "./db";
import {
  productionImportBatches,
  productionImportErrors,
  productionOrders,
  products,
  subdivisions,
  equipment,
  type InsertProductionImportBatch,
} from "@shared/schema";
import { and, eq, ilike } from "drizzle-orm";
import {
  createProductionOrder,
  listProductionOrders,
  listSchedule,
  listFacts,
  listProducts,
  listPlanConflicts,
  getProductionAnalytics,
} from "./production-service";
import { calculateMaterialRequirements } from "./production-materials-service";
import {
  normalizeImportPriority,
  type MappedProductionImportRow,
  type ProductionExportType,
  type ImportPreviewItem,
  type ImportPreviewError,
} from "@shared/production-excel-fields";

export interface ProductionOrderImportRow {
  orderNumber?: string;
  productId: number;
  requestedQuantity: number;
  priority?: string;
  desiredStartDate?: string;
  desiredEndDate?: string;
  comment?: string;
}

function buildXlsxBuffer(sheets: { name: string; rows: unknown[][] }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function exportFilename(type: ProductionExportType, subdivisionId: number): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `production-${type}-${subdivisionId}-${stamp}.xlsx`;
}

async function resolveSubdivisionId(
  defaultSubdivisionId: number,
  subdivisionName?: string,
  subdivisionId?: number
): Promise<{ id: number; name: string } | null> {
  if (subdivisionId != null) {
    const [row] = await db
      .select()
      .from(subdivisions)
      .where(eq(subdivisions.id, subdivisionId));
    if (row) return { id: row.id, name: row.name };
    return null;
  }
  if (subdivisionName?.trim()) {
    const name = subdivisionName.trim();
    const [exact] = await db
      .select()
      .from(subdivisions)
      .where(ilike(subdivisions.name, name));
    if (exact) return { id: exact.id, name: exact.name };
    return null;
  }
  const [def] = await db
    .select()
    .from(subdivisions)
    .where(eq(subdivisions.id, defaultSubdivisionId));
  if (!def) return null;
  return { id: def.id, name: def.name };
}

async function resolveProduct(
  subdivisionId: number,
  sapCode?: string,
  name?: string
) {
  const sap = sapCode?.trim();
  const productName = name?.trim();

  if (sap) {
    const [bySap] = await db
      .select()
      .from(products)
      .where(and(eq(products.subdivisionId, subdivisionId), eq(products.sapCode, sap)));
    if (bySap) return bySap;
  }

  if (productName) {
    const [byName] = await db
      .select()
      .from(products)
      .where(and(eq(products.subdivisionId, subdivisionId), eq(products.name, productName)));
    if (byName) return byName;

    const [byNameLike] = await db
      .select()
      .from(products)
      .where(
        and(eq(products.subdivisionId, subdivisionId), ilike(products.name, productName))
      );
    if (byNameLike) return byNameLike;
  }

  return null;
}

function parseDesiredDate(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

export async function previewMappedImportRows(
  defaultSubdivisionId: number,
  rows: MappedProductionImportRow[]
): Promise<ImportPreviewItem[]> {
  const results: ImportPreviewItem[] = [];

  for (const row of rows) {
    const errors: ImportPreviewError[] = [];

    if (!row.quantity || row.quantity <= 0) {
      errors.push({ field: "quantity", message: "Укажите количество больше 0" });
    }

    if (!row.productSapCode?.trim() && !row.productName?.trim()) {
      errors.push({
        field: "productSapCode",
        message: "Укажите SAP или наименование изделия",
      });
    }

    const subdivision = await resolveSubdivisionId(
      defaultSubdivisionId,
      row.subdivisionName,
      row.subdivisionId
    );
    if (!subdivision) {
      errors.push({
        field: "subdivision",
        message: "Подразделение не найдено",
      });
    }

    let product = null;
    if (subdivision) {
      product = await resolveProduct(
        subdivision.id,
        row.productSapCode,
        row.productName
      );
      if (!product && (row.productSapCode?.trim() || row.productName?.trim())) {
        errors.push({
          field: "productSapCode",
          message: "Изделие не найдено в подразделении",
        });
      }
    }

    const priority = normalizeImportPriority(row.priority);
    const desiredStartDate = parseDesiredDate(row.desiredDate);

    if (row.desiredDate?.trim() && !desiredStartDate) {
      errors.push({ field: "desiredDate", message: "Некорректная дата" });
    }

    const valid = errors.length === 0 && product != null && subdivision != null;

    results.push({
      rowNumber: row.rowNumber,
      valid,
      errors,
      resolved:
        valid && product && subdivision
          ? {
              subdivisionId: subdivision.id,
              subdivisionName: subdivision.name,
              productId: product.id,
              productName: product.name,
              productSapCode: product.sapCode,
              quantity: row.quantity!,
              priority,
              desiredStartDate,
              comment: row.comment?.trim() || undefined,
            }
          : undefined,
      raw: row,
    });
  }

  return results;
}

export async function importMappedOrders(
  defaultSubdivisionId: number,
  rows: MappedProductionImportRow[],
  user: { id: number; name: string },
  fileName = "import.xlsx"
) {
  const preview = await previewMappedImportRows(defaultSubdivisionId, rows);

  const [batch] = await db
    .insert(productionImportBatches)
    .values({
      subdivisionId: defaultSubdivisionId,
      fileName,
      status: "processing",
      rowsTotal: rows.length,
      importedById: user.id,
      importedByName: user.name,
    } satisfies InsertProductionImportBatch)
    .returning();

  let rowsSuccess = 0;
  let rowsFailed = 0;

  for (const item of preview) {
    if (!item.valid || !item.resolved) {
      rowsFailed++;
      for (const err of item.errors) {
        await db.insert(productionImportErrors).values({
          batchId: batch.id,
          rowNumber: item.rowNumber,
          fieldName: err.field,
          rawValue: JSON.stringify(item.raw),
          message: err.message,
        });
      }
      if (item.errors.length === 0) {
        await db.insert(productionImportErrors).values({
          batchId: batch.id,
          rowNumber: item.rowNumber,
          fieldName: "row",
          rawValue: JSON.stringify(item.raw),
          message: "Строка не прошла валидацию",
        });
      }
      continue;
    }

    try {
      const r = item.resolved;
      await createProductionOrder(
        {
          subdivisionId: r.subdivisionId,
          orderNumber: "",
          orderNumberIsManual: false,
          productId: r.productId,
          requestedQuantity: r.quantity,
          priority: r.priority as "low" | "medium" | "high" | "critical",
          desiredStartDate: r.desiredStartDate,
          comment: r.comment,
          source: "excel_import",
          status: "draft",
        },
        user
      );
      rowsSuccess++;
    } catch (e: unknown) {
      rowsFailed++;
      const message = e instanceof Error ? e.message : "Ошибка импорта";
      await db.insert(productionImportErrors).values({
        batchId: batch.id,
        rowNumber: item.rowNumber,
        fieldName: "row",
        rawValue: JSON.stringify(item.raw),
        message,
      });
    }
  }

  const status =
    rowsFailed === 0 ? "completed" : rowsSuccess === 0 ? "failed" : "partial";

  const [updated] = await db
    .update(productionImportBatches)
    .set({ status, rowsSuccess, rowsFailed })
    .where(eq(productionImportBatches.id, batch.id))
    .returning();

  const errors = await db
    .select()
    .from(productionImportErrors)
    .where(eq(productionImportErrors.batchId, batch.id));

  return { batch: updated, errors, preview };
}

export async function importOrdersFromRows(
  subdivisionId: number,
  rows: ProductionOrderImportRow[],
  user: { id: number; name: string },
  fileName = "import.json"
) {
  const mapped: MappedProductionImportRow[] = rows.map((row, i) => ({
    rowNumber: i + 1,
    productSapCode: undefined,
    productName: undefined,
    quantity: row.requestedQuantity,
    priority: row.priority,
    desiredDate: row.desiredStartDate ?? row.desiredEndDate,
    comment: row.comment,
    subdivisionId: subdivisionId,
  }));

  for (let i = 0; i < rows.length; i++) {
    mapped[i].productSapCode = undefined;
    if (rows[i].productId) {
      const [p] = await db.select().from(products).where(eq(products.id, rows[i].productId));
      if (p) {
        mapped[i].productSapCode = p.sapCode;
        mapped[i].productName = p.name;
      }
    }
  }

  return importMappedOrders(subdivisionId, mapped, user, fileName);
}

export async function getImportBatch(id: number) {
  const [batch] = await db
    .select()
    .from(productionImportBatches)
    .where(eq(productionImportBatches.id, id));
  if (!batch) return null;

  const errors = await db
    .select()
    .from(productionImportErrors)
    .where(eq(productionImportErrors.batchId, id));

  return { batch, errors };
}

export async function exportOrdersJson(subdivisionId: number) {
  const orders = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.subdivisionId, subdivisionId));
  return {
    exportedAt: new Date().toISOString(),
    subdivisionId,
    orders,
  };
}

export async function buildProductionExport(
  type: ProductionExportType,
  subdivisionId: number,
  options?: { from?: Date; to?: Date }
): Promise<{ buffer: Buffer; filename: string }> {
  const from = options?.from;
  const to = options?.to;

  switch (type) {
    case "plan":
      return exportProductionPlan(subdivisionId, from, to);
    case "shift-assignment":
      return exportShiftAssignment(subdivisionId, from, to);
    case "material-requirements":
      return exportMaterialRequirements(subdivisionId);
    case "plan-fact":
      return exportPlanFact(subdivisionId, from, to);
    case "conflicts":
      return exportConflicts(subdivisionId);
    default:
      throw new Error("Неизвестный тип экспорта");
  }
}

async function exportProductionPlan(
  subdivisionId: number,
  from?: Date,
  to?: Date
) {
  const schedule = await listSchedule({ subdivisionId, from, to });
  const orders = await listProductionOrders({ subdivisionId });
  const productList = await listProducts({ subdivisionId });
  const equipmentList = await db.select().from(equipment);

  const header = [
    "№ заказа",
    "Изделие",
    "SAP",
    "Оборудование",
    "Начало",
    "Конец",
    "План, шт",
    "Статус",
    "Конфликт",
    "Комментарий",
  ];

  const rows = schedule.map((s) => {
    const order = orders.find((o) => o.id === s.orderId);
    const product = productList.find((p) => p.id === order?.productId);
    const eq = equipmentList.find((e) => e.id === s.equipmentId);
    return [
      order?.orderNumber ?? s.orderId,
      product?.name ?? "",
      product?.sapCode ?? "",
      eq?.name ?? s.equipmentId,
      s.startTime.toISOString(),
      s.endTime.toISOString(),
      s.plannedQuantity,
      s.status,
      s.conflictStatus,
      s.comment ?? "",
    ];
  });

  const buffer = buildXlsxBuffer([
    { name: "Производственный план", rows: [header, ...rows] },
  ]);
  return { buffer, filename: exportFilename("plan", subdivisionId) };
}

async function exportShiftAssignment(
  subdivisionId: number,
  from?: Date,
  to?: Date
) {
  const schedule = await listSchedule({ subdivisionId, from, to });
  const facts = await listFacts({ subdivisionId, from, to });
  const orders = await listProductionOrders({ subdivisionId });
  const productList = await listProducts({ subdivisionId });
  const equipmentList = await db.select().from(equipment);

  const header = [
    "Тип",
    "Дата",
    "Оборудование",
    "№ заказа",
    "Изделие",
    "План, шт",
    "Факт, шт",
    "Брак",
    "Простой, мин",
    "Комментарий",
  ];

  const scheduleRows = schedule
    .filter((s) => s.status !== "cancelled")
    .map((s) => {
      const order = orders.find((o) => o.id === s.orderId);
      const product = productList.find((p) => p.id === order?.productId);
      const eq = equipmentList.find((e) => e.id === s.equipmentId);
      return [
        "План",
        s.startTime.toISOString().slice(0, 10),
        eq?.name ?? s.equipmentId,
        order?.orderNumber ?? s.orderId,
        product?.name ?? "",
        s.plannedQuantity,
        "",
        "",
        "",
        s.comment ?? "",
      ];
    });

  const factRows = facts.map((f) => {
    const order = orders.find((o) => o.id === f.orderId);
    const product = productList.find((p) => p.id === order?.productId);
    const eq = equipmentList.find((e) => e.id === f.equipmentId);
    return [
      "Факт",
      String(f.reportDate),
      eq?.name ?? f.equipmentId,
      order?.orderNumber ?? f.orderId,
      product?.name ?? "",
      "",
      f.producedQuantity,
      f.defectiveQuantity,
      f.downtimeMinutes,
      f.comment ?? "",
    ];
  });

  const buffer = buildXlsxBuffer([
    { name: "Сменное задание", rows: [header, ...scheduleRows, ...factRows] },
  ]);
  return { buffer, filename: exportFilename("shift-assignment", subdivisionId) };
}

async function exportMaterialRequirements(subdivisionId: number) {
  const orders = await listProductionOrders({ subdivisionId });
  const active = orders.filter((o) => !["completed", "cancelled"].includes(o.status));

  const header = [
    "№ заказа",
    "Изделие",
    "Остаток заказа",
    "Материал",
    "SAP материала",
    "Нужно",
    "Доступно",
    "Ед.",
    "Достаточно",
  ];

  const rows: unknown[][] = [];

  for (const order of active) {
    const remaining =
      (order.plannedQuantity > 0 ? order.plannedQuantity : order.requestedQuantity) -
      order.completedQuantity;
    if (remaining <= 0) continue;

    const reqs = await calculateMaterialRequirements(
      order.productId,
      subdivisionId,
      remaining
    );
    const product = (await listProducts({ subdivisionId })).find((p) => p.id === order.productId);

    for (const req of reqs) {
      rows.push([
        order.orderNumber,
        product?.name ?? order.productId,
        remaining,
        req.materialName,
        req.sapCode,
        req.required,
        req.available,
        req.unit,
        req.sufficient ? "Да" : "Нет",
      ]);
    }
  }

  const buffer = buildXlsxBuffer([
    { name: "Потребность в сырье", rows: [header, ...rows] },
  ]);
  return { buffer, filename: exportFilename("material-requirements", subdivisionId) };
}

async function exportPlanFact(subdivisionId: number, from?: Date, to?: Date) {
  const analytics = await getProductionAnalytics({ subdivisionId, from, to });

  const header = ["№ заказа", "План", "Факт", "Брак", "Δ"];
  const rows = analytics.planFact.map((r) => [
    r.orderNumber,
    r.planned,
    r.fact,
    r.defective,
    r.variance,
  ]);

  const summaryHeader = ["Показатель", "Значение"];
  const summaryRows = [
    ["Заказов всего", analytics.summary.ordersTotal],
    ["В работе", analytics.summary.ordersInProgress],
    ["Выпущено", analytics.summary.totalProduced],
    ["Брак", analytics.summary.totalDefective],
  ];

  const buffer = buildXlsxBuffer([
    { name: "План-факт", rows: [header, ...rows] },
    { name: "Сводка", rows: [summaryHeader, ...summaryRows] },
  ]);
  return { buffer, filename: exportFilename("plan-fact", subdivisionId) };
}

async function exportConflicts(subdivisionId: number) {
  const conflicts = await listPlanConflicts(subdivisionId, false);

  const header = [
    "ID",
    "Тип",
    "Важность",
    "Сообщение",
    "Заказ",
    "График",
    "Оборудование",
    "Решён",
    "Создан",
  ];

  const rows = conflicts.map((c) => [
    c.id,
    c.conflictType,
    c.severity,
    c.message,
    c.orderId ?? "",
    c.scheduleId ?? "",
    c.equipmentId ?? "",
    c.isResolved ? "Да" : "Нет",
    c.createdAt.toISOString(),
  ]);

  const buffer = buildXlsxBuffer([
    { name: "Конфликты", rows: [header, ...rows] },
  ]);
  return { buffer, filename: exportFilename("conflicts", subdivisionId) };
}
