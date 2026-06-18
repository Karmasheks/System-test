import { eq } from "drizzle-orm";
import { db } from "./db";
import { maintenanceRecords } from "@shared/schema";
import { storage } from "./storage";
import {
  logEquipmentStatusChange,
  type EquipmentEventActor,
} from "./equipment-event-log";

const MAINTENANCE_TASK_TYPES = new Set(["maintenance"]);
const REPAIR_TASK_TYPES = new Set(["repair", "diagnostics"]);
const OPEN_TASK_STATUSES = new Set(["pending", "in_progress", "overdue"]);

/** Статусы записи ТО, при которых станок может быть «на ТО» (не завершено/не отменено). */
const ACTIVE_MAINTENANCE_RECORD_STATUSES = new Set([
  "scheduled",
  "in_progress",
  "overdue",
  "unplanned",
  "postponed",
]);

function startOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isMaintenanceRecordAffectingStatus(
  record: typeof maintenanceRecords.$inferSelect,
  todayMs: number
): boolean {
  if (!ACTIVE_MAINTENANCE_RECORD_STATUSES.has(record.status)) return false;
  if (record.status === "in_progress") return true;
  return startOfDayMs(new Date(record.scheduledDate)) <= todayMs;
}

function isMaintenanceTaskAffectingStatus(
  task: {
    status: string;
    taskType: string | null;
    dueDate: Date | null;
    maintenanceId: number | null;
    sourceType: string;
    sourceId: number | null;
  },
  todayMs: number,
  maintById: Map<number, typeof maintenanceRecords.$inferSelect>
): boolean {
  if (!OPEN_TASK_STATUSES.has(task.status)) return false;
  if (!MAINTENANCE_TASK_TYPES.has(task.taskType ?? "")) return false;

  const maintId =
    task.maintenanceId ??
    (task.sourceType === "maintenance" && task.sourceId != null ? task.sourceId : null);

  if (maintId != null) {
    const record = maintById.get(maintId);
    if (record) return isMaintenanceRecordAffectingStatus(record, todayMs);
  }

  // Задача без связи с календарём — только если срок уже наступил
  if (!task.dueDate) return false;
  return startOfDayMs(new Date(task.dueDate)) <= todayMs;
}

/** Синхронизирует operational-статус оборудования по активным работам ТО/ремонта. */
export async function syncEquipmentOperationalStatus(
  equipmentId: string | null | undefined,
  actor?: EquipmentEventActor,
  reason?: string
): Promise<void> {
  if (!equipmentId?.trim()) return;

  const item = await storage.getEquipment(equipmentId);
  if (!item) return;
  if (item.status === "decommissioned") return;

  const tasks = await storage.getTasksByEquipmentId(equipmentId);
  const maintRecords = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.equipmentId, equipmentId));
  const maintById = new Map(maintRecords.map((r) => [r.id, r]));
  const todayMs = startOfDayMs(new Date());

  const openWorkTasks = tasks.filter(
    (t) =>
      OPEN_TASK_STATUSES.has(t.status) &&
      (MAINTENANCE_TASK_TYPES.has(t.taskType ?? "") || REPAIR_TASK_TYPES.has(t.taskType ?? ""))
  );
  const hasOpenRepair = openWorkTasks.some((t) => REPAIR_TASK_TYPES.has(t.taskType ?? ""));
  const hasOpenMaintenance =
    maintRecords.some((r) => isMaintenanceRecordAffectingStatus(r, todayMs)) ||
    tasks.some((t) => isMaintenanceTaskAffectingStatus(t, todayMs, maintById));
  const onRepairSubdivision = item.repairSubdivisionId != null;

  let targetStatus: string | null = null;
  if (hasOpenRepair || onRepairSubdivision) {
    targetStatus = "repair";
  } else if (hasOpenMaintenance) {
    targetStatus = "maintenance";
  } else if (item.status === "maintenance" || item.status === "repair") {
    targetStatus = "active";
  }

  if (!targetStatus || item.status === targetStatus) return;

  await storage.updateEquipment(equipmentId, { status: targetStatus });
  await logEquipmentStatusChange(equipmentId, item.status, targetStatus, actor);
}
