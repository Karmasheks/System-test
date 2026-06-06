import { db } from "./db";
import { equipment, users, warehouseParts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getSubdivisionById, resolveSubdivisionFields } from "./subdivision-service";
import { appendEquipmentEvent, type EquipmentEventActor } from "./equipment-event-log";
import { equipmentStatusLabel } from "@shared/equipment-utils";

async function subdivisionFields(id: number) {
  const row = await getSubdivisionById(id);
  if (!row || !row.isActive) throw new Error("Подразделение не найдено");
  return { subdivisionId: row.id, subdivisionName: row.name };
}

export async function transferEquipmentSubdivision(
  equipmentId: string,
  targetSubdivisionId: number,
  actor: EquipmentEventActor
) {
  const [equipRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!equipRow) throw new Error("Оборудование не найдено");

  const target = await subdivisionFields(targetSubdivisionId);
  const fromName = equipRow.subdivisionName ?? "—";

  await db
    .update(equipment)
    .set({
      subdivisionId: target.subdivisionId,
      subdivisionName: target.subdivisionName,
      department: target.subdivisionName,
      homeSubdivisionId: target.subdivisionId,
      homeSubdivisionName: target.subdivisionName,
      repairSubdivisionId: null,
      repairSubdivisionName: null,
    })
    .where(eq(equipment.id, equipmentId));

  await appendEquipmentEvent({
    equipmentId,
    eventType: "subdivision_transferred",
    description: `Перенос: ${fromName} → ${target.subdivisionName}`,
    oldValue: fromName,
    newValue: target.subdivisionName,
    actor,
  });

  return { ok: true, equipmentId, ...target };
}

export async function transferWarehousePartSubdivision(
  partId: number,
  targetSubdivisionId: number,
  actor: EquipmentEventActor
) {
  const [part] = await db.select().from(warehouseParts).where(eq(warehouseParts.id, partId)).limit(1);
  if (!part) throw new Error("Запчасть не найдена");

  const target = await subdivisionFields(targetSubdivisionId);

  await db
    .update(warehouseParts)
    .set({
      subdivisionId: target.subdivisionId,
      subdivisionName: target.subdivisionName,
      updatedAt: new Date(),
    })
    .where(eq(warehouseParts.id, partId));

  return { ok: true, partId, partName: part.name, ...target, actorName: actor.name };
}

export async function transferUserSubdivision(userId: number, targetSubdivisionId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new Error("Пользователь не найден");
  if (u.role === "admin") throw new Error("Нельзя переносить системного администратора");

  const target = await subdivisionFields(targetSubdivisionId);

  const [updated] = await db
    .update(users)
    .set({
      subdivisionId: target.subdivisionId,
      department: target.subdivisionName,
    })
    .where(eq(users.id, userId))
    .returning();

  return { ok: true, userId, userName: updated.name, ...target };
}

export async function sendEquipmentForRepair(
  equipmentId: string,
  repairSubdivisionId: number,
  actor: EquipmentEventActor,
  comment?: string
) {
  const [equipRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!equipRow) throw new Error("Оборудование не найдено");

  const repair = await subdivisionFields(repairSubdivisionId);
  const homeId = equipRow.homeSubdivisionId ?? equipRow.subdivisionId;
  const homeName =
    equipRow.homeSubdivisionName ??
    equipRow.subdivisionName ??
    (homeId ? (await getSubdivisionById(homeId))?.name : null);

  if (homeId === repair.subdivisionId) {
    throw new Error("Оборудование уже в этом подразделении — укажите другое для ремонта");
  }

  const oldStatus = equipRow.status;

  await db
    .update(equipment)
    .set({
      status: "maintenance",
      homeSubdivisionId: homeId,
      homeSubdivisionName: homeName,
      repairSubdivisionId: repair.subdivisionId,
      repairSubdivisionName: repair.subdivisionName,
      subdivisionId: repair.subdivisionId,
      subdivisionName: repair.subdivisionName,
      department: repair.subdivisionName,
    })
    .where(eq(equipment.id, equipmentId));

  await appendEquipmentEvent({
    equipmentId,
    eventType: "repair_sent",
    description: `Отправлено на ремонт в «${repair.subdivisionName}»${homeName ? ` (из «${homeName}»)` : ""}`,
    oldValue: homeName ?? undefined,
    newValue: repair.subdivisionName,
    note: comment?.trim() || null,
    actor,
  });

  if (oldStatus !== "maintenance") {
    await appendEquipmentEvent({
      equipmentId,
      eventType: "status_changed",
      description: `Статус: ${equipmentStatusLabel(oldStatus)} → ${equipmentStatusLabel("maintenance")}`,
      oldValue: equipmentStatusLabel(oldStatus),
      newValue: equipmentStatusLabel("maintenance"),
      actor,
    });
  }

  return { ok: true, equipmentId, repairSubdivisionId: repair.subdivisionId, homeSubdivisionId: homeId };
}

export async function returnEquipmentFromRepair(equipmentId: string, actor: EquipmentEventActor) {
  const [equipRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!equipRow) throw new Error("Оборудование не найдено");

  const homeId = equipRow.homeSubdivisionId ?? equipRow.subdivisionId;
  if (!homeId) throw new Error("Не указано подразделение для возврата");

  const home = await resolveSubdivisionFields(homeId, equipRow.homeSubdivisionName);
  if (!home.subdivisionId) throw new Error("Домашнее подразделение не найдено");

  const fromName = equipRow.subdivisionName ?? "—";
  const oldStatus = equipRow.status;

  await db
    .update(equipment)
    .set({
      status: "active",
      subdivisionId: home.subdivisionId,
      subdivisionName: home.subdivisionName,
      department: home.subdivisionName ?? equipRow.department,
      repairSubdivisionId: null,
      repairSubdivisionName: null,
    })
    .where(eq(equipment.id, equipmentId));

  await appendEquipmentEvent({
    equipmentId,
    eventType: "repair_returned",
    description: `Возврат с ремонта: ${fromName} → ${home.subdivisionName}`,
    oldValue: fromName,
    newValue: home.subdivisionName ?? undefined,
    actor,
  });

  if (oldStatus !== "active") {
    await appendEquipmentEvent({
      equipmentId,
      eventType: "status_changed",
      description: `Статус: ${equipmentStatusLabel(oldStatus)} → ${equipmentStatusLabel("active")}`,
      oldValue: equipmentStatusLabel(oldStatus),
      newValue: equipmentStatusLabel("active"),
      actor,
    });
  }

  return { ok: true, equipmentId, subdivisionId: home.subdivisionId };
}
