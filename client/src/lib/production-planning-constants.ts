export const PRODUCTION_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  ready: "Готов",
  planned: "В плане",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const PRODUCTION_ORDER_PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
};

export const SCHEDULE_CONFLICT_LABELS: Record<string, string> = {
  none: "Без конфликтов",
  warning: "Риск",
  blocked: "Конфликт",
};

export const CONFLICT_SEVERITY_LABELS: Record<string, string> = {
  info: "Инфо",
  warning: "Внимание",
  critical: "Критично",
  blocking: "Блокировка",
};

export const MATERIAL_TYPE_LABELS: Record<string, string> = {
  base: "Сырьё 1",
  secondary: "Сырьё 2",
  additive: "Добавка",
  colorant: "Краситель",
  packaging: "Упаковка",
  tooling: "Оснастка",
  other: "Прочее",
};

export const TOOLING_TYPE_LABELS: Record<string, string> = {
  press_form: "Пресс-форма (ПФ)",
  applicator: "Аппликатор",
  tampon_print: "Тампопечать",
  fixture: "Оснастка",
  other: "Прочее",
};

export const TOOLING_STATUS_LABELS: Record<string, string> = {
  ok: "Исправная",
  repair: "Ремонт",
  testing: "Испытания",
  decommissioned: "Списана",
};
