import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  budgetEntries,
  dailyInspections,
  equipmentEventLog,
  remarks,
  serviceRequests,
  tasks,
} from "@shared/schema";
import { STATUS_LABELS, type ServiceRequestStatus } from "@shared/service-request-constants";
import { TASK_SOURCE_LABELS, type TaskSourceType } from "@shared/task-source-constants";
import { taskStatusLabel } from "@shared/task-status-constants";
import { equipmentLinkTypeLabel } from "@shared/equipment-link-constants";
import { equipmentStatusLabel } from "@shared/equipment-utils";
import {
  getEquipmentEventsForEquipment,
  getEquipmentLinkEventsForEquipment,
  backfillMissingLinkEvents,
} from "./equipment-event-log";

export interface EquipmentActivityLink {
  type: string;
  id: number;
  label: string;
}

export interface EquipmentActivityItem {
  id: string;
  category:
    | "task"
    | "service_request"
    | "maintenance"
    | "remark"
    | "inspection"
    | "budget"
    | "link"
    | "equipment_status"
    | "equipment_location"
    | "subdivision_transfer"
    | "repair_transfer";
  entityId: number;
  title: string;
  subtitle?: string;
  status?: string;
  statusLabel?: string;
  occurredAt: string;
  actor?: string;
  href?: string;
  links: EquipmentActivityLink[];
}

const REMARK_STATUS_LABELS: Record<string, string> = {
  open: "Открыто",
  in_progress: "В работе",
  resolved: "Решено",
  closed: "Закрыто",
};

function taskLinks(row: typeof tasks.$inferSelect): EquipmentActivityLink[] {
  const links: EquipmentActivityLink[] = [];
  if (row.remarkId) links.push({ type: "remark", id: row.remarkId, label: "Замечание" });
  if (row.maintenanceId) links.push({ type: "maintenance", id: row.maintenanceId, label: "ТО" });
  if (row.serviceRequestId) {
    links.push({ type: "service_request", id: row.serviceRequestId, label: "Сервисная заявка" });
  }
  if (row.parentTaskId) links.push({ type: "task", id: row.parentTaskId, label: "Родительская задача" });
  if (row.rootTaskId && row.rootTaskId !== row.id) {
    links.push({ type: "task", id: row.rootTaskId, label: "Корневая задача" });
  }
  return links;
}

function mapEventRowToActivityItem(row: typeof equipmentEventLog.$inferSelect): EquipmentActivityItem | null {
  const links: EquipmentActivityLink[] = [];
  if (row.relatedEquipmentId) {
    links.push({
      type: "equipment",
      id: 0,
      label: `${row.relatedEquipmentName ?? row.relatedEquipmentId}`,
    });
  }

  if (row.eventType === "link_added" || row.eventType === "link_removed" || row.eventType === "link_updated") {
    return {
      id: `event-${row.id}`,
      category: "link",
      entityId: row.id,
      title: row.description,
      subtitle: row.linkType ? equipmentLinkTypeLabel(row.linkType) : undefined,
      status: row.eventType,
      statusLabel:
        row.eventType === "link_added"
          ? "Связь добавлена"
          : row.eventType === "link_removed"
            ? "Связь удалена"
            : "Связь изменена",
      occurredAt: row.createdAt.toISOString(),
      actor: row.actorName ?? undefined,
      href: row.relatedEquipmentId ? `/equipment?highlight=${row.relatedEquipmentId}` : undefined,
      links,
    };
  }

  if (row.eventType === "status_changed") {
    return {
      id: `event-${row.id}`,
      category: "equipment_status",
      entityId: row.id,
      title: row.description,
      status: row.newValue ?? undefined,
      statusLabel: equipmentStatusLabel(row.newValue),
      occurredAt: row.createdAt.toISOString(),
      actor: row.actorName ?? undefined,
      links,
    };
  }

  if (row.eventType === "location_changed") {
    return {
      id: `event-${row.id}`,
      category: "equipment_location",
      entityId: row.id,
      title: row.description,
      statusLabel: row.newValue ?? "Не указано",
      occurredAt: row.createdAt.toISOString(),
      actor: row.actorName ?? undefined,
      links,
    };
  }

  if (row.eventType === "subdivision_transferred") {
    return {
      id: `event-${row.id}`,
      category: "subdivision_transfer",
      entityId: row.id,
      title: row.description,
      subtitle: row.oldValue && row.newValue ? `${row.oldValue} → ${row.newValue}` : undefined,
      statusLabel: row.newValue ?? "Перенос",
      occurredAt: row.createdAt.toISOString(),
      actor: row.actorName ?? undefined,
      links,
    };
  }

  if (row.eventType === "repair_sent" || row.eventType === "repair_returned") {
    return {
      id: `event-${row.id}`,
      category: "repair_transfer",
      entityId: row.id,
      title: row.description,
      subtitle: row.note ?? undefined,
      statusLabel:
        row.eventType === "repair_sent"
          ? "На ремонте"
          : "Возврат с ремонта",
      occurredAt: row.createdAt.toISOString(),
      actor: row.actorName ?? undefined,
      links,
    };
  }

  return null;
}

