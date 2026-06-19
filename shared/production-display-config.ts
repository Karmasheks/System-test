import { z } from "zod";

export const PRODUCTION_SCHEDULE_STATUS_CODES = [
  "planned",
  "in_progress",
  "completed",
  "paused",
  "cancelled",
] as const;

export const productionScheduleStatusSchema = z.enum(PRODUCTION_SCHEDULE_STATUS_CODES);

const calendarDisplaySchema = z.object({
  showProduction: z.boolean().default(true),
  slotStatuses: z
    .array(productionScheduleStatusSchema)
    .default(["planned", "in_progress", "paused"]),
  maxEventsPerDay: z.number().int().min(1).max(30).default(8),
});

const timelineDisplaySchema = z.object({
  slotStatuses: z
    .array(productionScheduleStatusSchema)
    .default(["planned", "in_progress", "paused"]),
  showMaintenanceOverlay: z.boolean().default(true),
  showRepairOverlay: z.boolean().default(true),
  showUnavailableOverlay: z.boolean().default(true),
  maintenanceDefaultHours: z.number().min(0.5).max(24).default(4),
  repairDefaultHours: z.number().min(0.5).max(24).default(4),
});

const equipmentCardDisplaySchema = z.object({
  horizonDays: z.number().int().min(7).max(180).default(45),
  maxSlots: z.number().int().min(1).max(50).default(8),
});

/** Встроенные переключатели полей справочника изделий. */
export const productCatalogBuiltinSchema = z.object({
  showPfTooling: z.boolean().default(true),
  showProductWeight: z.boolean().default(true),
  showSprueWeight: z.boolean().default(true),
  showShiftNorm: z.boolean().default(true),
  showCycleTime: z.boolean().default(true),
  showCavities: z.boolean().default(true),
});

export type ProductCatalogBuiltinConfig = z.infer<typeof productCatalogBuiltinSchema>;

export const PRODUCT_CATALOG_FIELD_TYPES = ["text", "number", "textarea"] as const;
export type ProductCatalogFieldType = (typeof PRODUCT_CATALOG_FIELD_TYPES)[number];

export const productCatalogCustomFieldSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  fieldType: z.enum(PRODUCT_CATALOG_FIELD_TYPES).default("text"),
  unit: z.string().max(24).optional(),
  required: z.boolean().default(false),
  showInTable: z.boolean().default(true),
  showInForm: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export type ProductCatalogCustomField = z.infer<typeof productCatalogCustomFieldSchema>;

export const productCatalogFieldPresetSchema = productCatalogBuiltinSchema.extend({
  customFields: z.array(productCatalogCustomFieldSchema).max(30).default([]),
});

export type ProductCatalogFieldPreset = z.infer<typeof productCatalogFieldPresetSchema>;

export const productCatalogSavedTemplateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  preset: productCatalogFieldPresetSchema,
  createdAt: z.string().optional(),
});

export type ProductCatalogSavedTemplate = z.infer<typeof productCatalogSavedTemplateSchema>;

/** Поля справочника изделий — для литья, сборки, электроники и т.д. */
export const productCatalogDisplaySchema = productCatalogBuiltinSchema.extend({
  customFields: z.array(productCatalogCustomFieldSchema).max(30).default([]),
  savedTemplates: z.array(productCatalogSavedTemplateSchema).max(20).default([]),
});

export type ProductCatalogDisplayConfig = z.infer<typeof productCatalogDisplaySchema>;

export const PRODUCT_CATALOG_BUILTIN_FIELDS: ReadonlyArray<{
  key: keyof ProductCatalogBuiltinConfig;
  label: string;
}> = [
  { key: "showPfTooling", label: "ПФ / оснастка" },
  { key: "showProductWeight", label: "Вес изделия" },
  { key: "showSprueWeight", label: "Вес литника" },
  { key: "showShiftNorm", label: "Норма смены" },
  { key: "showCycleTime", label: "Цикл литья" },
  { key: "showCavities", label: "Гнёзда" },
];

export const PRODUCT_CATALOG_FIELD_TYPE_LABELS: Record<ProductCatalogFieldType, string> = {
  text: "Текст",
  number: "Число",
  textarea: "Многострочный текст",
};

