export const TASK_SOURCE_TYPES = [
  "manual",
  "remark",
  "inspection",
  "maintenance",
  "service_request",
  "subtask",
] as const;

export type TaskSourceType = (typeof TASK_SOURCE_TYPES)[number];

export const TASK_SOURCE_LABELS: Record<TaskSourceType, string> = {
  manual: "Вручную",
  remark: "Замечание",
  inspection: "Ежедневный осмотр",
  maintenance: "Техобслуживание",
  service_request: "Сервисная заявка",
  subtask: "Подзадача",
};

export const WAREHOUSE_RESOLUTION_TYPES = [
  "restocked",
  "written_off",
  "transferred",
  "false_alarm",
  "other",
] as const;

export type WarehouseResolutionType = (typeof WAREHOUSE_RESOLUTION_TYPES)[number];

export const WAREHOUSE_RESOLUTION_LABELS: Record<WarehouseResolutionType, string> = {
  restocked: "Пополнен остаток",
  written_off: "Списание",
  transferred: "Перемещение",
  false_alarm: "Ложное срабатывание",
  other: "Другое",
};
