import { storage } from "./storage";
import {
  logEquipmentStatusChange,
  type EquipmentEventActor,
} from "./equipment-event-log";

const WORK_TASK_TYPES = new Set(["maintenance", "repair", "diagnostics"]);
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
  const hasOpenWork = tasks.some(
    (t) =>
      WORK_TASK_TYPES.has(t.taskType ?? "") && OPEN_TASK_STATUSES.has(t.status)
  );

  let targetStatus: string | null = null;
  if (hasOpenWork) {
    targetStatus = "maintenance";
  } else if (item.status === "maintenance") {
    targetStatus = "active";
  }

  if (!targetStatus || item.status === targetStatus) return;

  await storage.updateEquipment(equipmentId, { status: targetStatus });
  await logEquipmentStatusChange(equipmentId, item.status, targetStatus, actor);
}
