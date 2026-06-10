/** Сервисные заявки — константы и workflow (MVP-1) */

export const SERVICE_REQUEST_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_parts",
  "done",
  "user_review",
  "closed",
  "returned",
  "cancelled",
  "duplicate",
  "not_needed",
] as const;

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_REQUEST_TYPES = [
  { code: "repair", label: "Ремонт", catalog: "Ремонт оборудования" },
  { code: "diagnostics", label: "Диагностика", catalog: "Диагностика оборудования" },
  { code: "service", label: "Сервисное обслуживание", catalog: "Сервисное обслуживание" },
  { code: "to_1m", label: "ТО 1 месяц", catalog: "Сервисное обслуживание" },
  { code: "to_3m", label: "ТО 3 месяца", catalog: "Сервисное обслуживание" },
  { code: "to_6m", label: "ТО 6 месяцев", catalog: "Сервисное обслуживание" },
  { code: "to_12m", label: "ТО 12 месяцев", catalog: "Сервисное обслуживание" },
  { code: "modernization", label: "Модернизация", catalog: "Модернизация оборудования" },
] as const;

export type ServiceRequestTypeCode = (typeof SERVICE_REQUEST_TYPES)[number]["code"];

export const URGENCY_LEVELS = [
  { level: 1, label: "Минимальная" },
  { level: 2, label: "Низкая" },
  { level: 3, label: "Средняя" },
  { level: 4, label: "Высокая" },
  { level: 5, label: "Критическая" },
] as const;

/** Матрица срочность → приоритет (настраиваемая в GLPI; здесь defaults) */
export const URGENCY_TO_PRIORITY: Record<number, string> = {
  1: "low",
  2: "low",
  3: "medium",
  4: "high",
  5: "critical",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
};

export const STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  new: "Новая",
  assigned: "Назначен",
  in_progress: "В работе",
  waiting_parts: "Ожидание запчастей",
  done: "Выполнено",
  user_review: "Подтверждение пользователя",
  closed: "Закрыто",
  returned: "Возврат в работу",
  cancelled: "Отменено",
  duplicate: "Дубликат",
  not_needed: "Отпала необходимость",
};

/** Заявка закрыта без выполнения работ — связанные задачи можно завершить или отменить */
export const SR_VOID_STATUSES = ["cancelled", "duplicate", "not_needed"] as const;

export type ServiceRequestVoidStatus = (typeof SR_VOID_STATUSES)[number];

export function isServiceRequestVoidStatus(status: string): boolean {
  return (SR_VOID_STATUSES as readonly string[]).includes(status);
}

export const MANAGER_ROLES = ["admin", "manager"] as const;
export const ADMIN_ROLES = ["admin"] as const;

/** Статусы, когда заявитель должен подтвердить выполнение работ */
export const AWAITING_USER_CONFIRM_STATUSES = ["done", "user_review"] as const;
export const ENGINEER_ROLES = ["admin", "manager", "engineer", "technician", "service_engineer"] as const;
export const REQUESTER_ROLES = [
  "admin",
  "manager",
  "operator",
  "engineer",
  "technician",
  "service_engineer",
  "requester",
] as const;

/** Допустимые переходы статусов */
export const STATUS_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  new: ["assigned", "cancelled", "duplicate", "not_needed"],
  assigned: ["in_progress", "cancelled", "assigned"],
  in_progress: ["waiting_parts", "done", "cancelled"],
  waiting_parts: ["in_progress"],
  done: ["user_review"],
  user_review: ["closed", "returned"],
  returned: ["in_progress", "assigned"],
  closed: [],
  cancelled: [],
  duplicate: [],
  not_needed: [],
};

export function priorityFromUrgency(urgency: number): string {
  return URGENCY_TO_PRIORITY[urgency] ?? "medium";
}

export function canTransition(from: ServiceRequestStatus, to: ServiceRequestStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Типы заявок с обязательным чек-листом ТО */
export const TO_REQUEST_TYPES = ["service", "to_1m", "to_3m", "to_6m", "to_12m"] as const;

export function isToRequestType(requestType: string): boolean {
  return (TO_REQUEST_TYPES as readonly string[]).includes(requestType);
}
