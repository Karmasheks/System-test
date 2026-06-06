import { db } from "./db";
import { storage } from "./storage";
import {
  partReservations,
  warehouseMovements,
  type PartReservation,
  type WarehouseMovement,
  type WarehousePart,
} from "@shared/schema";
import { createBudgetEntry, getBudgetEntryById } from "./asset-management-storage";
import { listTasksForServiceRequest } from "./task-orchestration-service";
import { and, eq } from "drizzle-orm";
import type { LinkedWorkItem } from "@shared/warehouse-linked-work";

type AuthUser = { id: number; name: string };

export type EnrichedWarehouseMovement = WarehouseMovement & {
  resolvedTaskTitle?: string | null;
  linkedWork: LinkedWorkItem[];
};

export type EnrichedPartReservation = PartReservation & {
  linkedWork: LinkedWorkItem[];
};

function isValidEquipmentId(equipmentId: string | null | undefined): equipmentId is string {
  return !!equipmentId && equipmentId !== "UNKNOWN";
}

async function loadTaskTitle(taskId: number | null | undefined): Promise<string | null> {
  if (!taskId) return null;
  const task = await storage.getTask(taskId);
  return task?.title ?? null;
}

function uniqueLinkedWork(items: LinkedWorkItem[]): LinkedWorkItem[] {
  const seen = new Set<string>();
  const result: LinkedWorkItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function buildLinkedWork(params: {
  taskId?: number | null;
  taskTitle?: string | null;
  serviceRequestId?: number | null;
  maintenanceId?: number | null;
}): Promise<{ taskId: number | null; taskTitle: string | null; linkedWork: LinkedWorkItem[] }> {
  let taskId = params.taskId ?? null;
  let taskTitle = params.taskTitle ?? null;
  const linkedWork: LinkedWorkItem[] = [];

  if (taskId) {
    if (!taskTitle) taskTitle = await loadTaskTitle(taskId);
    linkedWork.push({
      type: "task",
      id: taskId,
      title: taskTitle ?? `Задача #${taskId}`,
    });
  }

  if (params.serviceRequestId) {
    linkedWork.push({
      type: "service_request",
      id: params.serviceRequestId,
      title: `Заявка #${params.serviceRequestId}`,
    });

    const srTasks = await listTasksForServiceRequest(params.serviceRequestId);
    for (const task of srTasks) {
      linkedWork.push({ type: "task", id: task.id, title: task.title });
      if (!taskId) {
        taskId = task.id;
        taskTitle = task.title;
      }
    }
  }

  if (params.maintenanceId) {
    linkedWork.push({
      type: "maintenance",
      id: params.maintenanceId,
      title: `ТО #${params.maintenanceId}`,
    });
  }

  return {
    taskId,
    taskTitle,
    linkedWork: uniqueLinkedWork(linkedWork),
  };
}

export async function enrichWarehouseMovement(
  movement: WarehouseMovement
): Promise<EnrichedWarehouseMovement> {
  let taskId = movement.taskId;
  let taskTitle = movement.taskTitle;
  let serviceRequestId = movement.serviceRequestId;
  let maintenanceId = movement.maintenanceId;
  let equipmentId = movement.equipmentId;
  let equipmentName = movement.equipmentName;

  if (movement.reservationId) {
    const [reservation] = await db
      .select()
      .from(partReservations)
      .where(eq(partReservations.id, movement.reservationId))
      .limit(1);

    if (reservation) {
      taskId = taskId ?? reservation.taskId;
      serviceRequestId = serviceRequestId ?? reservation.serviceRequestId;
      maintenanceId = maintenanceId ?? reservation.maintenanceId;
      if (!isValidEquipmentId(equipmentId)) {
        equipmentId = reservation.equipmentId;
        equipmentName = reservation.equipmentName;
      }
    }
  }

  if (movement.budgetEntryId && !taskId) {
    const budget = await getBudgetEntryById(movement.budgetEntryId);
    if (budget) {
      taskId = budget.taskId ?? taskId;
      serviceRequestId = budget.serviceRequestId ?? serviceRequestId;
      maintenanceId = budget.maintenanceRecordId ?? maintenanceId;
    }
  }

  const linked = await buildLinkedWork({ taskId, taskTitle, serviceRequestId, maintenanceId });

  return {
    ...movement,
    taskId: linked.taskId,
    taskTitle: linked.taskTitle,
    serviceRequestId,
    maintenanceId,
    equipmentId,
    equipmentName,
    resolvedTaskTitle: linked.taskTitle,
    linkedWork: linked.linkedWork,
  };
}

export async function enrichWarehouseMovements(
  movements: WarehouseMovement[]
): Promise<EnrichedWarehouseMovement[]> {
  return Promise.all(movements.map(enrichWarehouseMovement));
}

export async function enrichPartReservation(
  reservation: PartReservation
): Promise<EnrichedPartReservation> {
  const linked = await buildLinkedWork({
    taskId: reservation.taskId,
    serviceRequestId: reservation.serviceRequestId,
    maintenanceId: reservation.maintenanceId,
  });

  return {
    ...reservation,
    taskId: linked.taskId,
    linkedWork: linked.linkedWork,
  };
}

export async function listEnrichedPartReservations(partId: number): Promise<EnrichedPartReservation[]> {
  const rows = await db
    .select()
    .from(partReservations)
    .where(and(eq(partReservations.partId, partId), eq(partReservations.status, "reserved")))
    .orderBy(partReservations.createdAt);

  return Promise.all(rows.map(enrichPartReservation));
}

export async function recordWriteOffBudgetEntry(
  movement: WarehouseMovement,
  part: WarehousePart,
  user: AuthUser
): Promise<number | null> {
  if (movement.type !== "out") return null;
  if (movement.budgetEntryId) return movement.budgetEntryId;

  const enriched = await enrichWarehouseMovement(movement);
  if (!isValidEquipmentId(enriched.equipmentId)) return null;

  const amount = Math.round((part.unitCost ?? 0) * enriched.quantity * 100) / 100;
  const title = `Списание: ${part.name} (${enriched.quantity} шт.)`;

  const entry = await createBudgetEntry({
    title,
    amount,
    currency: "RUB",
    category: "parts",
    equipmentId: enriched.equipmentId,
    equipmentName: enriched.equipmentName ?? enriched.equipmentId,
    taskId: enriched.taskId ?? null,
    serviceRequestId: enriched.serviceRequestId ?? null,
    maintenanceRecordId: enriched.maintenanceId ?? null,
    warehousePartId: part.id,
    expenseDate: new Date().toISOString().slice(0, 10),
    notes: enriched.comment ?? enriched.destination ?? null,
    createdById: user.id,
    createdByName: user.name,
  });

  await db
    .update(warehouseMovements)
    .set({ budgetEntryId: entry.id })
    .where(eq(warehouseMovements.id, movement.id));

  return entry.id;
}

/** Создаёт расходы для старых списаний без budgetEntryId. */
export async function backfillWriteOffBudgetEntries(
  movements: WarehouseMovement[],
  part: WarehousePart
): Promise<void> {
  for (const movement of movements) {
    if (movement.type !== "out" || movement.budgetEntryId) continue;
    const enriched = await enrichWarehouseMovement(movement);
    if (!isValidEquipmentId(enriched.equipmentId)) continue;

    await recordWriteOffBudgetEntry(enriched, part, {
      id: movement.performedById,
      name: movement.performedByName,
    });
  }
}