export async function getEquipmentLinkHistory(equipmentId: string): Promise<EquipmentActivityItem[]> {
  await backfillMissingLinkEvents();
  const eventRows = await getEquipmentLinkEventsForEquipment(equipmentId);
  const items = eventRows
    .map(mapEventRowToActivityItem)
    .filter((item): item is EquipmentActivityItem => item !== null);
  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return items;
}

export async function getEquipmentActivity(equipmentId: string): Promise<EquipmentActivityItem[]> {
  await backfillMissingLinkEvents();
  const [taskRows, srRows, remarkRows, inspRows, budgetRows, eventRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.equipmentId, equipmentId)),
    db.select().from(serviceRequests).where(eq(serviceRequests.equipmentId, equipmentId)),
    db.select().from(remarks).where(eq(remarks.equipmentId, equipmentId)),
    db.select().from(dailyInspections).where(eq(dailyInspections.equipmentId, equipmentId)),
    db.select().from(budgetEntries).where(eq(budgetEntries.equipmentId, equipmentId)),
    getEquipmentEventsForEquipment(equipmentId),
  ]);

  const items: EquipmentActivityItem[] = [];

  for (const row of taskRows) {
    const sourceLabel =
      TASK_SOURCE_LABELS[row.sourceType as TaskSourceType] ?? row.sourceType ?? "Задача";
    items.push({
      id: `task-${row.id}`,
      category: "task",
      entityId: row.id,
      title: row.title,
      subtitle: sourceLabel,
      status: row.status,
      statusLabel: taskStatusLabel(row.status),
      occurredAt: (row.updatedAt ?? row.createdAt).toISOString(),
      actor: row.assigneeName ?? row.createdBy,
      href: `/tasks?task=${row.id}`,
      links: taskLinks(row),
    });
  }

  for (const row of srRows) {
    const links: EquipmentActivityLink[] = [];
    if (row.budgetEntryId) links.push({ type: "budget", id: row.budgetEntryId, label: "Затрата" });
    if (row.parentRequestId) {
      links.push({ type: "service_request", id: row.parentRequestId, label: "Родительская заявка" });
    }
    items.push({
      id: `sr-${row.id}`,
      category: "service_request",
      entityId: row.id,
      title: `Заявка #${row.id}: ${row.problemDescription.slice(0, 80)}`,
      subtitle: row.requestType,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status as ServiceRequestStatus] ?? row.status,
      occurredAt: (row.updatedAt ?? row.createdAt).toISOString(),
      actor: row.assigneeName ?? row.requesterName,
      href: `/service-requests/${row.id}`,
      links,
    });
  }

  for (const row of remarkRows) {
    const links: EquipmentActivityLink[] = [];
    if (row.linkedTaskId) links.push({ type: "task", id: row.linkedTaskId, label: "Связанная задача" });
    if (row.inspectionId) links.push({ type: "inspection", id: row.inspectionId, label: "Осмотр" });
    items.push({
      id: `remark-${row.id}`,
      category: "remark",
      entityId: row.id,
      title: row.title,
      subtitle: row.type,
      status: row.status,
      statusLabel: REMARK_STATUS_LABELS[row.status] ?? row.status,
      occurredAt: (row.updatedAt ?? row.createdAt).toISOString(),
      actor: row.reportedBy,
      href: row.linkedTaskId
        ? `/tasks?task=${row.linkedTaskId}`
        : `/tasks?section=remarks`,
      links,
    });
  }

  for (const row of inspRows) {
    items.push({
      id: `insp-${row.id}`,
      category: "inspection",
      entityId: row.id,
      title: `Ежедневный осмотр — ${row.equipmentName}`,
      subtitle: row.issuesCount > 0 ? `${row.issuesCount} замеч.` : "Без замечаний",
      status: row.status,
      statusLabel: row.workingStatus ?? row.status,
      occurredAt: row.inspectionDate.toISOString(),
      actor: row.inspectedBy,
      href: `/daily-inspection-new?inspection=${row.id}`,
      links: [],
    });
  }

  for (const row of budgetRows) {
    const links: EquipmentActivityLink[] = [];
    if (row.serviceRequestId) {
      links.push({ type: "service_request", id: row.serviceRequestId, label: "Сервисная заявка" });
    }
    if (row.taskId) links.push({ type: "task", id: row.taskId, label: "Задача" });
    if (row.maintenanceRecordId) {
      links.push({ type: "maintenance", id: row.maintenanceRecordId, label: "ТО" });
    }
    items.push({
      id: `budget-${row.id}`,
      category: "budget",
      entityId: row.id,
      title: row.title,
      subtitle: `${row.amount.toLocaleString("ru")} ${row.currency}`,
      status: row.category,
      statusLabel: row.category,
      occurredAt: new Date(row.expenseDate).toISOString(),
      actor: row.createdByName ?? undefined,
      href: `/budget?entry=${row.id}`,
      links,
    });
  }

  for (const row of eventRows) {
    const item = mapEventRowToActivityItem(row);
    if (item) items.push(item);
  }

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return items;
}
