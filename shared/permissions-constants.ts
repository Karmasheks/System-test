export type AccessLevel = "none" | "view" | "edit";

export type AppModule =
  | "dashboard"
  | "schedule"
  | "equipment"
  | "daily_inspection"
  | "maintenance"
  | "tasks"
  | "service_requests"
  | "contacts"
  | "suppliers"
  | "warehouse"
  | "budget"
  | "documents"
  | "users"
  | "reports";

export type SensitiveField =
  | "budget_amounts"
  | "warehouse_costs"
  | "warehouse_sap"
  | "contact_phones"
  | "contact_emails"
  | "supplier_details"
  | "user_emails"
  | "reports_financial"
  | "employee_status_list";

/** Блоки на панели управления — отмеченные в профиле роли скрываются */
export type DashboardBlock =
  | "dash_calendar_stats"
  | "dash_budget_total"
  | "dash_warehouse_alerts"
  | "dash_main_metrics"
  | "dash_inspection_progress"
  | "dash_tasks_stats"
  | "dash_upcoming_tasks"
  | "dash_maintenance_types"
  | "dash_equipment_types"
  | "dash_recent_activities"
  | "dash_attention";

export const SYSTEM_ROLES = ["admin", "operator", "engineer", "technician", "viewer"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
/** @deprecated используйте string — роли могут быть пользовательскими */
export const APP_ROLES = SYSTEM_ROLES;
export type AppRole = SystemRole;

export interface DashboardBlockDefinition {
  key: DashboardBlock;
  label: string;
  description: string;
}

export interface TaskCapabilities {
  create: boolean;
  viewCreated: boolean;
  process: boolean;
  convertToServiceRequest: boolean;
}

export interface RoleAccessProfile {
  role: string;
  label: string;
  isSystem: boolean;
  modules: Record<AppModule, AccessLevel>;
  hiddenFields: SensitiveField[];
  hiddenDashboardBlocks: DashboardBlock[];
  taskCapabilities: TaskCapabilities;
}

export interface TaskCapabilityDefinition {
  key: keyof TaskCapabilities;
  label: string;
  description: string;
}

export const TASK_CAPABILITY_DEFINITIONS: TaskCapabilityDefinition[] = [
  {
    key: "create",
    label: "Создание задач",
    description: "Создание новых задач (исполнитель и сроки назначает администратор)",
  },
  {
    key: "viewCreated",
    label: "Просмотр созданных задач",
    description: "Вкладка «Созданные мной» — только задачи, созданные пользователем",
  },
  {
    key: "process",
    label: "Обработка задач",
    description: "Назначение исполнителя, смена статуса и полное редактирование",
  },
  {
    key: "convertToServiceRequest",
    label: "Перевод в сервисную заявку",
    description: "Создание сервисной заявки из задачи",
  },
];

export function deriveTaskCapabilities(modules: Record<AppModule, AccessLevel>): TaskCapabilities {
  const canEditTasks = modules.tasks === "edit";
  return {
    create: canEditTasks,
    viewCreated: canEditTasks,
    process: canEditTasks,
    convertToServiceRequest: canEditTasks && modules.service_requests !== "none",
  };
}

/** Совместимость со старыми профилями без create / viewCreated */
export function normalizeTaskCapabilities(
  stored: Partial<TaskCapabilities> | null | undefined,
  modules?: Record<AppModule, AccessLevel>
): TaskCapabilities {
  const derived = modules ? deriveTaskCapabilities(modules) : {
    create: false,
    viewCreated: false,
    process: false,
    convertToServiceRequest: false,
  };
  if (!stored) return derived;
  const process = stored.process ?? derived.process;
  return {
    create: stored.create ?? process ?? derived.create,
    viewCreated: stored.viewCreated ?? process ?? derived.viewCreated,
    process,
    convertToServiceRequest:
      stored.convertToServiceRequest ?? derived.convertToServiceRequest,
  };
}

export function canCreateTasks(cap: TaskCapabilities): boolean {
  return cap.create || cap.process;
}

export function canViewCreatedTasks(cap: TaskCapabilities): boolean {
  return cap.viewCreated || cap.process;
}

export function canProcessTasksCap(cap: TaskCapabilities): boolean {
  return cap.process;
}

export interface UserPermissionOverrides {
  modules?: Partial<Record<AppModule, AccessLevel>>;
  hiddenFields?: SensitiveField[];
  hiddenDashboardBlocks?: DashboardBlock[];
  taskCapabilities?: {
    create?: boolean;
    viewCreated?: boolean;
    process?: boolean;
    convertToServiceRequest?: boolean;
  };
  /** Видит оборудование, склад, задачи и заявки всех подразделений */
  viewAllSubdivisions?: boolean;
}

export interface EffectivePermissions {
  role: string;
  useCustomPermissions: boolean;
  modules: Record<AppModule, AccessLevel>;
  hiddenFields: SensitiveField[];
  hiddenDashboardBlocks: DashboardBlock[];
  taskCapabilities: TaskCapabilities;
  subdivisionScope: import("./subdivision-scope").SubdivisionScope;
  primarySubdivisionId: number | null;
  extraSubdivisionIds: number[];
  managedSubdivisionIds: number[];
  isSubdivisionAdmin: boolean;
  isSystemAdmin: boolean;
}

export interface ModuleDefinition {
  key: AppModule;
  label: string;
  section: "main" | "admin";
}

export interface SensitiveFieldDefinition {
  key: SensitiveField;
  label: string;
  description: string;
}

export const DASHBOARD_BLOCK_DEFINITIONS: DashboardBlockDefinition[] = [
  { key: "dash_calendar_stats", label: "Календарь (запланировано / выполнено / ожидают)", description: "Три карточки календаря вверху панели" },
  { key: "dash_budget_total", label: "Бюджет (итого)", description: "Карточка «Бюджет (всего)» на панели" },
  { key: "dash_warehouse_alerts", label: "Склад: требует внимания", description: "Блок оповещений о нехватке запчастей на складе" },
  { key: "dash_main_metrics", label: "Основные метрики", description: "Оборудование, ТО за месяц, осмотры, пользователи" },
  { key: "dash_inspection_progress", label: "Прогресс ежедневных осмотров", description: "Большая карточка с прогрессом осмотров" },
  { key: "dash_tasks_stats", label: "Статистика задач", description: "Карточка со статистикой задач" },
  { key: "dash_upcoming_tasks", label: "Ближайшие задачи", description: "Список задач на ближайшие 3 дня" },
  { key: "dash_maintenance_types", label: "ТО по типам", description: "Статистика ТО по типам за месяц" },
  { key: "dash_equipment_types", label: "Оборудование по типам", description: "Распределение оборудования по категориям" },
  { key: "dash_recent_activities", label: "Последние события", description: "Лента недавних действий в системе" },
  { key: "dash_attention", label: "Требует внимания", description: "Неработающее оборудование, замечания, проблемы осмотра" },
];

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: "dashboard", label: "Панель управления", section: "main" },
  { key: "schedule", label: "План ТО и задач", section: "main" },
  { key: "equipment", label: "Оборудование", section: "main" },
  { key: "daily_inspection", label: "Ежедневные осмотры", section: "main" },
  { key: "tasks", label: "Задачи", section: "main" },
  { key: "service_requests", label: "Сервисные заявки", section: "main" },
  { key: "contacts", label: "Контакты", section: "main" },
  { key: "suppliers", label: "Поставщики", section: "main" },
  { key: "warehouse", label: "Склад", section: "main" },
  { key: "budget", label: "Затраты (Бюджет)", section: "main" },
  { key: "documents", label: "Документы", section: "main" },
  { key: "users", label: "Пользователи", section: "admin" },
  { key: "reports", label: "Отчёты", section: "admin" },
];

