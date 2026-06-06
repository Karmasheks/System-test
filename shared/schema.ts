import { pgTable, text, serial, integer, boolean, timestamp, unique, date, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { TaskCapabilities, UserPermissionOverrides } from "./permissions-constants";
import type { VacationPeriod } from "./user-presence-constants";

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
  useCustomPermissions: boolean("use_custom_permissions").notNull().default(false),
  permissionOverrides: jsonb("permission_overrides").$type<UserPermissionOverrides | null>(),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  website: text("website"),
  notes: text("notes"),
  equipmentId: text("equipment_id"),
  equipmentName: text("equipment_name"),
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
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
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
export type RequestCoexecutor = typeof requestCoexecutors.$inferSelect;
export type TaskCoexecutor = typeof taskCoexecutors.$inferSelect;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type RequestChecklistItem = typeof requestChecklistItems.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
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
export type WarehouseStockAlert = typeof warehouseStockAlerts.$inferSelect;
export type TaskStatusHistory = typeof taskStatusHistory.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type PartReservation = typeof partReservations.$inferSelect;
export type MaintenanceStatusHistory = typeof maintenanceStatusHistory.$inferSelect;
