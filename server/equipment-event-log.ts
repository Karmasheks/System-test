import { db } from "./db";
import { equipment, equipmentEventLog, equipmentLinks } from "@shared/schema";
import { equipmentLinkTypeLabel } from "@shared/equipment-link-constants";
import {
  equipmentStatusLabel,
  formatEquipmentLocation,
} from "@shared/equipment-utils";
import { and, eq, inArray } from "drizzle-orm";

export interface EquipmentEventActor {
  id: number;
  name: string;
}

export type EquipmentEventType =
  | "link_added"
  | "link_removed"
  | "link_updated"
  | "status_changed"
  | "location_changed"
  | "subdivision_transferred"
  | "repair_sent"
  | "repair_returned";

interface AppendEquipmentEventInput {
  equipmentId: string;
  eventType: EquipmentEventType;
  description: string;
  relatedEquipmentId?: string | null;
  relatedEquipmentName?: string | null;
  linkType?: string | null;
  note?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  actor?: EquipmentEventActor;
  createdAt?: Date;
}

export async function appendEquipmentEvent(input: AppendEquipmentEventInput): Promise<void> {
  await db.insert(equipmentEventLog).values({
    equipmentId: input.equipmentId,
    eventType: input.eventType,
    description: input.description,
    relatedEquipmentId: input.relatedEquipmentId ?? null,
    relatedEquipmentName: input.relatedEquipmentName ?? null,
    linkType: input.linkType ?? null,
    note: input.note ?? null,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    actorId: input.actor?.id ?? null,
    actorName: input.actor?.name ?? null,
    createdAt: input.createdAt ?? new Date(),
  });
}

export async function getEquipmentEventsForEquipment(equipmentId: string) {
  return db
    .select()
    .from(equipmentEventLog)
    .where(eq(equipmentEventLog.equipmentId, equipmentId));
}

export async function getEquipmentLinkEventsForEquipment(equipmentId: string) {
  return db
    .select()
    .from(equipmentEventLog)
    .where(
      and(
        eq(equipmentEventLog.equipmentId, equipmentId),
        inArray(equipmentEventLog.eventType, ["link_added", "link_removed", "link_updated"])
      )
    );
}

let linkBackfillDone = false;

/** Создаёт записи link_added для связей, добавленных до появления журнала. */
export async function backfillMissingLinkEvents(): Promise<void> {
  if (linkBackfillDone) return;

  const allLinks = await db.select().from(equipmentLinks);
  if (allLinks.length === 0) {
    linkBackfillDone = true;
    return;
  }

  const names = await loadEquipmentNames([
    ...allLinks.map((link) => link.equipmentId),
    ...allLinks.map((link) => link.linkedEquipmentId),
  ]);

  for (const link of allLinks) {
    const existing = await db
      .select({ id: equipmentEventLog.id })
      .from(equipmentEventLog)
      .where(
        and(
          eq(equipmentEventLog.equipmentId, link.equipmentId),
          eq(equipmentEventLog.eventType, "link_added"),
          eq(equipmentEventLog.relatedEquipmentId, link.linkedEquipmentId)
        )
      )
      .limit(1);

    if (existing[0]) continue;

    const ownerName = names.get(link.equipmentId) ?? link.equipmentId;
    const otherName = names.get(link.linkedEquipmentId) ?? link.linkedEquipmentId;
    const createdAt = link.createdAt ?? new Date();

    await appendEquipmentEvent({
      equipmentId: link.equipmentId,
      eventType: "link_added",
      description: linkDescription(
        "added",
        otherName,
        link.linkedEquipmentId,
        link.linkType,
        link.note
      ),
      relatedEquipmentId: link.linkedEquipmentId,
      relatedEquipmentName: otherName,
      linkType: link.linkType,
      note: link.note,
      actor: { id: 0, name: "Система (архив)" },
      createdAt,
    });

    await appendEquipmentEvent({
      equipmentId: link.linkedEquipmentId,
      eventType: "link_added",
      description: linkDescription(
        "added",
        ownerName,
        link.equipmentId,
        link.linkType,
        link.note
      ),
      relatedEquipmentId: link.equipmentId,
      relatedEquipmentName: ownerName,
      linkType: link.linkType,
      note: link.note,
      actor: { id: 0, name: "Система (архив)" },
      createdAt,
    });
  }

  linkBackfillDone = true;
}

interface LinkSnapshot {
  otherEquipmentId: string;
  linkType: string;
  note: string | null;
}

async function loadEquipmentNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db
    .select({ id: equipment.id, name: equipment.name })
    .from(equipment)
    .where(inArray(equipment.id, uniqueIds));

  return new Map(rows.map((row) => [row.id, row.name]));
}

