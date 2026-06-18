import { pgTable, text, serial, integer, boolean, timestamp, unique, date, real, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { TaskCapabilities, UserPermissionOverrides } from "./permissions-constants";
import type { VacationPeriod } from "./user-presence-constants";
import type { ProductionDisplayConfig } from "./production-display-config";

export const subdivisions = pgTable("subdivisions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("viewer"), // admin, operator, engineer, technician, viewer + custom
  department: text("department"),
  subdivisionId: integer("subdivision_id"),
  extraSubdivisionIds: jsonb("extra_subdivision_ids").$type<number[]>().default([]),
  /** Подразделения, которыми пользователь администрирует (назначает системный admin) */
  managedSubdivisionIds: jsonb("managed_subdivision_ids").$type<number[]>().default([]),
  viewAllSubdivisions: boolean("view_all_subdivisions").notNull().default(false),
  position: text("position"),
  phone: text("phone"),
  avatar: text("avatar"),
  presenceStatus: text("presence_status").notNull().default("absent"),
  presenceUpdatedAt: timestamp("presence_updated_at"),
  presenceExpiresAt: timestamp("presence_expires_at"),
  lastLoginAt: timestamp("last_login_at"),
  vacationPeriods: jsonb("vacation_periods").$type<VacationPeriod[] | null>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  /** Главный супер-администратор: назначает системных и админов подразделений, его роль неизменяема */
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  useCustomPermissions: boolean("use_custom_permissions").notNull().default(false),
  permissionOverrides: jsonb("permission_overrides").$type<UserPermissionOverrides | null>(),
  telegramChatId: text("telegram_chat_id"),
  telegramUsername: text("telegram_username"),
  telegramLinkCode: text("telegram_link_code"),
  telegramLinkCodeExpiresAt: timestamp("telegram_link_code_expires_at"),
  telegramLinkedAt: timestamp("telegram_linked_at"),
  uiPreferences: jsonb("ui_preferences").$type<import("./user-ui-preferences").UserUiPreferences | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const roleAccessProfiles = pgTable("role_access_profiles", {
  role: text("role").primaryKey(),
  label: text("label").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(false),
  modules: jsonb("modules").notNull().$type<Record<string, string>>(),
  hiddenFields: jsonb("hidden_fields").notNull().$type<string[]>(),
  hiddenDashboardBlocks: jsonb("hidden_dashboard_blocks").notNull().$type<string[]>().default([]),
  taskCapabilities: jsonb("task_capabilities").$type<TaskCapabilities | null>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  permissions: text("permissions").array().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  progress: integer("progress").notNull().default(0),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("active"),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  userId: integer("user_id").notNull(),
  campaignId: integer("campaign_id"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, overdue
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  dueDate: timestamp("due_date"),
  reminderDate: timestamp("reminder_date"), // Date for reminder notification
  completedAt: timestamp("completed_at"),
  equipmentId: text("equipment_id"), // Link to equipment if task is equipment-related
  taskType: text("task_type"), // repair, diagnostics, maintenance, modernization, other
  maintenanceType: text("maintenance_type"), // Type of maintenance task
  estimatedHours: integer("estimated_hours"), // Estimated completion time
  actualHours: real("actual_hours"), // Фактическое время в часах (точность до минуты)
  completionComment: text("completion_comment"), // Work summary on completion
  assigneeAssignedAt: timestamp("assignee_assigned_at"), // When current assignee was set
  createdBy: text("created_by").notNull(), // Name of user who created the task
  createdById: integer("created_by_id"),
  assigneeId: integer("assignee_id"),
  assigneeName: text("assignee_name"),
  openedAt: timestamp("opened_at"),
  openedById: integer("opened_by_id"),
  openedByName: text("opened_by_name"),
  lastModifiedBy: text("last_modified_by"), // Name of user who last modified the task
  lastModifiedById: integer("last_modified_by_id"),
  completedBy: text("completed_by"), // Name of user who completed the task
  completedById: integer("completed_by_id"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceId: integer("source_id"),
  remarkId: integer("remark_id"),
  maintenanceId: integer("maintenance_id"),
  serviceRequestId: integer("service_request_id"),
  parentTaskId: integer("parent_task_id"),
  rootTaskId: integer("root_task_id"),
  subdivisionId: integer("subdivision_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskStatusHistory = pgTable("task_status_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedById: integer("changed_by_id").notNull(),
  changedByName: text("changed_by_name").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taskComments = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  attachments: jsonb("attachments").$type<{ name: string; url: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partReservations = pgTable("part_reservations", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull(),
  partName: text("part_name").notNull(),
  quantity: real("quantity").notNull(),
  taskId: integer("task_id"),
  maintenanceId: integer("maintenance_id"),
  serviceRequestId: integer("service_request_id"),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  status: text("status").notNull().default("reserved"),
  createdById: integer("created_by_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  issuedAt: timestamp("issued_at"),
  issuedById: integer("issued_by_id"),
  issuedByName: text("issued_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  tasksTotal: integer("tasks_total").notNull().default(0),
  onTimeRate: integer("on_time_rate").notNull().default(0),
  productivityScore: integer("productivity_score").notNull().default(0),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  resourceType: text("resource_type"),
  resourceId: integer("resource_id"),
});

// Equipment table
export const equipment = pgTable("equipment", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  lastMaintenance: text("last_maintenance").notNull(),
  nextMaintenance: text("next_maintenance").notNull(),
  responsible: text("responsible").notNull(),
  maintenancePeriods: text("maintenance_periods").array().notNull().default([]),
  department: text("department").notNull(),
  subdivisionId: integer("subdivision_id"),
  subdivisionName: text("subdivision_name"),
  /** Постоянное подразделение-владелец (для возврата с ремонта) */
  homeSubdivisionId: integer("home_subdivision_id"),
  homeSubdivisionName: text("home_subdivision_name"),
  /** Подразделение, куда отправлено на ремонт */
  repairSubdivisionId: integer("repair_subdivision_id"),
  repairSubdivisionName: text("repair_subdivision_name"),
  model: text("model"),
  serialNumber: text("serial_number"),
  inventoryNumber: text("inventory_number"),
  installationDate: date("installation_date"),
  warrantyUntil: date("warranty_until"),
  location: text("location"),
  confluenceUrl: text("confluence_url"),
  imageUrls: text("image_urls").array().notNull().default([]),
});

export const equipmentTypes = pgTable("equipment_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Связи между оборудованием (работает в связке, вспомогательное и т.д.) */
export const equipmentLinks = pgTable(
  "equipment_links",
  {
    id: serial("id").primaryKey(),
    equipmentId: text("equipment_id").notNull(),
    linkedEquipmentId: text("linked_equipment_id").notNull(),
    linkType: text("link_type").notNull().default("works_with"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pairUnique: unique("equipment_links_pair_unique").on(table.equipmentId, table.linkedEquipmentId),
  })
);

/** Заметки и комментарии по карточке оборудования */
export const equipmentComments = pgTable("equipment_comments", {
  id: serial("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Журнал изменений оборудования: связи, статус, расположение */
export const equipmentEventLog = pgTable("equipment_event_log", {
  id: serial("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  eventType: text("event_type").notNull(),
  relatedEquipmentId: text("related_equipment_id"),
  relatedEquipmentName: text("related_equipment_name"),
  linkType: text("link_type"),
  note: text("note"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  description: text("description").notNull(),
  actorId: integer("actor_id"),
  actorName: text("actor_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Сервисные заявки (MVP-1) ---
export const serviceRequests = pgTable("service_requests", {
  id: serial("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  equipmentName: text("equipment_name").notNull(),
  requestType: text("request_type").notNull(),
  problemDescription: text("problem_description").notNull(),
  urgency: integer("urgency").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("new"),
  requesterId: integer("requester_id").notNull(),
  requesterName: text("requester_name").notNull(),
  assigneeId: integer("assignee_id"),
  assigneeName: text("assignee_name"),
  plannedHours: real("planned_hours"),
  plannedWeek: text("planned_week"),
  plannedDate: timestamp("planned_date"),
  completionComment: text("completion_comment"),
  jiraIssueKey: text("jira_issue_key"),
  partsRequired: boolean("parts_required").notNull().default(false),
  partsReceivedAt: timestamp("parts_received_at"),
  parentRequestId: integer("parent_request_id"),
  userAccepted: boolean("user_accepted"),
  userRejectionComment: text("user_rejection_comment"),
  closedAt: timestamp("closed_at"),
  budgetEntryId: integer("budget_entry_id"),
  subdivisionId: integer("subdivision_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const requestTimeEntries = pgTable("request_time_entries", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  hours: real("hours").notNull(),
  workDate: date("work_date").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const requestStatusHistory = pgTable("request_status_history", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedById: integer("changed_by_id").notNull(),
  changedByName: text("changed_by_name").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const requestComments = pgTable("request_comments", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  attachments: jsonb("attachments").$type<{ name: string; url: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const requestAuditLog = pgTable("request_audit_log", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  comment: text("comment").notNull(),
  changedById: integer("changed_by_id").notNull(),
  changedByName: text("changed_by_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const requestParts = pgTable("request_parts", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  partName: text("part_name").notNull(),
  partNumber: text("part_number"),
  quantityRequired: real("quantity_required").notNull().default(1),
  quantityUsed: real("quantity_used"),
  warehousePartId: integer("warehouse_part_id"),
  reservationId: integer("reservation_id"),
  status: text("status").notNull().default("required"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const requestCoexecutors = pgTable("request_coexecutors", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const requestLinks = pgTable("request_links", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taskCoexecutors = pgTable("task_coexecutors", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taskLinks = pgTable("task_links", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const checklistTemplates = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  equipmentType: text("equipment_type"),
  equipmentModel: text("equipment_model"),
  requestType: text("request_type").notNull(),
  category: text("category").notNull(),
  itemText: text("item_text").notNull(),
  measurementUnit: text("measurement_unit"),
  measurementNorm: text("measurement_norm"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const requestChecklistItems = pgTable("request_checklist_items", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  category: text("category").notNull(),
  itemText: text("item_text").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  comment: text("comment"),
  measurementValue: real("measurement_value"),
  measurementUnit: text("measurement_unit"),
  measurementNorm: text("measurement_norm"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Maintenance records table
export const maintenanceRecords = pgTable("maintenance_records", {
  id: serial("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  equipmentName: text("equipment_name").notNull(),
  maintenanceType: text("maintenance_type").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  completedDate: timestamp("completed_date"),
  responsible: text("responsible").notNull(),
  status: text("status").notNull().default("scheduled"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  duration: text("duration"),
  createdById: integer("created_by_id"),
  createdByName: text("created_by_name"),
  lastModifiedById: integer("last_modified_by_id"),
  lastModifiedByName: text("last_modified_by_name"),
  closedById: integer("closed_by_id"),
  closedByName: text("closed_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const maintenanceStatusHistory = pgTable("maintenance_status_history", {
  id: serial("id").primaryKey(),
  maintenanceRecordId: integer("maintenance_record_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedById: integer("changed_by_id").notNull(),
  changedByName: text("changed_by_name").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Remarks table
export const remarks = pgTable("remarks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  equipmentName: text("equipment_name").notNull(),
  equipmentId: text("equipment_id").notNull(),
  type: text("type").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  reportedBy: text("reported_by").notNull(),
  assignedTo: text("assigned_to").notNull(),
  lastModifiedBy: text("last_modified_by"), // Name of user who last modified the remark
  resolvedBy: text("resolved_by"), // Name of user who resolved the remark
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  linkedTaskId: integer("linked_task_id"),
  inspectionId: integer("inspection_id"),
  subdivisionId: integer("subdivision_id"),
  notes: text("notes").array().notNull().default([]),
});

// Inspection checklist items table
export const inspectionChecklists = pgTable("inspection_checklists", {
  id: serial("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  equipmentName: text("equipment_name").notNull(),
  checkItems: text("check_items").array().notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Daily inspection records table
export const dailyInspections = pgTable("daily_inspections", {
  id: serial("id").primaryKey(),
  equipmentId: text("equipment_id").notNull(),
  equipmentName: text("equipment_name").notNull(),
  inspectionDate: timestamp("inspection_date").notNull(),
  checkResults: text("check_results").array().notNull(), // Array of "ok", "issue", "critical"
  comments: text("comments").array().notNull().default([]),
  workingStatus: text("working_status").default("working"),
  issuesCount: integer("issues_count").notNull().default(0),
  inspectedBy: text("inspected_by").notNull(),
  status: text("status").notNull().default("completed"), // "completed", "incomplete"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Notifications table for task reminders and alerts
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(), // "reminder", "overdue", "upcoming", "completed"
  taskId: integer("task_id"),
  serviceRequestId: integer("service_request_id"),
  equipmentId: text("equipment_id"),
  warehousePartId: integer("warehouse_part_id"),
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  isRead: boolean("is_read").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  scheduledFor: timestamp("scheduled_for"), // When to show the notification
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
});

export const chatConversations = pgTable("chat_conversations", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // direct | group
  title: text("title"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chatConversationMembers = pgTable(
  "chat_conversation_members",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull(),
    userId: integer("user_id").notNull(),
    role: text("role").notNull().default("member"), // member | admin
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at"),
    leftAt: timestamp("left_at"),
  },
  (table) => ({
    uniqueMember: unique("chat_conversation_members_unique").on(
      table.conversationId,
      table.userId
    ),
  })
);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  senderId: integer("sender_id").notNull(),
  body: text("body").notNull(),
  messageKind: text("message_kind").notNull().default("user"), // user | leave
  createdAt: timestamp("created_at").notNull().defaultNow(),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
});

export const warehouseCategories = pgTable("warehouse_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const warehouseParts = pgTable("warehouse_parts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sapNumber: text("sap_number"),
  inventoryNumber: text("inventory_number"),
  categoryId: integer("category_id"),
  categoryName: text("category_name"),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  storageLocation: text("storage_location"),
  quantity: real("quantity").notNull().default(0),
  reservedQuantity: real("reserved_quantity").notNull().default(0),
  minStock: real("min_stock").notNull().default(0),
  unitCost: real("unit_cost"),
  externalLink: text("external_link"),
  notes: text("notes"),
  subdivisionId: integer("subdivision_id"),
  subdivisionName: text("subdivision_name"),
  createdById: integer("created_by_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const warehouseMovements = pgTable("warehouse_movements", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull(),
  type: text("type").notNull(),
  quantity: real("quantity").notNull(),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  destination: text("destination"),
  taskId: integer("task_id"),
  taskTitle: text("task_title"),
  maintenanceId: integer("maintenance_id"),
  serviceRequestId: integer("service_request_id"),
  reservationId: integer("reservation_id"),
  budgetEntryId: integer("budget_entry_id"),
  comment: text("comment"),
  performedById: integer("performed_by_id").notNull(),
  performedByName: text("performed_by_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const warehousePartComments = pgTable("warehouse_part_comments", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const warehouseStockAlerts = pgTable("warehouse_stock_alerts", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull(),
  alertType: text("alert_type").notNull(),
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedById: integer("resolved_by_id"),
  resolvedByName: text("resolved_by_name"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const warehouseAlertResolutions = pgTable("warehouse_alert_resolutions", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id").notNull(),
  partId: integer("part_id").notNull(),
  resolutionType: text("resolution_type").notNull(),
  comment: text("comment"),
  resolvedById: integer("resolved_by_id").notNull(),
  resolvedByName: text("resolved_by_name").notNull(),
  statusChangedById: integer("status_changed_by_id").notNull(),
  statusChangedByName: text("status_changed_by_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  supplierId: integer("supplier_id"),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  equipmentIds: jsonb("equipment_ids").$type<string[]>().default([]),
  subdivisionIds: jsonb("subdivision_ids").$type<number[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  website: text("website"),
  notes: text("notes"),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  equipmentIds: jsonb("equipment_ids").$type<string[]>().default([]),
  subdivisionIds: jsonb("subdivision_ids").$type<number[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const budgetCategories = pgTable("budget_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const budgetEntries = pgTable("budget_entries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("RUB"),
  category: text("category").notNull(),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  serviceRequestId: integer("service_request_id"),
  taskId: integer("task_id"),
  maintenanceRecordId: integer("maintenance_record_id"),
  warehousePartId: integer("warehouse_part_id"),
  storageLocation: text("storage_location"),
  supplierId: integer("supplier_id"),
  subdivisionId: integer("subdivision_id"),
  subdivisionName: text("subdivision_name"),
  externalLink: text("external_link"),
  approvalLink: text("approval_link"),
  expenseDate: date("expense_date").notNull(),
  notes: text("notes"),
  createdById: integer("created_by_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documentCategories = pgTable("document_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
  fileUrl: text("file_url").notNull(),
  description: text("description"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Планирование производства (MVP) ---

export const MATERIAL_TYPES = [
  "base",
  "secondary",
  "additive",
  "colorant",
  "packaging",
  "tooling",
  "other",
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_MOVEMENT_TYPES = [
  "in",
  "out",
  "reserve",
  "unreserve",
  "writeoff",
  "correction",
] as const;
export type MaterialMovementType = (typeof MATERIAL_MOVEMENT_TYPES)[number];

export const PRODUCT_BOM_USAGE_TYPES = [
  "per_unit",
  "percentage",
  "fixed",
  "other",
] as const;
export type ProductBomUsageType = (typeof PRODUCT_BOM_USAGE_TYPES)[number];

export const PRODUCTION_ORDER_STATUSES = [
  "draft",
  "ready",
  "planned",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];

export const PRODUCTION_ORDER_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type ProductionOrderPriority = (typeof PRODUCTION_ORDER_PRIORITIES)[number];

export const PRODUCTION_ORDER_SOURCES = ["manual", "excel_import", "api", "copied"] as const;
export type ProductionOrderSource = (typeof PRODUCTION_ORDER_SOURCES)[number];

export const PRODUCTION_SCHEDULE_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "paused",
  "cancelled",
] as const;
export type ProductionScheduleStatus = (typeof PRODUCTION_SCHEDULE_STATUSES)[number];

export const PRODUCTION_SCHEDULE_CONFLICT_STATUSES = ["none", "warning", "blocked"] as const;
export type ProductionScheduleConflictStatus = (typeof PRODUCTION_SCHEDULE_CONFLICT_STATUSES)[number];

export const PRODUCTION_DOWNTIME_REASON_TYPES = [
  "maintenance",
  "repair",
  "no_material",
  "no_operator",
  "setup",
  "quality",
  "other",
] as const;
export type ProductionDowntimeReasonType = (typeof PRODUCTION_DOWNTIME_REASON_TYPES)[number];

export const PRODUCTION_CONFLICT_TYPES = [
  "equipment_busy",
  "maintenance_overlap",
  "repair_overlap",
  "no_material",
  "cross_subdivision",
  "missing_norm",
  "deadline_risk",
] as const;
export type ProductionConflictType = (typeof PRODUCTION_CONFLICT_TYPES)[number];

export const PRODUCTION_CONFLICT_SEVERITIES = ["info", "warning", "critical", "blocking"] as const;
export type ProductionConflictSeverity = (typeof PRODUCTION_CONFLICT_SEVERITIES)[number];

export const PRODUCTION_IMPORT_BATCH_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "partial",
] as const;
export type ProductionImportBatchStatus = (typeof PRODUCTION_IMPORT_BATCH_STATUSES)[number];

export const MATERIAL_WRITEOFF_MODES = ["sync", "async", "manual"] as const;
export type MaterialWriteoffMode = (typeof MATERIAL_WRITEOFF_MODES)[number];

export const PRODUCTION_FACT_TYPES = ["scheduled", "ad_hoc"] as const;
export type ProductionFactType = (typeof PRODUCTION_FACT_TYPES)[number];

export const PRODUCTION_TOOLING_TYPES = [
  "press_form",
  "applicator",
  "tampon_print",
  "fixture",
  "other",
] as const;
export type ProductionToolingType = (typeof PRODUCTION_TOOLING_TYPES)[number];

export const PRODUCTION_TOOLING_STATUSES = [
  "ok",
  "in_production",
  "maintenance_completed",
  "storage",
  "conservation",
  "repair",
  "testing",
  "maintenance_due",
  "on_maintenance",
  "decommissioned",
] as const;
export type ProductionToolingStatus = (typeof PRODUCTION_TOOLING_STATUSES)[number];

export const PRODUCTION_DAILY_SHIFT_CODES = ["1", "2"] as const;
export type ProductionDailyShiftCode = (typeof PRODUCTION_DAILY_SHIFT_CODES)[number];

export const shiftScheduleTemplates = pgTable("shift_schedule_templates", {
  id: serial("id").primaryKey(),
  subdivisionId: integer("subdivision_id"),
  name: text("name").notNull(),
  description: text("description"),
  /** Гибкая схема смен: слоты, ротация, перерывы — JSON для UI/API */
  pattern: jsonb("pattern").notNull(),
  timezone: text("timezone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workCenters = pgTable("work_centers", {
  id: serial("id").primaryKey(),
  subdivisionId: integer("subdivision_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  subdivisionId: integer("subdivision_id").notNull(),
  sourceTemplateId: integer("source_template_id"),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  crossesMidnight: boolean("crosses_midnight").notNull().default(false),
  /** Локальные отличия от шаблона (слоты, перерывы) */
  patternOverride: jsonb("pattern_override"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    subdivisionId: integer("subdivision_id").notNull(),
    sapCode: text("sap_code").notNull(),
    name: text("name").notNull(),
    pfNumber: text("pf_number"),
    description: text("description"),
    cycleTimeSec: integer("cycle_time_sec"),
    cavities: integer("cavities"),
    productWeight: real("product_weight"),
    shotWeight: real("shot_weight"),
    /** Вес литника (литейной системы), г — на одну отливку. */
    sprueWeight: real("sprue_weight"),
    defaultShiftNorm: real("default_shift_norm"),
    isSharedAcrossSubdivisions: boolean("is_shared_across_subdivisions").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subdivisionSapUnique: unique("products_subdivision_sap_unique").on(
      table.subdivisionId,
      table.sapCode
    ),
  })
);

export const productSubdivisionAvailability = pgTable(
  "product_subdivision_availability",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull(),
    subdivisionId: integer("subdivision_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    productSubdivisionUnique: unique("product_subdivision_availability_unique").on(
      table.productId,
      table.subdivisionId
    ),
  })
);

export const materials = pgTable(
  "materials",
  {
    id: serial("id").primaryKey(),
    subdivisionId: integer("subdivision_id"),
    sapCode: text("sap_code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("other"),
    unit: text("unit").notNull().default("kg"),
    description: text("description"),
    /** Опциональная привязка к изделию для расчёта расхода по выпуску. */
    productId: integer("product_id"),
    isSharedAcrossSubdivisions: boolean("is_shared_across_subdivisions").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subdivisionSapUnique: unique("materials_subdivision_sap_unique").on(
      table.subdivisionId,
      table.sapCode
    ),
  })
);

export const materialSubdivisionAvailability = pgTable(
  "material_subdivision_availability",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id").notNull(),
    subdivisionId: integer("subdivision_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    materialSubdivisionUnique: unique("material_subdivision_availability_unique").on(
      table.materialId,
      table.subdivisionId
    ),
  })
);

export const materialStocks = pgTable(
  "material_stocks",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id").notNull(),
    subdivisionId: integer("subdivision_id").notNull(),
    storageLocation: text("storage_location").notNull().default(""),
    quantity: real("quantity").notNull().default(0),
    reservedQuantity: real("reserved_quantity").notNull().default(0),
    minStock: real("min_stock").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    materialStockLocationUnique: unique("material_stocks_material_subdivision_location_unique").on(
      table.materialId,
      table.subdivisionId,
      table.storageLocation
    ),
  })
);

export const materialMovements = pgTable("material_movements", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull(),
  subdivisionId: integer("subdivision_id").notNull(),
  type: text("type").notNull(),
  quantity: real("quantity").notNull(),
  productionOrderId: integer("production_order_id"),
  productionFactId: integer("production_fact_id"),
  comment: text("comment"),
  performedById: integer("performed_by_id"),
  performedByName: text("performed_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productBom = pgTable("product_bom", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  materialId: integer("material_id").notNull(),
  subdivisionId: integer("subdivision_id").notNull(),
  usageType: text("usage_type").notNull().default("per_unit"),
  quantityPerUnit: real("quantity_per_unit"),
  percentage: real("percentage"),
  unit: text("unit"),
  isRequired: boolean("is_required").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productEquipment = pgTable(
  "product_equipment",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull(),
    equipmentId: text("equipment_id").notNull(),
    subdivisionId: integer("subdivision_id").notNull(),
    priority: integer("priority").notNull().default(0),
    cycleTimeSecOverride: integer("cycle_time_sec_override"),
    shiftNormOverride: real("shift_norm_override"),
    setupTimeMin: integer("setup_time_min"),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    productEquipmentUnique: unique("product_equipment_product_equipment_unique").on(
      table.productId,
      table.equipmentId
    ),
  })
);

export const productShiftNorms = pgTable(
  "product_shift_norms",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull(),
    subdivisionId: integer("subdivision_id").notNull(),
    shiftCode: text("shift_code").notNull(),
    shiftNorm: real("shift_norm").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    productShiftUnique: unique("product_shift_norms_unique").on(
      table.productId,
      table.subdivisionId,
      table.shiftCode
    ),
  })
);

export const productionOrders = pgTable(
  "production_orders",
  {
    id: serial("id").primaryKey(),
    subdivisionId: integer("subdivision_id").notNull(),
    orderNumber: text("order_number").notNull(),
    orderNumberIsManual: boolean("order_number_is_manual").notNull().default(false),
    productId: integer("product_id").notNull(),
    requestedQuantity: real("requested_quantity").notNull().default(0),
    plannedQuantity: real("planned_quantity").notNull().default(0),
    completedQuantity: real("completed_quantity").notNull().default(0),
    defectiveQuantity: real("defective_quantity").notNull().default(0),
    priority: text("priority").notNull().default("medium"),
    desiredStartDate: date("desired_start_date"),
    desiredEndDate: date("desired_end_date"),
    status: text("status").notNull().default("draft"),
    source: text("source").notNull().default("manual"),
    comment: text("comment"),
    createdById: integer("created_by_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subdivisionOrderNumberUnique: unique("production_orders_subdivision_order_unique").on(
      table.subdivisionId,
      table.orderNumber
    ),
  })
);

export const productionSchedule = pgTable(
  "production_schedule",
  {
    id: serial("id").primaryKey(),
    subdivisionId: integer("subdivision_id").notNull(),
    orderId: integer("order_id").notNull(),
    equipmentId: text("equipment_id").notNull(),
    workCenterId: integer("work_center_id"),
    shiftId: integer("shift_id"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    plannedQuantity: real("planned_quantity").notNull().default(0),
    status: text("status").notNull().default("planned"),
    conflictStatus: text("conflict_status").notNull().default("none"),
    assignedById: integer("assigned_by_id"),
    assignedByName: text("assigned_by_name"),
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subdivisionEquipmentStartIdx: index("production_schedule_subdivision_equipment_start_idx").on(
      table.subdivisionId,
      table.equipmentId,
      table.startTime
    ),
    subdivisionStatusStartIdx: index("production_schedule_subdivision_status_start_idx").on(
      table.subdivisionId,
      table.status,
      table.startTime
    ),
  })
);

export const productionFact = pgTable("production_fact", {
  id: serial("id").primaryKey(),
  subdivisionId: integer("subdivision_id").notNull(),
  scheduleId: integer("schedule_id"),
  factType: text("fact_type").notNull().default("scheduled"),
  orderId: integer("order_id").notNull(),
  equipmentId: text("equipment_id").notNull(),
  shiftId: integer("shift_id"),
  reportDate: date("report_date").notNull(),
  producedQuantity: real("produced_quantity").notNull().default(0),
  defectiveQuantity: real("defective_quantity").notNull().default(0),
  downtimeMinutes: integer("downtime_minutes").notNull().default(0),
  downtimeReason: text("downtime_reason"),
  comment: text("comment"),
  reportedById: integer("reported_by_id"),
  reportedByName: text("reported_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productionDowntimes = pgTable("production_downtimes", {
  id: serial("id").primaryKey(),
  subdivisionId: integer("subdivision_id").notNull(),
  factId: integer("fact_id"),
  scheduleId: integer("schedule_id"),
  equipmentId: text("equipment_id").notNull(),
  reasonType: text("reason_type").notNull().default("other"),
  reasonText: text("reason_text"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  linkedServiceRequestId: integer("linked_service_request_id"),
  linkedMaintenanceId: integer("linked_maintenance_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productionPlanConflicts = pgTable("production_plan_conflicts", {
  id: serial("id").primaryKey(),
  subdivisionId: integer("subdivision_id").notNull(),
  scheduleId: integer("schedule_id"),
  orderId: integer("order_id"),
  equipmentId: text("equipment_id"),
  conflictType: text("conflict_type").notNull(),
  severity: text("severity").notNull().default("warning"),
  message: text("message").notNull(),
  linkedMaintenanceId: integer("linked_maintenance_id"),
  linkedServiceRequestId: integer("linked_service_request_id"),
  linkedTaskId: integer("linked_task_id"),
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const productionImportBatches = pgTable("production_import_batches", {
  id: serial("id").primaryKey(),
  subdivisionId: integer("subdivision_id").notNull(),
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("pending"),
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsSuccess: integer("rows_success").notNull().default(0),
  rowsFailed: integer("rows_failed").notNull().default(0),
  importedById: integer("imported_by_id"),
  importedByName: text("imported_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productionImportErrors = pgTable("production_import_errors", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  rowNumber: integer("row_number").notNull(),
  fieldName: text("field_name"),
  rawValue: text("raw_value"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productionTooling = pgTable(
  "production_tooling",
  {
    id: serial("id").primaryKey(),
    subdivisionId: integer("subdivision_id").notNull(),
    pfNumber: text("pf_number").notNull(),
    name: text("name").notNull(),
    productId: integer("product_id"),
    toolingType: text("tooling_type").notNull().default("press_form"),
    status: text("status").notNull().default("ok"),
    cycleTimeSec: integer("cycle_time_sec"),
    cavities: integer("cavities"),
    /** Схема гнёзд, напр. «2+2+4+1» (сумма в cavities). */
    cavitiesLayout: text("cavities_layout"),
    /** Изделий за цикл — приоритет для счётчика смыканий над первым числом схемы. */
    piecesPerCycle: integer("pieces_per_cycle"),
    productWeightGr: real("product_weight_gr"),
    shotWeightGr: real("shot_weight_gr"),
    applicableEquipmentIds: jsonb("applicable_equipment_ids").$type<string[]>().default([]),
    storageLocation: text("storage_location"),
    requiresMaintenanceLevel2: boolean("requires_maintenance_level2").notNull().default(false),
    /** Циклов до истечения гарантийного ресурса (опционально). */
    cyclesUntilGuarantee: integer("cycles_until_guarantee"),
    /** Периодичность ТО: через сколько циклов нужно ТО. */
    maintenanceCycleInterval: integer("maintenance_cycle_interval"),
    /** Суммарный счётчик циклов (из факта выпуска / плана). */
    cycleCounterTotal: integer("cycle_counter_total").notNull().default(0),
    /** База счётчика до учёта факта выпуска в системе (импорт / ручной ввод / ТО). */
    cycleCounterRegistryBase: integer("cycle_counter_registry_base"),
    /** Циклов с последнего ТО. */
    cyclesSinceMaintenance: integer("cycles_since_maintenance").notNull().default(0),
    /** Снимок total циклов на момент последнего ТО. */
    cyclesAtLastMaintenance: integer("cycles_at_last_maintenance"),
    lastMaintenanceAt: timestamp("last_maintenance_at"),
    /** Инвентарный номер / № ОС */
    fixedAssetNumber: text("fixed_asset_number"),
    /** Дата обновления карточки (как в реестре ПФ) */
    infoUpdatedAt: timestamp("info_updated_at"),
    /** Плановая дата следующего ТО */
    nextMaintenancePlannedAt: timestamp("next_maintenance_planned_at"),
    /** Длительность последнего ТО, часов */
    lastMaintenanceDurationHours: real("last_maintenance_duration_hours"),
    /** Оценочное время ТО, часов */
    estimatedMaintenanceHours: real("estimated_maintenance_hours"),
    comment: text("comment"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subdivisionPfUnique: unique("production_tooling_subdivision_pf_unique").on(
      table.subdivisionId,
      table.pfNumber
    ),
  })
);

export const productionToolingProducts = pgTable(
  "production_tooling_products",
  {
    id: serial("id").primaryKey(),
    toolingId: integer("tooling_id").notNull(),
    productId: integer("product_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    toolingProductUnique: unique("production_tooling_products_unique").on(
      table.toolingId,
      table.productId
    ),
  })
);

export const productionToolingMaintenance = pgTable("production_tooling_maintenance", {
  id: serial("id").primaryKey(),
  toolingId: integer("tooling_id").notNull(),
  performedAt: timestamp("performed_at").notNull().defaultNow(),
  cyclesAtMaintenance: integer("cycles_at_maintenance").notNull().default(0),
  comment: text("comment"),
  performedById: integer("performed_by_id"),
  performedByName: text("performed_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const productionDailyPlan = pgTable(
  "production_daily_plan",
  {
    id: serial("id").primaryKey(),
    subdivisionId: integer("subdivision_id").notNull(),
    equipmentId: text("equipment_id").notNull(),
    orderId: integer("order_id"),
    productId: integer("product_id"),
    planDate: date("plan_date").notNull(),
    shiftCode: text("shift_code").notNull().default("1"),
    plannedQuantity: real("planned_quantity").notNull().default(0),
    pfNumber: text("pf_number"),
    toolingId: integer("tooling_id"),
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subdivisionDateIdx: index("production_daily_plan_subdivision_date_idx").on(
      table.subdivisionId,
      table.planDate
    ),
    equipmentDateIdx: index("production_daily_plan_equipment_date_idx").on(
      table.equipmentId,
      table.planDate
    ),
  })
);

export const productionPlanningSettings = pgTable(
  "production_planning_settings",
  {
    id: serial("id").primaryKey(),
    subdivisionId: integer("subdivision_id").notNull(),
    materialWriteoffMode: text("material_writeoff_mode").notNull().default("sync"),
    timezone: text("timezone"),
    defaultShiftTemplateId: integer("default_shift_template_id"),
    displayConfig: jsonb("display_config").$type<ProductionDisplayConfig>(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    subdivisionUnique: unique("production_planning_settings_subdivision_unique").on(
      table.subdivisionId
    ),
  })
);

// Insert Schemas
export const insertUserSchema = createInsertSchema(users, {
  permissionOverrides: z
    .object({
      modules: z.record(z.enum(["none", "view", "edit"])).optional(),
      hiddenFields: z.array(z.string()).optional(),
      hiddenDashboardBlocks: z.array(z.string()).optional(),
      taskCapabilities: z
        .object({
          create: z.boolean().optional(),
          viewCreated: z.boolean().optional(),
          process: z.boolean().optional(),
          convertToServiceRequest: z.boolean().optional(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
}).omit({ id: true });

export const avatarUrlSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Укажите корректный URL (http или https)" }
  );

export const updateProfileSchema = z.object({
  name: z.string().min(1, "Укажите имя").optional(),
  email: z.string().email("Некорректный email").optional(),
  position: z.string().optional(),
  phone: z.string().optional(),
  avatar: avatarUrlSchema.optional().nullable(),
});

export const updatePresenceSchema = z.object({
  status: z.enum(["online", "working", "break", "vacation", "absent", "busy"]),
});

export const adminUpdatePresenceSchema = updatePresenceSchema.extend({
  clearExpiry: z.boolean().optional(),
});

export const vacationPeriodSchema = z
  .object({
    id: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Некорректная дата начала"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Некорректная дата окончания"),
    note: z.string().max(500).optional(),
  })
  .refine((p) => p.startDate <= p.endDate, {
    message: "Дата окончания не может быть раньше даты начала",
    path: ["endDate"],
  });

export const updateVacationPeriodsSchema = z.object({
  periods: z.array(vacationPeriodSchema),
});

export const updateUserPermissionsSchema = z.object({
  useCustomPermissions: z.boolean().optional(),
  permissionOverrides: z
    .object({
      modules: z.record(z.enum(["none", "view", "edit"])).optional(),
      hiddenFields: z.array(z.string()).optional(),
      hiddenDashboardBlocks: z.array(z.string()).optional(),
      taskCapabilities: z
        .object({
          create: z.boolean().optional(),
          viewCreated: z.boolean().optional(),
          process: z.boolean().optional(),
          convertToServiceRequest: z.boolean().optional(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
});

export const createRoleAccessProfileSchema = z.object({
  role: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,31}$/, "Ключ: латиница, цифры, _, от 2 до 32 символов")
    .refine((r) => r !== "admin", "Роль admin зарезервирована"),
  label: z.string().min(1).max(64),
});

export const updateRoleAccessProfileSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  modules: z.record(z.enum(["none", "view", "edit"])),
  hiddenFields: z.array(z.string()),
  hiddenDashboardBlocks: z.array(z.string()).default([]),
  taskCapabilities: z
    .object({
      create: z.boolean(),
      viewCreated: z.boolean(),
      process: z.boolean(),
      convertToServiceRequest: z.boolean(),
    })
    .optional(),
});
export const insertRoleSchema = createInsertSchema(roles).omit({ id: true });
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMetricSchema = createInsertSchema(metrics).omit({ id: true });
export const insertActivitySchema = createInsertSchema(activities).omit({ id: true });
export const insertEquipmentSchema = createInsertSchema(equipment);

export const equipmentLinkInputSchema = z.object({
  linkedEquipmentId: z.string().min(1),
  linkType: z.enum(["works_with", "auxiliary", "depends_on"]).optional(),
  note: z.string().nullable().optional(),
});

export const syncEquipmentLinksSchema = z.object({
  links: z.array(equipmentLinkInputSchema),
});
export const insertMaintenanceRecordSchema = createInsertSchema(maintenanceRecords).omit({ id: true });
export const insertRemarkSchema = createInsertSchema(remarks).omit({ id: true });
export const insertInspectionChecklistSchema = createInsertSchema(inspectionChecklists).omit({ id: true });
export const insertDailyInspectionSchema = createInsertSchema(dailyInspections).omit({ id: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertChatConversationMemberSchema = createInsertSchema(chatConversationMembers).omit({
  id: true,
  joinedAt: true,
});
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});
export const insertContactSchema = createInsertSchema(contacts)
  .omit({ id: true, createdAt: true })
  .extend({
    equipmentIds: z.array(z.string()).optional(),
    subdivisionIds: z.array(z.number()).optional(),
  });
export const insertSupplierSchema = createInsertSchema(suppliers)
  .omit({ id: true, createdAt: true })
  .extend({
    equipmentIds: z.array(z.string()).optional(),
    subdivisionIds: z.array(z.number()).optional(),
  });
export const insertBudgetCategorySchema = createInsertSchema(budgetCategories).omit({
  id: true,
  createdAt: true,
});
export const insertBudgetEntrySchema = createInsertSchema(budgetEntries).omit({ id: true, createdAt: true });

export const createBudgetEntryRequestSchema = insertBudgetEntrySchema.extend({
  linkToWarehouse: z.boolean().optional(),
  warehouseInitialQuantity: z.number().min(0).optional(),
  warehouseCategoryId: z.number().int().optional().nullable(),
});
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertDocumentCategorySchema = createInsertSchema(documentCategories).omit({
  id: true,
  createdAt: true,
});
export const insertWarehouseCategorySchema = createInsertSchema(warehouseCategories).omit({
  id: true,
  createdAt: true,
});
export const insertWarehousePartSchema = createInsertSchema(warehouseParts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  createdByName: true,
});

export const createWarehousePartSchema = insertWarehousePartSchema
  .omit({ quantity: true })
  .extend({
    initialQuantity: z.number().min(0).optional(),
  });
export const insertWarehouseMovementSchema = createInsertSchema(warehouseMovements).omit({
  id: true,
  createdAt: true,
});
export const insertWarehousePartCommentSchema = createInsertSchema(warehousePartComments).omit({
  id: true,
  createdAt: true,
});
export const addWarehouseMovementSchema = z.object({
  type: z.enum(["in", "out"]),
  quantity: z.number().positive("Количество должно быть больше 0"),
  equipmentId: z.string().optional(),
  equipmentName: z.string().optional(),
  destination: z.string().optional(),
  comment: z.string().optional(),
  taskId: z.number().int().positive().optional(),
  taskTitle: z.string().optional(),
  serviceRequestId: z.number().int().positive().optional(),
});

export const addWarehouseCommentSchema = z.object({
  body: z.string().min(1, "Комментарий не может быть пустым"),
});

export const addEquipmentCommentSchema = z.object({
  body: z.string().min(1, "Заметка не может быть пустой"),
});

export const updateEquipmentCommentSchema = z.object({
  body: z.string().min(1, "Заметка не может быть пустой"),
});

export const updateCommentBodySchema = z.object({
  body: z.string().min(1, "Комментарий не может быть пустым"),
});

export const commentAttachmentSchema = z.object({
  name: z.string().min(1, "Укажите название файла"),
  url: z.string().min(1, "Укажите ссылку на файл"),
});

export const addTaskCommentSchema = z
  .object({
    body: z.string().default(""),
    attachments: z.array(commentAttachmentSchema).optional().default([]),
  })
  .refine((data) => data.body.trim().length > 0 || (data.attachments?.length ?? 0) > 0, {
    message: "Комментарий или вложение обязательны",
  });

export const reservePartSchema = z.object({
  partId: z.number().int().positive(),
  quantity: z.number().positive("Количество должно быть больше 0"),
  taskId: z.number().int().positive().optional(),
  maintenanceId: z.number().int().positive().optional(),
  equipmentId: z.string().optional(),
  equipmentName: z.string().optional(),
  taskTitle: z.string().optional(),
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertRequestTimeEntrySchema = createInsertSchema(requestTimeEntries).omit({
  id: true,
  createdAt: true,
});
export const insertRequestCommentSchema = createInsertSchema(requestComments).omit({
  id: true,
  createdAt: true,
});

export const createServiceRequestSchema = z.object({
  equipmentId: z.string().min(1, "Выберите оборудование"),
  requestType: z.string().min(1),
  problemDescription: z.string().min(10, "Описание не менее 10 символов"),
  urgency: z.number().int().min(1).max(5),
  budgetEntryId: z.number().int().optional(),
});

export const linkBudgetToRequestSchema = z.object({
  budgetEntryId: z.number().int().nullable(),
});

export const updateServiceRequestDetailsSchema = z.object({
  equipmentId: z.string().min(1).optional(),
  requestType: z.string().min(1).optional(),
});

export const transitionServiceRequestSchema = z.object({
  toStatus: z.string(),
  comment: z.string().optional(),
  assigneeId: z.number().int().optional(),
  assigneeName: z.string().optional(),
  priority: z.string().optional(),
  plannedHours: z.number().optional(),
  plannedWeek: z.string().optional(),
  plannedDate: z.string().optional(),
  completionComment: z.string().optional(),
  jiraIssueKey: z.string().optional(),
  partsRequired: z.boolean().optional(),
  parentRequestId: z.number().int().optional(),
  userAccepted: z.boolean().optional(),
  userRejectionComment: z.string().optional(),
  auditComment: z.string().optional(),
  adminForceClose: z.boolean().optional(),
});

export const addTimeEntrySchema = z.object({
  hours: z.number().positive("Укажите время больше 0"),
  workDate: z.string(),
  comment: z.string().optional(),
});

export const addRequestPartSchema = z.object({
  partName: z.string().min(1),
  partNumber: z.string().optional(),
  quantityRequired: z.number().positive().default(1),
  warehousePartId: z.number().int().positive().optional(),
});

export const addCoexecutorSchema = z.object({
  userId: z.number().int(),
  userName: z.string().min(1),
});

export const addRequestLinkSchema = z.object({
  title: z.string().min(1, "Укажите название ссылки"),
  description: z.string().optional(),
  url: z.string().min(1, "Укажите URL"),
});

export const addTaskLinkSchema = addRequestLinkSchema;

export const createServiceRequestSubtaskSchema = z.object({
  title: z.string().min(1, "Укажите название подзадачи"),
  description: z.string().optional(),
  taskType: z.string().optional(),
  priority: z.string().optional(),
});

export const updateChecklistItemSchema = z.object({
  isCompleted: z.boolean().optional(),
  comment: z.string().optional(),
  measurementValue: z.number().optional(),
});

export const insertChecklistTemplateSchema = z.object({
  requestType: z.string().min(1),
  equipmentType: z.string().optional(),
  equipmentModel: z.string().optional(),
  category: z.string().min(1),
  itemText: z.string().min(1),
  measurementUnit: z.string().optional(),
  measurementNorm: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

// Zod enum-схемы планирования производства
export const materialTypeSchema = z.enum(MATERIAL_TYPES);
export const materialMovementTypeSchema = z.enum(MATERIAL_MOVEMENT_TYPES);
export const productBomUsageTypeSchema = z.enum(PRODUCT_BOM_USAGE_TYPES);
export const productionOrderStatusSchema = z.enum(PRODUCTION_ORDER_STATUSES);
export const productionOrderPrioritySchema = z.enum(PRODUCTION_ORDER_PRIORITIES);
export const productionOrderSourceSchema = z.enum(PRODUCTION_ORDER_SOURCES);
export const productionScheduleStatusSchema = z.enum(PRODUCTION_SCHEDULE_STATUSES);
export const productionScheduleConflictStatusSchema = z.enum(PRODUCTION_SCHEDULE_CONFLICT_STATUSES);
export const productionDowntimeReasonTypeSchema = z.enum(PRODUCTION_DOWNTIME_REASON_TYPES);
export const productionConflictTypeSchema = z.enum(PRODUCTION_CONFLICT_TYPES);
export const productionConflictSeveritySchema = z.enum(PRODUCTION_CONFLICT_SEVERITIES);
export const productionImportBatchStatusSchema = z.enum(PRODUCTION_IMPORT_BATCH_STATUSES);
export const materialWriteoffModeSchema = z.enum(MATERIAL_WRITEOFF_MODES);
export const productionFactTypeSchema = z.enum(PRODUCTION_FACT_TYPES);
export const productionToolingTypeSchema = z.enum(PRODUCTION_TOOLING_TYPES);
export const productionToolingStatusSchema = z.enum(PRODUCTION_TOOLING_STATUSES);
export const productionDailyShiftCodeSchema = z.enum(PRODUCTION_DAILY_SHIFT_CODES);

export const insertShiftScheduleTemplateSchema = createInsertSchema(shiftScheduleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertWorkCenterSchema = createInsertSchema(workCenters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProductSubdivisionAvailabilitySchema = createInsertSchema(
  productSubdivisionAvailability
).omit({
  id: true,
  createdAt: true,
});
export const insertMaterialSchema = createInsertSchema(materials)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    type: materialTypeSchema.optional(),
  });
export const insertMaterialSubdivisionAvailabilitySchema = createInsertSchema(
  materialSubdivisionAvailability
).omit({
  id: true,
  createdAt: true,
});
export const insertMaterialStockSchema = createInsertSchema(materialStocks).omit({
  id: true,
  updatedAt: true,
});
export const insertMaterialMovementSchema = createInsertSchema(materialMovements)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    type: materialMovementTypeSchema,
  });
export const insertProductBomSchema = createInsertSchema(productBom)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    usageType: productBomUsageTypeSchema.optional(),
  });
export const insertProductEquipmentSchema = createInsertSchema(productEquipment).omit({
  id: true,
  createdAt: true,
});
export const insertProductShiftNormSchema = createInsertSchema(productShiftNorms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProductionOrderSchema = createInsertSchema(productionOrders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    status: productionOrderStatusSchema.optional(),
    priority: productionOrderPrioritySchema.optional(),
    source: productionOrderSourceSchema.optional(),
  });
export const insertProductionScheduleSchema = createInsertSchema(productionSchedule)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    status: productionScheduleStatusSchema.optional(),
    conflictStatus: productionScheduleConflictStatusSchema.optional(),
  });
export const insertProductionFactSchema = createInsertSchema(productionFact)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    factType: productionFactTypeSchema.optional(),
  });
export const insertProductionDowntimeSchema = createInsertSchema(productionDowntimes)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    reasonType: productionDowntimeReasonTypeSchema.optional(),
  });
export const insertProductionPlanConflictSchema = createInsertSchema(productionPlanConflicts)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    conflictType: productionConflictTypeSchema,
    severity: productionConflictSeveritySchema.optional(),
  });
export const insertProductionImportBatchSchema = createInsertSchema(productionImportBatches)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    status: productionImportBatchStatusSchema.optional(),
  });
export const insertProductionImportErrorSchema = createInsertSchema(productionImportErrors).omit({
  id: true,
  createdAt: true,
});
export const insertProductionToolingSchema = createInsertSchema(productionTooling)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    toolingType: productionToolingTypeSchema.optional(),
    status: productionToolingStatusSchema.optional(),
    applicableEquipmentIds: z.array(z.string()).optional(),
    cyclesUntilGuarantee: z.number().int().positive().optional().nullable(),
    maintenanceCycleInterval: z.number().int().positive().optional().nullable(),
    cycleCounterTotal: z.number().int().min(0).optional(),
    cycleCounterRegistryBase: z.number().int().min(0).optional().nullable(),
    cyclesSinceMaintenance: z.number().int().min(0).optional(),
    cyclesAtLastMaintenance: z.number().int().min(0).optional().nullable(),
    lastMaintenanceAt: z.string().optional().nullable(),
    fixedAssetNumber: z.string().optional().nullable(),
    infoUpdatedAt: z.string().optional().nullable(),
    nextMaintenancePlannedAt: z.string().optional().nullable(),
    lastMaintenanceDurationHours: z.number().min(0).optional().nullable(),
    estimatedMaintenanceHours: z.number().min(0).optional().nullable(),
    cavitiesLayout: z.string().optional().nullable(),
    piecesPerCycle: z.number().int().positive().optional().nullable(),
  });
export const insertProductionToolingMaintenanceSchema = createInsertSchema(
  productionToolingMaintenance
).omit({
  id: true,
  createdAt: true,
});
export const insertProductionDailyPlanSchema = createInsertSchema(productionDailyPlan)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    shiftCode: productionDailyShiftCodeSchema.optional(),
  });
export const insertProductionPlanningSettingsSchema = createInsertSchema(productionPlanningSettings)
  .omit({
    id: true,
    updatedAt: true,
  })
  .extend({
    materialWriteoffMode: materialWriteoffModeSchema.optional(),
    displayConfig: z.record(z.unknown()).optional(),
  });

// Login Schema
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(5),
});

// Register Schema
export const registerSchema = z.object({
  name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
  confirmPassword: z.string(),
  position: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type EquipmentLink = typeof equipmentLinks.$inferSelect;
export type InsertEquipmentLink = typeof equipmentLinks.$inferInsert;
export type EquipmentEventLog = typeof equipmentEventLog.$inferSelect;
export type InsertEquipmentEventLog = typeof equipmentEventLog.$inferInsert;
export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type InsertMaintenanceRecord = z.infer<typeof insertMaintenanceRecordSchema>;
export type Remark = typeof remarks.$inferSelect;
export type InsertRemark = z.infer<typeof insertRemarkSchema>;
export type InspectionChecklist = typeof inspectionChecklists.$inferSelect;
export type InsertInspectionChecklist = z.infer<typeof insertInspectionChecklistSchema>;
export type DailyInspection = typeof dailyInspections.$inferSelect;
export type InsertDailyInspection = z.infer<typeof insertDailyInspectionSchema>;
export type Notification = typeof notifications.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatConversationMember = typeof chatConversationMembers.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type InsertChatConversationMember = z.infer<typeof insertChatConversationMemberSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Login = z.infer<typeof loginSchema>;
export type Register = z.infer<typeof registerSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type RequestTimeEntry = typeof requestTimeEntries.$inferSelect;
export type InsertRequestTimeEntry = z.infer<typeof insertRequestTimeEntrySchema>;
export type RequestStatusHistory = typeof requestStatusHistory.$inferSelect;
export type RequestComment = typeof requestComments.$inferSelect;
export type RequestAuditLog = typeof requestAuditLog.$inferSelect;
export type RequestPart = typeof requestParts.$inferSelect;
export type RequestLink = typeof requestLinks.$inferSelect;
export type TaskLink = typeof taskLinks.$inferSelect;
export type RequestCoexecutor = typeof requestCoexecutors.$inferSelect;
export type TaskCoexecutor = typeof taskCoexecutors.$inferSelect;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type RequestChecklistItem = typeof requestChecklistItems.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type BudgetCategory = typeof budgetCategories.$inferSelect;
export type InsertBudgetCategory = z.infer<typeof insertBudgetCategorySchema>;
export type BudgetEntry = typeof budgetEntries.$inferSelect;
export type InsertBudgetEntry = z.infer<typeof insertBudgetEntrySchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type InsertDocumentCategory = z.infer<typeof insertDocumentCategorySchema>;
export type WarehouseCategory = typeof warehouseCategories.$inferSelect;
export type EquipmentType = typeof equipmentTypes.$inferSelect;
export type Subdivision = typeof subdivisions.$inferSelect;
export type InsertWarehouseCategory = z.infer<typeof insertWarehouseCategorySchema>;
export type WarehousePart = typeof warehouseParts.$inferSelect;
export type InsertWarehousePart = z.infer<typeof insertWarehousePartSchema>;
export type WarehouseMovement = typeof warehouseMovements.$inferSelect;
export type InsertWarehouseMovement = z.infer<typeof insertWarehouseMovementSchema>;
export type WarehousePartComment = typeof warehousePartComments.$inferSelect;
export type EquipmentComment = typeof equipmentComments.$inferSelect;
export type WarehouseStockAlert = typeof warehouseStockAlerts.$inferSelect;
export type TaskStatusHistory = typeof taskStatusHistory.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type PartReservation = typeof partReservations.$inferSelect;
export type MaintenanceStatusHistory = typeof maintenanceStatusHistory.$inferSelect;

export type WorkCenter = typeof workCenters.$inferSelect;
export type InsertWorkCenter = z.infer<typeof insertWorkCenterSchema>;
export type ShiftScheduleTemplate = typeof shiftScheduleTemplates.$inferSelect;
export type InsertShiftScheduleTemplate = z.infer<typeof insertShiftScheduleTemplateSchema>;
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductSubdivisionAvailability = typeof productSubdivisionAvailability.$inferSelect;
export type InsertProductSubdivisionAvailability = z.infer<
  typeof insertProductSubdivisionAvailabilitySchema
>;
export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type MaterialSubdivisionAvailability = typeof materialSubdivisionAvailability.$inferSelect;
export type InsertMaterialSubdivisionAvailability = z.infer<
  typeof insertMaterialSubdivisionAvailabilitySchema
>;
export type MaterialStock = typeof materialStocks.$inferSelect;
export type InsertMaterialStock = z.infer<typeof insertMaterialStockSchema>;
export type MaterialMovement = typeof materialMovements.$inferSelect;
export type InsertMaterialMovement = z.infer<typeof insertMaterialMovementSchema>;
export type ProductBom = typeof productBom.$inferSelect;
export type InsertProductBom = z.infer<typeof insertProductBomSchema>;
export type ProductEquipment = typeof productEquipment.$inferSelect;
export type InsertProductEquipment = z.infer<typeof insertProductEquipmentSchema>;
export type ProductShiftNorm = typeof productShiftNorms.$inferSelect;
export type InsertProductShiftNorm = z.infer<typeof insertProductShiftNormSchema>;
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type InsertProductionOrder = z.infer<typeof insertProductionOrderSchema>;
export type ProductionSchedule = typeof productionSchedule.$inferSelect;
export type InsertProductionSchedule = z.infer<typeof insertProductionScheduleSchema>;
export type ProductionFact = typeof productionFact.$inferSelect;
export type InsertProductionFact = z.infer<typeof insertProductionFactSchema>;
export type ProductionDowntime = typeof productionDowntimes.$inferSelect;
export type InsertProductionDowntime = z.infer<typeof insertProductionDowntimeSchema>;
export type ProductionPlanConflict = typeof productionPlanConflicts.$inferSelect;
export type InsertProductionPlanConflict = z.infer<typeof insertProductionPlanConflictSchema>;
export type ProductionImportBatch = typeof productionImportBatches.$inferSelect;
export type InsertProductionImportBatch = z.infer<typeof insertProductionImportBatchSchema>;
export type ProductionImportError = typeof productionImportErrors.$inferSelect;
export type InsertProductionImportError = z.infer<typeof insertProductionImportErrorSchema>;
export type ProductionTooling = typeof productionTooling.$inferSelect;
export type InsertProductionTooling = z.infer<typeof insertProductionToolingSchema>;
export type ProductionToolingProduct = typeof productionToolingProducts.$inferSelect;
export type ProductionToolingMaintenance = typeof productionToolingMaintenance.$inferSelect;
export type InsertProductionToolingMaintenance = z.infer<
  typeof insertProductionToolingMaintenanceSchema
>;
export type ProductionDailyPlan = typeof productionDailyPlan.$inferSelect;
export type InsertProductionDailyPlan = z.infer<typeof insertProductionDailyPlanSchema>;
export type ProductionPlanningSettings = typeof productionPlanningSettings.$inferSelect;
export type InsertProductionPlanningSettings = z.infer<typeof insertProductionPlanningSettingsSchema>;
