export const WAREHOUSE_MOVEMENT_TYPES = [
  { code: "in", label: "Приход" },
  { code: "out", label: "Списание" },
] as const;

export type WarehouseMovementType = (typeof WAREHOUSE_MOVEMENT_TYPES)[number]["code"];

export const WAREHOUSE_ALERT_TYPES = [
  { code: "min_stock", label: "Ниже минимума" },
  { code: "zero_stock", label: "Нет на складе" },
] as const;

export const DEFAULT_WAREHOUSE_CATEGORIES = [
  "Запчасти",
  "Электрика",
  "Механика",
  "Гидравлика",
  "Расходники",
  "Инструмент",
  "Прочее",
] as const;

/** Категория склада по категории затрат (бюджет) */
export const BUDGET_TO_WAREHOUSE_CATEGORY: Record<string, string> = {
  parts: "Запчасти",
  consumables: "Расходники",
  tools: "Инструмент",
  other: "Прочее",
};

export function warehouseCategoryForBudget(budgetCategory: string): string {
  return BUDGET_TO_WAREHOUSE_CATEGORY[budgetCategory] ?? "Прочее";
}

export function warehouseAlertLabel(code: string): string {
  return WAREHOUSE_ALERT_TYPES.find((t) => t.code === code)?.label ?? code;
}