function linkDescription(
  action: "added" | "removed" | "updated",
  otherName: string,
  otherId: string,
  linkType: string,
  note: string | null
): string {
  const typeLabel = equipmentLinkTypeLabel(linkType);
  const notePart = note ? ` (${note})` : "";
  switch (action) {
    case "added":
      return `Добавлена связь с «${otherName}» (${otherId}): ${typeLabel}${notePart}`;
    case "removed":
      return `Удалена связь с «${otherName}» (${otherId}): ${typeLabel}${notePart}`;
    case "updated":
      return `Изменена связь с «${otherName}» (${otherId}): ${typeLabel}${notePart}`;
  }
}

async function logLinkEventForBothSides(params: {
  equipmentId: string;
  equipmentName: string;
  otherEquipmentId: string;
  otherEquipmentName: string;
  eventType: Extract<EquipmentEventType, "link_added" | "link_removed" | "link_updated">;
  linkType: string;
  note: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  actor?: EquipmentEventActor;
}): Promise<void> {
  const {
    equipmentId,
    equipmentName,
    otherEquipmentId,
    otherEquipmentName,
    eventType,
    linkType,
    note,
    oldValue,
    newValue,
    actor,
  } = params;

  const action =
    eventType === "link_added" ? "added" : eventType === "link_removed" ? "removed" : "updated";

  await appendEquipmentEvent({
    equipmentId,
    eventType,
    description: linkDescription(action, otherEquipmentName, otherEquipmentId, linkType, note),
    relatedEquipmentId: otherEquipmentId,
    relatedEquipmentName: otherEquipmentName,
    linkType,
    note,
    oldValue,
    newValue,
    actor,
  });

  await appendEquipmentEvent({
    equipmentId: otherEquipmentId,
    eventType,
    description: linkDescription(action, equipmentName, equipmentId, linkType, note),
    relatedEquipmentId: equipmentId,
    relatedEquipmentName: equipmentName,
    linkType,
    note,
    oldValue,
    newValue,
    actor,
  });
}

export async function logEquipmentLinkChanges(
  equipmentId: string,
  equipmentName: string,
  oldLinks: LinkSnapshot[],
  newLinks: LinkSnapshot[],
  actor?: EquipmentEventActor
): Promise<void> {
  const oldMap = new Map(oldLinks.map((link) => [link.otherEquipmentId, link]));
  const newMap = new Map(newLinks.map((link) => [link.otherEquipmentId, link]));

  const involvedIds = [
    equipmentId,
    ...oldLinks.map((link) => link.otherEquipmentId),
    ...newLinks.map((link) => link.otherEquipmentId),
  ];
  const names = await loadEquipmentNames(involvedIds);

  for (const [otherId, oldLink] of oldMap) {
    const newLink = newMap.get(otherId);
    const otherName = names.get(otherId) ?? otherId;

    if (!newLink) {
      await logLinkEventForBothSides({
        equipmentId,
        equipmentName,
        otherEquipmentId: otherId,
        otherEquipmentName: otherName,
        eventType: "link_removed",
        linkType: oldLink.linkType,
        note: oldLink.note,
        actor,
      });
      continue;
    }

    if (newLink.linkType !== oldLink.linkType || newLink.note !== oldLink.note) {
      await logLinkEventForBothSides({
        equipmentId,
        equipmentName,
        otherEquipmentId: otherId,
        otherEquipmentName: otherName,
        eventType: "link_updated",
        linkType: newLink.linkType,
        note: newLink.note,
        oldValue: `${oldLink.linkType}:${oldLink.note ?? ""}`,
        newValue: `${newLink.linkType}:${newLink.note ?? ""}`,
        actor,
      });
    }
  }

  for (const [otherId, newLink] of newMap) {
    if (oldMap.has(otherId)) continue;

    const otherName = names.get(otherId) ?? otherId;
    await logLinkEventForBothSides({
      equipmentId,
      equipmentName,
      otherEquipmentId: otherId,
      otherEquipmentName: otherName,
      eventType: "link_added",
      linkType: newLink.linkType,
      note: newLink.note,
      actor,
    });
  }
}

export async function logEquipmentStatusChange(
  equipmentId: string,
  oldStatus: string,
  newStatus: string,
  actor?: EquipmentEventActor
): Promise<void> {
  if (oldStatus === newStatus) return;

  await appendEquipmentEvent({
    equipmentId,
    eventType: "status_changed",
    description: `Статус изменён: ${equipmentStatusLabel(oldStatus)} → ${equipmentStatusLabel(newStatus)}`,
    oldValue: oldStatus,
    newValue: newStatus,
    actor,
  });
}

export async function logEquipmentLocationChange(
  equipmentId: string,
  oldLocation: string | null | undefined,
  newLocation: string | null | undefined,
  actor?: EquipmentEventActor
): Promise<void> {
  const oldFormatted = formatEquipmentLocation(oldLocation);
  const newFormatted = formatEquipmentLocation(newLocation);
  if (oldFormatted === newFormatted) return;

  await appendEquipmentEvent({
    equipmentId,
    eventType: "location_changed",
    description: `Расположение изменено: ${oldFormatted} → ${newFormatted}`,
    oldValue: oldLocation?.trim() || null,
    newValue: newLocation?.trim() || null,
    actor,
  });
}