export const SENSITIVE_FIELD_DEFINITIONS: SensitiveFieldDefinition[] = [
  { key: "budget_amounts", label: "Суммы бюджета", description: "Стоимость закупок и итоги затрат" },
  { key: "warehouse_costs", label: "Стоимость на складе", description: "Цены и суммы по запчастям" },
  { key: "warehouse_sap", label: "SAP / инв. номера", description: "Номера SAP и инвентарные номера" },
  { key: "contact_phones", label: "Телефоны контактов", description: "Телефоны в разделе контактов" },
  { key: "contact_emails", label: "Email контактов", description: "Адреса email контактов и поставщиков" },
  { key: "supplier_details", label: "Данные поставщиков", description: "Контактные лица и адреса поставщиков" },
  { key: "user_emails", label: "Email сотрудников", description: "Email других пользователей системы" },
  { key: "reports_financial", label: "Финансы в отчётах", description: "Финансовые показатели в отчётах" },
  { key: "employee_status_list", label: "Список сотрудников", description: "Блок «Сотрудники на работе» в меню" },
];

const allModulesEdit = (): Record<AppModule, AccessLevel> =>
  Object.fromEntries(MODULE_DEFINITIONS.map((m) => [m.key, "edit"])) as Record<AppModule, AccessLevel>;

