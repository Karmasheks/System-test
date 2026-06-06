export const BUDGET_CATEGORIES = [
  { code: "parts", label: "Запчасти" },
  { code: "consumables", label: "Расходники" },
  { code: "tools", label: "Инструмент" },
  { code: "other", label: "Прочее" },
] as const;

export type BudgetCategoryCode = (typeof BUDGET_CATEGORIES)[number]["code"];

export const DEFAULT_DOCUMENT_CATEGORIES = [
  { code: "instruction", label: "Инструкция" },
  { code: "documentation", label: "Документация" },
  { code: "invoice", label: "Счёт" },
] as const;

export function budgetCategoryLabel(code: string): string {
  return BUDGET_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

export function documentCategoryLabel(code: string, custom?: { name: string }[]): string {
  const builtIn = DEFAULT_DOCUMENT_CATEGORIES.find((c) => c.code === code);
  if (builtIn) return builtIn.label;
  return custom?.find((c) => c.name === code)?.name ?? code;
}
