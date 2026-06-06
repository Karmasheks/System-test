import { db } from "./db";
import {
  partReservations,
  warehouseParts,
  warehouseMovements,
  requestParts,
  type PartReservation,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getWarehousePart } from "./warehouse-storage";
import {
  enrichWarehouseMovement,
  recordWriteOffBudgetEntry,
} from "./warehouse-writeoff-service";
import { storage } from "./storage";

type AuthUser = { id: number; name: string };

type ReserveLink = {
  taskId?: number;
  taskTitle?: string;
  maintenanceId?: number;
  serviceRequestId?: number;
  serviceRequestTitle?: string;
  equipmentId?: string;
  equipmentName?: string;
};

export async function reservePartForWork(
  partId: number,
  quantity: number,
  user: AuthUser,
  link: ReserveLink
): Promise<PartReservation> {
  const part = await getWarehousePart(partId);
  if (!part) throw new Error("Запчасть не найдена");

  const available = (part.quantity ?? 0) - (part.reservedQuantity ?? 0);
  if (quantity > available) {
    throw new Error(`Недостаточно свободного остатка (доступно: ${available})`);
  }

  const [reservation] = await db
    .insert(partReservations)
    .values({
      partId,
      partName: part.name,
      quantity,
      taskId: link.taskId ?? null,
      maintenanceId: link.maintenanceId ?? null,
      serviceRequestId: link.serviceRequestId ?? null,
      equipmentId: link.equipmentId ?? null,
      equipmentName: link.equipmentName ?? null,
      createdById: user.id,
      createdByName: user.name,
    })
    .returning();

  await db
    .update(warehouseParts)
    .set({
      reservedQuantity: (part.reservedQuantity ?? 0) + quantity,
      updatedAt: new Date(),
    })
    .where(eq(warehouseParts.id, partId));

  const comment = link.taskTitle
    ? `Резерв для задачи: ${link.taskTitle}`
    : link.serviceRequestTitle
      ? `Резерв для ${link.serviceRequestTitle}`
      : link.maintenanceId
        ? `Резерв для ТО #${link.maintenanceId}`
        : "Резерв под работу";

  await db.insert(warehouseMovements).values({
    partId,
    type: "reserve",
    quantity,
    taskId: link.taskId ?? null,
    taskTitle: link.taskTitle ?? null,
    maintenanceId: link.maintenanceId ?? null,
    serviceRequestId: link.serviceRequestId ?? null,
    reservationId: reservation.id,
    equipmentId: link.equipmentId ?? null,
    equipmentName: link.equipmentName ?? null,
    comment,
    performedById: user.id,
    performedByName: user.name,
  });

  return reservation;
}

async function issueSingleReservation(
  reservation: PartReservation,
  user: AuthUser,
  taskTitle?: string
) {
  const part = await getWarehousePart(reservation.partId);
  if (!part) throw new Error("Запчасть не найдена");

  const newQty = (part.quantity ?? 0) - reservation.quantity;
  const newReserved = (part.reservedQuantity ?? 0) - reservation.quantity;
  if (newQty < 0) throw new Error(`Недостаточно «${part.name}» на складе для списания`);

  await db
    .update(warehouseParts)
    .set({
      quantity: newQty,
      reservedQuantity: Math.max(0, newReserved),
      updatedAt: new Date(),
    })
    .where(eq(warehouseParts.id, reservation.partId));

  await db
    .update(partReservations)
    .set({
      status: "issued",
      issuedAt: new Date(),
      issuedById: user.id,
      issuedByName: user.name,
    })
    .where(eq(partReservations.id, reservation.id));

  const title = taskTitle ?? reservation.partName;
  let resolvedTaskTitle = taskTitle ?? null;
  if (reservation.taskId && !resolvedTaskTitle) {
    const task = await storage.getTask(reservation.taskId);
    resolvedTaskTitle = task?.title ?? null;
  }

  const [movement] = await db.insert(warehouseMovements).values({
    partId: reservation.partId,
    type: "out",
    quantity: reservation.quantity,
    taskId: reservation.taskId,
    taskTitle: resolvedTaskTitle,
    maintenanceId: reservation.maintenanceId,
    reservationId: reservation.id,
    equipmentId: reservation.equipmentId,
    equipmentName: reservation.equipmentName,
    comment: reservation.taskId
      ? `Списание по задаче: ${resolvedTaskTitle ?? title}`
      : reservation.serviceRequestId
        ? `Списание по заявке #${reservation.serviceRequestId}`
        : reservation.maintenanceId
          ? `Списание по ТО #${reservation.maintenanceId}`
          : "Списание по резерву",
    performedById: user.id,
    performedByName: user.name,
    serviceRequestId: reservation.serviceRequestId,
  }).returning();

  if (part) {
    await recordWriteOffBudgetEntry(movement, part, user);
  }
}

export async function issueTaskReservations(
  taskId: number,
  user: AuthUser,
  taskTitle: string
) {
  const reservations = await db
    .select()
    .from(partReservations)
    .where(and(eq(partReservations.taskId, taskId), eq(partReservations.status, "reserved")));

  for (const r of reservations) {
    await issueSingleReservation(r, user, taskTitle);
  }
  return reservations.length;
}