const modules = (
  levels: Partial<Record<AppModule, AccessLevel>>
): Record<AppModule, AccessLevel> => {
  const base = Object.fromEntries(
    MODULE_DEFINITIONS.map((m) => [m.key, "none" as AccessLevel])
  ) as Record<AppModule, AccessLevel>;
  return { ...base, ...levels };
};

const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  admin: "Администратор системы",
  operator: "Оператор",
  engineer: "Инженер",
  technician: "Техник",
  viewer: "Наблюдатель (новый пользователь)",
};

type DefaultRoleProfileInput = Omit<RoleAccessProfile, "taskCapabilities">;

function withTaskCapabilities(profile: DefaultRoleProfileInput): RoleAccessProfile {
  return {
    ...profile,
    taskCapabilities: deriveTaskCapabilities(profile.modules),
  };
}

/** Профили по умолчанию — viewer максимально ограничен для новых пользователей */
const RAW_DEFAULT_ROLE_ACCESS_PROFILES: DefaultRoleProfileInput[] = [
  {
    role: "admin",
    label: SYSTEM_ROLE_LABELS.admin,
    isSystem: true,
    modules: allModulesEdit(),
    hiddenFields: [],
    hiddenDashboardBlocks: [],
  },
  {
    role: "operator",
    label: SYSTEM_ROLE_LABELS.operator,
    isSystem: true,
    modules: modules({
      dashboard: "view",
      schedule: "edit",
      equipment: "view",
      daily_inspection: "edit",
      maintenance: "edit",
      tasks: "edit",
      service_requests: "edit",
      contacts: "view",
      suppliers: "view",
      warehouse: "edit",
      budget: "view",
      documents: "view",
      reports: "view",
    }),
    hiddenFields: ["reports_financial"],
    hiddenDashboardBlocks: ["dash_warehouse_alerts", "dash_budget_total"],
  },
  {
    role: "engineer",
    label: SYSTEM_ROLE_LABELS.engineer,
    isSystem: true,
    modules: modules({
      dashboard: "view",
      schedule: "view",
      equipment: "view",
      daily_inspection: "edit",
      maintenance: "view",
      tasks: "edit",
      service_requests: "view",
      documents: "view",
    }),
    hiddenFields: ["budget_amounts", "warehouse_costs", "contact_phones", "contact_emails", "supplier_details", "reports_financial"],
    hiddenDashboardBlocks: ["dash_warehouse_alerts", "dash_budget_total"],
  },
  {
    role: "technician",
    label: SYSTEM_ROLE_LABELS.technician,
    isSystem: true,
    modules: modules({
      dashboard: "view",
      schedule: "view",
      equipment: "view",
      daily_inspection: "edit",
      maintenance: "view",
      tasks: "edit",
      service_requests: "view",
      warehouse: "view",
      documents: "view",
    }),
    hiddenFields: [
      "budget_amounts",
      "warehouse_costs",
      "warehouse_sap",
      "contact_phones",
      "contact_emails",
      "supplier_details",
      "user_emails",
      "reports_financial",
    ],
    hiddenDashboardBlocks: ["dash_budget_total", "dash_warehouse_alerts", "dash_maintenance_types"],
  },
  {
    role: "viewer",
    label: SYSTEM_ROLE_LABELS.viewer,
    isSystem: true,
    modules: modules({
      dashboard: "view",
      schedule: "view",
      equipment: "view",
      daily_inspection: "view",
      tasks: "view",
      documents: "view",
    }),
    hiddenFields: [
      "budget_amounts",
      "warehouse_costs",
      "warehouse_sap",
      "contact_phones",
      "contact_emails",
      "supplier_details",
      "user_emails",
      "reports_financial",
      "employee_status_list",
    ],
    hiddenDashboardBlocks: [
      "dash_budget_total",
      "dash_warehouse_alerts",
      "dash_maintenance_types",
      "dash_equipment_types",
    ],
  },
];

