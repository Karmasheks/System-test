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

/** Поля справочника изделий — для литья, сборки, электроники и т.д. */
export const productCatalogDisplaySchema = z.object({
  showPfTooling: z.boolean().default(true),
  showProductWeight: z.boolean().default(true),
  showSprueWeight: z.boolean().default(true),
  showShiftNorm: z.boolean().default(true),
  showCycleTime: z.boolean().default(true),
  showCavities: z.boolean().default(true),
});

export type ProductCatalogDisplayConfig = z.infer<typeof productCatalogDisplaySchema>;

export const PRODUCT_CATALOG_PRESETS = {
  injection: {
    label: "Литьё под давлением",
    description: "ПФ, веса, цикл, гнёзда, нормы",
    config: {
      showPfTooling: true,
      showProductWeight: true,
      showSprueWeight: true,
      showShiftNorm: true,
      showCycleTime: true,
      showCavities: true,
    },
  },
  assembly: {
    label: "Сборка / электроника",
    description: "SAP и название, нормы смены без литья",
    config: {
      showPfTooling: false,
      showProductWeight: false,
      showSprueWeight: false,
      showShiftNorm: true,
      showCycleTime: false,
      showCavities: false,
    },
  },
} as const;

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
  }),
  planningTabs: planningTabsDisplaySchema.default({
    schedule: true,
    orders: true,
    facts: true,
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