export async function issueMaintenanceReservations(
  maintenanceId: number,
  user: AuthUser
) {
  const reservations = await db
    .select()
    .from(partReservations)
    .where(
      and(eq(partReservations.maintenanceId, maintenanceId), eq(partReservations.status, "reserved"))
    );

  for (const r of reservations) {
    await issueSingleReservation(r, user);
  }
  return reservations.length;
}

export async function cancelTaskReservations(taskId: number) {
  const reservations = await db
    .select()
    .from(partReservations)
    .where(and(eq(partReservations.taskId, taskId), eq(partReservations.status, "reserved")));

  for (const r of reservations) {
    await cancelSingleReservation(r);
  }
}

export async function cancelMaintenanceReservations(maintenanceId: number) {
  const reservations = await db
    .select()
    .from(partReservations)
    .where(
      and(eq(partReservations.maintenanceId, maintenanceId), eq(partReservations.status, "reserved"))
    );

  for (const r of reservations) {
    await cancelSingleReservation(r);
  }
}

async function cancelSingleReservation(reservation: PartReservation) {
  const part = await getWarehousePart(reservation.partId);
  if (!part) return;

  await db
    .update(warehouseParts)
    .set({
      reservedQuantity: Math.max(0, (part.reservedQuantity ?? 0) - reservation.quantity),
      updatedAt: new Date(),
    })
    .where(eq(warehouseParts.id, reservation.partId));

  await db
    .update(partReservations)
    .set({ status: "cancelled" })
    .where(eq(partReservations.id, reservation.id));
}

export async function listTaskReservations(taskId: number) {
  return db
    .select()
    .from(partReservations)
    .where(eq(partReservations.taskId, taskId))
    .orderBy(desc(partReservations.createdAt));
}

export async function listMaintenanceReservations(maintenanceId: number) {
  return db
    .select()
    .from(partReservations)
    .where(eq(partReservations.maintenanceId, maintenanceId))
    .orderBy(desc(partReservations.createdAt));
}

export async function listServiceRequestReservations(serviceRequestId: number) {
  return db
    .select()
    .from(partReservations)
    .where(eq(partReservations.serviceRequestId, serviceRequestId))
    .orderBy(desc(partReservations.createdAt));
}

export async function issueServiceRequestReservations(
  serviceRequestId: number,
  user: AuthUser
) {
  const reservations = await db
    .select()
    .from(partReservations)
    .where(
      and(
        eq(partReservations.serviceRequestId, serviceRequestId),
        eq(partReservations.status, "reserved")
      )
    );

  for (const r of reservations) {
    await issueSingleReservation(r, user, `Заявка #${serviceRequestId}`);
    await db
      .update(requestParts)
      .set({ status: "used", quantityUsed: r.quantity })
      .where(eq(requestParts.reservationId, r.id));
  }
  return reservations.length;
}

export async function cancelServiceRequestReservations(serviceRequestId: number) {
  const reservations = await db
    .select()
    .from(partReservations)
    .where(
      and(
        eq(partReservations.serviceRequestId, serviceRequestId),
        eq(partReservations.status, "reserved")
      )
    );

  for (const r of reservations) {
    await cancelSingleReservation(r);
    await db
      .update(requestParts)
      .set({ reservationId: null })
      .where(eq(requestParts.reservationId, r.id));
  }
}

const SR_CANCEL_STATUSES = new Set(["cancelled", "not_needed", "duplicate"]);

export async function handleServiceRequestWarehouseTransition(
  serviceRequestId: number,
  toStatus: string,
  user: AuthUser
) {
  if (toStatus === "closed") {
    return issueServiceRequestReservations(serviceRequestId, user);
  }
  if (SR_CANCEL_STATUSES.has(toStatus)) {
    await cancelServiceRequestReservations(serviceRequestId);
  }
  return 0;
}

/** Списать резервы заявок, закрытых до интеграции списания при закрытии */
export async function backfillClosedServiceRequestReservations(): Promise<number> {
  const { serviceRequests } = await import("@shared/schema");
  const closed = await db
    .select({ id: serviceRequests.id })
    .from(serviceRequests)
    .where(eq(serviceRequests.status, "closed"));

  let issued = 0;
  for (const { id } of closed) {
    const count = await issueServiceRequestReservations(id, {
      id: 1,
      name: "System",
    });
    issued += count;
  }
  return issued;
}

export async function listRecentWarehouseActivity(limit = 50) {
  const movements = await db
    .select()
    .from(warehouseMovements)
    .orderBy(desc(warehouseMovements.createdAt))
    .limit(limit);

  const enriched = [];
  for (const m of movements) {
    const part = await getWarehousePart(m.partId);
    if (part && m.type === "out" && !m.budgetEntryId) {
      await recordWriteOffBudgetEntry(m, part, {
        id: m.performedById,
        name: m.performedByName,
      });
    }
    const [refreshed] = await db
      .select()
      .from(warehouseMovements)
      .where(eq(warehouseMovements.id, m.id))
      .limit(1);
    const movement = await enrichWarehouseMovement(refreshed ?? m);
    enriched.push({ ...movement, partName: part?.name ?? "—" });
  }
  return enriched;
}
