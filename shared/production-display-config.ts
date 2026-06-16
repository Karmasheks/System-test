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
