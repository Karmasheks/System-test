import { db } from "./db";
import { shiftScheduleTemplates, productionPlanningSettings } from "@shared/schema";
import { eq, isNull, or } from "drizzle-orm";
import type { InsertShiftScheduleTemplate } from "@shared/schema";
import {
  DEFAULT_SHIFT_TEMPLATE_PATTERN,
  parseShiftTemplatePattern,
  type ShiftTemplatePattern,
} from "@shared/shift-template-types";

export async function listShiftTemplates(subdivisionId: number) {
  return db
    .select()
    .from(shiftScheduleTemplates)
    .where(
      or(
        eq(shiftScheduleTemplates.subdivisionId, subdivisionId),
        isNull(shiftScheduleTemplates.subdivisionId)
      )
    )
    .orderBy(shiftScheduleTemplates.name);
}

export async function getShiftTemplate(id: number) {
  const [row] = await db
    .select()
    .from(shiftScheduleTemplates)
    .where(eq(shiftScheduleTemplates.id, id));
  return row ?? null;
}

export async function createShiftTemplate(data: InsertShiftScheduleTemplate) {
  const pattern = parseShiftTemplatePattern(data.pattern);
  const [row] = await db
    .insert(shiftScheduleTemplates)
    .values({
      ...data,
      pattern,
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

export async function updateShiftTemplate(
  id: number,
  data: Partial<InsertShiftScheduleTemplate>
) {
  const patch: Partial<InsertShiftScheduleTemplate> & { updatedAt: Date } = {
    ...data,
    updatedAt: new Date(),
  };
  if (data.pattern !== undefined) {
    patch.pattern = parseShiftTemplatePattern(data.pattern);
  }
  const [row] = await db
    .update(shiftScheduleTemplates)
    .set(patch)
    .where(eq(shiftScheduleTemplates.id, id))
    .returning();
  return row ?? null;
}

export async function ensureDefaultShiftTemplate(subdivisionId: number) {
  const existing = await listShiftTemplates(subdivisionId);
  if (existing.length > 0) return existing[0];

  return createShiftTemplate({
    subdivisionId,
    name: "Стандарт (2 смены по 11 ч)",
    description: "Смена 1 и смена 2 по 11 часов",
    pattern: DEFAULT_SHIFT_TEMPLATE_PATTERN,
    isActive: true,
  });
}

export async function getActiveShiftPattern(subdivisionId: number): Promise<ShiftTemplatePattern> {
  const [settings] = await db
    .select()
    .from(productionPlanningSettings)
    .where(eq(productionPlanningSettings.subdivisionId, subdivisionId));

  if (settings?.defaultShiftTemplateId) {
    const tpl = await getShiftTemplate(settings.defaultShiftTemplateId);
    if (tpl) return parseShiftTemplatePattern(tpl.pattern);
  }

  const templates = await listShiftTemplates(subdivisionId);
  const active = templates.find((t) => t.isActive) ?? templates[0];
  if (active) return parseShiftTemplatePattern(active.pattern);

  const created = await ensureDefaultShiftTemplate(subdivisionId);
  return parseShiftTemplatePattern(created.pattern);
}

export async function setDefaultShiftTemplate(subdivisionId: number, templateId: number | null) {
  const [existing] = await db
    .select()
    .from(productionPlanningSettings)
    .where(eq(productionPlanningSettings.subdivisionId, subdivisionId));

  if (existing) {
    await db
      .update(productionPlanningSettings)
      .set({ defaultShiftTemplateId: templateId, updatedAt: new Date() })
      .where(eq(productionPlanningSettings.subdivisionId, subdivisionId));
  } else {
    await db.insert(productionPlanningSettings).values({
      subdivisionId,
      defaultShiftTemplateId: templateId,
      updatedAt: new Date(),
    });
  }
}