export function createProductCatalogCustomField(
  label = "Новое поле"
): ProductCatalogCustomField {
  return productCatalogCustomFieldSchema.parse({
    id: `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    fieldType: "text",
    required: false,
    enabled: true,
    showInTable: true,
    showInForm: true,
  });
}

export function extractCatalogPreset(
  catalog: ProductCatalogDisplayConfig
): ProductCatalogFieldPreset {
  return productCatalogFieldPresetSchema.parse({
    showPfTooling: catalog.showPfTooling,
    showProductWeight: catalog.showProductWeight,
    showSprueWeight: catalog.showSprueWeight,
    showShiftNorm: catalog.showShiftNorm,
    showCycleTime: catalog.showCycleTime,
    showCavities: catalog.showCavities,
    customFields: catalog.customFields ?? [],
  });
}

export function applyCatalogPreset(
  catalog: ProductCatalogDisplayConfig,
  preset: ProductCatalogFieldPreset
): ProductCatalogDisplayConfig {
  return productCatalogDisplaySchema.parse({
    ...catalog,
    ...preset,
    customFields: (preset.customFields ?? []).map((f) => ({ ...f })),
  });
}

export function getEnabledCustomFields(
  catalog: ProductCatalogDisplayConfig
): ProductCatalogCustomField[] {
  return (catalog.customFields ?? []).filter((f) => f.enabled);
}

export function getTableCustomFields(
  catalog: ProductCatalogDisplayConfig
): ProductCatalogCustomField[] {
  return getEnabledCustomFields(catalog).filter((f) => f.showInTable);
}

export function getFormCustomFields(
  catalog: ProductCatalogDisplayConfig
): ProductCatalogCustomField[] {
  return getEnabledCustomFields(catalog).filter((f) => f.showInForm);
}

export const PRODUCT_CATALOG_PRESETS = {
  injection: {
    label: "Литьё под давлением",
    description: "ПФ, веса, цикл, гнёзда, нормы",
    preset: {
      showPfTooling: true,
      showProductWeight: true,
      showSprueWeight: true,
      showShiftNorm: true,
      showCycleTime: true,
      showCavities: true,
      customFields: [],
    },
  },
  assembly: {
    label: "Сборка / электроника",
    description: "SAP и название, нормы смены без литья",
    preset: {
      showPfTooling: false,
      showProductWeight: false,
      showSprueWeight: false,
      showShiftNorm: true,
      showCycleTime: false,
      showCavities: false,
      customFields: [],
    },
  },
} as const satisfies Record<
  string,
  { label: string; description: string; preset: ProductCatalogFieldPreset }
>;

/** Видимость вкладок планирования по подразделению. */
export const planningTabsDisplaySchema = z.object({
  schedule: z.boolean().default(true),
  orders: z.boolean().default(true),
  facts: z.boolean().default(true),
  warehouse: z.boolean().default(true),
  tooling: z.boolean().default(true),
  products: z.boolean().default(true),
  materials: z.boolean().default(true),
  conflicts: z.boolean().default(true),
  analytics: z.boolean().default(true),
  oee: z.boolean().default(true),
});

export type PlanningTabsDisplayConfig = z.infer<typeof planningTabsDisplaySchema>;

export const productionDisplayConfigSchema = z.object({
  calendar: calendarDisplaySchema.default({
    showProduction: true,
    slotStatuses: ["planned", "in_progress", "paused"],
    maxEventsPerDay: 8,
  }),
  timeline: timelineDisplaySchema.default({
    slotStatuses: ["planned", "in_progress", "paused"],
    showMaintenanceOverlay: true,
    showRepairOverlay: true,
    showUnavailableOverlay: true,
    maintenanceDefaultHours: 4,
    repairDefaultHours: 4,
  }),
  equipmentCard: equipmentCardDisplaySchema.default({
    horizonDays: 45,
    maxSlots: 8,
  }),
  productCatalog: productCatalogDisplaySchema.default({
    showPfTooling: true,
    showProductWeight: true,
    showSprueWeight: true,
    showShiftNorm: true,
    showCycleTime: true,
    showCavities: true,
    customFields: [],
    savedTemplates: [],
  }),
  planningTabs: planningTabsDisplaySchema.default({
    schedule: true,
    orders: false,
    facts: false,
    warehouse: true,
    tooling: true,
    products: true,
    materials: true,
    conflicts: true,
    analytics: true,
    oee: true,
  }),
});

export type ProductionDisplayConfig = z.infer<typeof productionDisplayConfigSchema>;

export const DEFAULT_PRODUCTION_DISPLAY_CONFIG: ProductionDisplayConfig =
  productionDisplayConfigSchema.parse({});

export function mergeProductionDisplayConfig(
  base?: Partial<ProductionDisplayConfig> | null,
  overrides?: Partial<ProductionDisplayConfig> | null
): ProductionDisplayConfig {
  const merged = {
    calendar: {
      ...DEFAULT_PRODUCTION_DISPLAY_CONFIG.calendar,
      ...base?.calendar,
      ...overrides?.calendar,
    },
    timeline: {
      ...DEFAULT_PRODUCTION_DISPLAY_CONFIG.timeline,
      ...base?.timeline,
      ...overrides?.timeline,
    },
    equipmentCard: {
      ...DEFAULT_PRODUCTION_DISPLAY_CONFIG.equipmentCard,
      ...base?.equipmentCard,
      ...overrides?.equipmentCard,
    },
    productCatalog: {
      ...DEFAULT_PRODUCTION_DISPLAY_CONFIG.productCatalog,
      ...base?.productCatalog,
      ...overrides?.productCatalog,
    },
    planningTabs: {
      ...DEFAULT_PRODUCTION_DISPLAY_CONFIG.planningTabs,
      ...base?.planningTabs,
      ...overrides?.planningTabs,
      /** Заказы и факт — только внутри «График и заказы», отдельных вкладок нет. */
      orders: false,
      facts: false,
    },
  };
  return productionDisplayConfigSchema.parse(merged);
}

export function calendarProductionStatuses(config: ProductionDisplayConfig): string[] {
  if (!config.calendar.showProduction) return [];
  return config.calendar.slotStatuses;
}

export const PRODUCTION_SCHEDULE_STATUS_LABELS: Record<string, string> = {
  planned: "Запланировано",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Завершено",
  cancelled: "Отменено",
};