export const DEFAULT_ROLE_ACCESS_PROFILES: RoleAccessProfile[] =
  RAW_DEFAULT_ROLE_ACCESS_PROFILES.map(withTaskCapabilities);

export const MODULE_BY_PATH: Record<string, AppModule> = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/schedule": "schedule",
  "/equipment": "equipment",
  "/daily-inspection": "daily_inspection",
  "/daily-inspection-new": "daily_inspection",
  "/maintenance": "schedule",
  "/tasks": "tasks",
  "/service-requests": "service_requests",
  "/contacts": "contacts",
  "/suppliers": "suppliers",
  "/warehouse": "warehouse",
  "/budget": "budget",
  "/documents": "documents",
  "/users": "users",
  "/reports": "reports",
  "/profile": "dashboard",
};

export function accessLevelLabel(level: AccessLevel): string {
  switch (level) {
    case "edit":
      return "Редактирование";
    case "view":
      return "Просмотр";
    default:
      return "Скрыто";
  }
}

export function roleLabel(role: string, profileLabel?: string): string {
  if (profileLabel?.trim()) return profileLabel.trim();
  if (SYSTEM_ROLES.includes(role as SystemRole)) {
    return SYSTEM_ROLE_LABELS[role as SystemRole];
  }
  return role.replace(/_/g, " ");
}

/** Профиль роли для отображения в списках (не подменяет неизвестные роли на viewer). */
export function resolveRoleProfileLabel(
  role: string,
  profiles: Array<{ role: string; label: string }>
): string {
  const key = normalizeRole(role);
  const profile = profiles.find((p) => p.role === key);
  return roleLabel(key, profile?.label);
}

export function isSystemRole(role: string): boolean {
  return SYSTEM_ROLES.includes(role as SystemRole);
}

export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

export function isValidRoleKey(role: string): boolean {
  return ROLE_KEY_PATTERN.test(role) && role !== "admin";
}

export function canViewLevel(level: AccessLevel | undefined): boolean {
  return level === "view" || level === "edit";
}

export function canEditLevel(level: AccessLevel | undefined): boolean {
  return level === "edit";
}

export function normalizeRole(role: string | undefined | null): string {
  if (role && role.trim()) return role.trim();
  return "viewer";
}

export function isDashboardBlockVisible(
  hiddenBlocks: DashboardBlock[] | undefined,
  block: DashboardBlock
): boolean {
  return !(hiddenBlocks ?? []).includes(block);
}

/** Список статусов коллег в меню — доступен всем ролям, кроме «Новый пользователь» (viewer). */
export function canViewEmployeePresence(role: string | null | undefined): boolean {
  return normalizeRole(role) !== "viewer";
}
