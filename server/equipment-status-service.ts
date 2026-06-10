import { storage } from "./storage";
import {
  logEquipmentStatusChange,
  type EquipmentEventActor,
} from "./equipment-event-log";

const MAINTENANCE_TASK_TYPES = new Set(["maintenance"]);
const REPAIR_TASK_TYPES = new Set(["repair", "diagnostics"]);
const OPEN_TASK_STATUSES = new Set(["pending", "in_progress", "overdue"]);

/** Синхронизирует operational-статус оборудования по открытым задачам ТО/ремонта/диагностики. */
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
  const openWorkTasks = tasks.filter(
    (t) =>
      OPEN_TASK_STATUSES.has(t.status) &&
      (MAINTENANCE_TASK_TYPES.has(t.taskType ?? "") || REPAIR_TASK_TYPES.has(t.taskType ?? ""))
  );
  const hasOpenRepair = openWorkTasks.some((t) => REPAIR_TASK_TYPES.has(t.taskType ?? ""));
  const hasOpenMaintenance = openWorkTasks.some((t) =>
    MAINTENANCE_TASK_TYPES.has(t.taskType ?? "")
  );
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
