import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "./db";
import {
  checklistTemplates,
  requestChecklistItems,
  type RequestChecklistItem,
  type Equipment,
} from "../shared/schema";
import { isToRequestType } from "../shared/service-request-constants";

export type TemplateRow = {
  category: string;
  itemText: string;
  measurementUnit?: string | null;
  measurementNorm?: string | null;
  sortOrder: number;
};

/** Базовые шаблоны, если в БД нет записей */
const BUILTIN_TEMPLATES: Record<string, TemplateRow[]> = {
  to_1m: [
    { category: "Безопасность", itemText: "Проверка блокировок и защитных кожухов", sortOrder: 1 },
    { category: "Чистота", itemText: "Очистка рабочей зоны и фильтров", sortOrder: 2 },
    { category: "Смазка", itemText: "Проверка уровня смазки", sortOrder: 3 },
    { category: "Функциональность", itemText: "Пробный пуск, проверка шумов и вибрации", sortOrder: 4 },
  ],
  to_3m: [
    { category: "Безопасность", itemText: "Проверка блокировок", sortOrder: 1 },
    { category: "Механика", itemText: "Проверка креплений и направляющих", sortOrder: 2 },
    { category: "Смазка", itemText: "Долив/замена смазки по регламенту", sortOrder: 3 },
    { category: "Электрика", itemText: "Проверка кабельных соединений", sortOrder: 4 },
  ],
  to_6m: [
    { category: "Механика", itemText: "Проверка люфтов и прижимов", sortOrder: 1 },
    { category: "Геометрия", itemText: "Контроль геометрии шпинделя/стола", measurementUnit: "мм", measurementNorm: "≤0.02", sortOrder: 2 },
    { category: "Гидравлика", itemText: "Проверка давления и утечек", sortOrder: 3 },
    { category: "Функциональность", itemText: "Контроль точности по эталону", sortOrder: 4 },
  ],
  to_12m: [
    { category: "Механика", itemText: "Полная проверка механических узлов", sortOrder: 1 },
    { category: "Геометрия", itemText: "Поверка геометрической точности", measurementUnit: "мм", measurementNorm: "по паспорту", sortOrder: 2 },
    { category: "Электрика", itemText: "Диагностика электрошкафа", sortOrder: 3 },
    { category: "Документация", itemText: "Обновление журнала ТО", sortOrder: 4 },
  ],
  service: [
    { category: "Общее", itemText: "Внешний осмотр", sortOrder: 1 },
    { category: "Функциональность", itemText: "Проверка работоспособности", sortOrder: 2 },
  ],
};

export async function getChecklistItems(requestId: number): Promise<RequestChecklistItem[]> {
  return db
    .select()
    .from(requestChecklistItems)
    .where(eq(requestChecklistItems.requestId, requestId))
    .orderBy(asc(requestChecklistItems.sortOrder), asc(requestChecklistItems.id));
}

async function loadTemplatesFromDb(
  requestType: string,
  equipment?: Equipment
): Promise<TemplateRow[]> {
  if (equipment?.model) {
    const byModel = await db
      .select()
      .from(checklistTemplates)
      .where(
        and(
          eq(checklistTemplates.requestType, requestType),
          eq(checklistTemplates.equipmentModel, equipment.model)
        )
      )
      .orderBy(asc(checklistTemplates.sortOrder));
    if (byModel.length) return byModel;
  }

  if (equipment?.type) {
    const byType = await db
      .select()
      .from(checklistTemplates)
      .where(
        and(
          eq(checklistTemplates.requestType, requestType),
          eq(checklistTemplates.equipmentType, equipment.type),
          isNull(checklistTemplates.equipmentModel)
        )
      )
      .orderBy(asc(checklistTemplates.sortOrder));
    if (byType.length) return byType;
  }

  const generic = await db
    .select()
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.requestType, requestType),
        isNull(checklistTemplates.equipmentType),
        isNull(checklistTemplates.equipmentModel)
      )
    )
    .orderBy(asc(checklistTemplates.sortOrder));

  if (generic.length) return generic;

  return BUILTIN_TEMPLATES[requestType] ?? BUILTIN_TEMPLATES.service;
}

export async function ensureChecklistForRequest(
  requestId: number,
  requestType: string,
  equipment?: Equipment
): Promise<RequestChecklistItem[]> {
  if (!isToRequestType(requestType)) return [];

  const existing = await getChecklistItems(requestId);
  if (existing.length > 0) return existing;

  const template = await loadTemplatesFromDb(requestType, equipment);
  if (template.length === 0) return [];

  const rows = await db
    .insert(requestChecklistItems)
    .values(
      template.map((t) => ({
        requestId,
        category: t.category,
        itemText: t.itemText,
        measurementUnit: t.measurementUnit ?? null,
        measurementNorm: t.measurementNorm ?? null,
        sortOrder: t.sortOrder,
      }))
    )
    .returning();

  return rows;
}

export async function updateChecklistItem(
  itemId: number,
  requestId: number,
  data: { isCompleted?: boolean; comment?: string; measurementValue?: number }
): Promise<RequestChecklistItem | undefined> {
  const [row] = await db
    .update(requestChecklistItems)
    .set(data)
    .where(and(eq(requestChecklistItems.id, itemId), eq(requestChecklistItems.requestId, requestId)))
    .returning();
  return row;
}

export async function validateChecklistComplete(requestId: number): Promise<string | null> {
  const items = await getChecklistItems(requestId);
  if (items.length === 0) return null;

  const incomplete = items.filter((i) => !i.isCompleted);
  if (incomplete.length > 0) {
    return `Не выполнено пунктов чек-листа: ${incomplete.length}`;
  }

  for (const item of items) {
    if (item.measurementNorm && item.measurementValue == null) {
      return `Укажите замер для: ${item.itemText}`;
    }
  }

  return null;
}

export async function seedDefaultTemplates() {
  const existing = await db.select().from(checklistTemplates).limit(1);
  if (existing.length > 0) return;

  const rows: (typeof checklistTemplates.$inferInsert)[] = [];
  for (const [requestType, items] of Object.entries(BUILTIN_TEMPLATES)) {
    for (const item of items) {
      rows.push({
        requestType,
        equipmentType: null,
        equipmentModel: null,
        category: item.category,
        itemText: item.itemText,
        measurementUnit: item.measurementUnit ?? null,
        measurementNorm: item.measurementNorm ?? null,
        sortOrder: item.sortOrder,
      });
    }
  }
  if (rows.length) await db.insert(checklistTemplates).values(rows);
}

export async function listAllTemplates() {
  return db
    .select()
    .from(checklistTemplates)
    .orderBy(
      asc(checklistTemplates.requestType),
      asc(checklistTemplates.equipmentType),
      asc(checklistTemplates.sortOrder)
    );
}

export async function createChecklistTemplate(
  data: typeof checklistTemplates.$inferInsert
) {
  const [row] = await db.insert(checklistTemplates).values(data).returning();
  return row;
}

export async function deleteChecklistTemplate(id: number) {
  const result = await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id)).returning();
  return result.length > 0;
}
