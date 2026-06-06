import { db } from "./db";
import { equipment, equipmentLinks } from "@shared/schema";
import type { EquipmentLinkInput } from "@shared/equipment-link-constants";
import {
  logEquipmentLinkChanges,
  type EquipmentEventActor,
} from "./equipment-event-log";
import { eq, or, and } from "drizzle-orm";

export interface EquipmentLinkRow {
  id: number;
  linkType: string;
  note: string | null;
  equipmentId: string;
  linkedEquipmentId: string;
  otherEquipmentId: string;
  otherEquipmentName: string;
  otherEquipmentType: string;
  otherEquipmentStatus: string;
}

function mapLinkRow(
  link: typeof equipmentLinks.$inferSelect,
  other: typeof equipment.$inferSelect,
  currentEquipmentId: string
): EquipmentLinkRow {
  const otherId =
    link.equipmentId === currentEquipmentId ? link.linkedEquipmentId : link.equipmentId;
  return {
    id: link.id,
    linkType: link.linkType,
    note: link.note,
    equipmentId: link.equipmentId,
    linkedEquipmentId: link.linkedEquipmentId,
    otherEquipmentId: otherId,
    otherEquipmentName: other.name,
    otherEquipmentType: other.type,
    otherEquipmentStatus: other.status,
  };
}

export async function getEquipmentLinksForEquipment(equipmentId: string): Promise<EquipmentLinkRow[]> {
  const rows = await db
    .select({
      link: equipmentLinks,
      other: equipment,
    })
    .from(equipmentLinks)
    .innerJoin(
      equipment,
      or(
        and(eq(equipmentLinks.equipmentId, equipmentId), eq(equipment.id, equipmentLinks.linkedEquipmentId)),
        and(eq(equipmentLinks.linkedEquipmentId, equipmentId), eq(equipment.id, equipmentLinks.equipmentId))
      )
    )
    .where(or(eq(equipmentLinks.equipmentId, equipmentId), eq(equipmentLinks.linkedEquipmentId, equipmentId)));

  return rows.map(({ link, other }) => mapLinkRow(link, other, equipmentId));
}

export async function syncEquipmentLinks(
  equipmentId: string,
  links: EquipmentLinkInput[],
  actor?: EquipmentEventActor
): Promise<EquipmentLinkRow[]> {
  if (!equipmentId.trim()) {
    throw new Error("ID оборудования обязателен");
  }

  const target = await db
    .select({ id: equipment.id, name: equipment.name })
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .limit(1);
  if (!target[0]) {
    throw new Error("Оборудование не найдено");
  }

  const oldLinks = await getEquipmentLinksForEquipment(equipmentId);
  const oldSnapshots = oldLinks.map((link) => ({
    otherEquipmentId: link.otherEquipmentId,
    linkType: link.linkType,
    note: link.note,
  }));

  const normalized = links
    .map((link) => ({
      linkedEquipmentId: link.linkedEquipmentId.trim(),
      linkType: link.linkType ?? "works_with",
      note: link.note?.trim() || null,
    }))
    .filter((link) => link.linkedEquipmentId && link.linkedEquipmentId !== equipmentId);

  const uniqueByTarget = new Map<string, (typeof normalized)[number]>();
  for (const link of normalized) {
    uniqueByTarget.set(link.linkedEquipmentId, link);
  }

  for (const link of uniqueByTarget.values()) {
    const other = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(eq(equipment.id, link.linkedEquipmentId))
      .limit(1);
    if (!other[0]) {
      throw new Error(`Связанное оборудование ${link.linkedEquipmentId} не найдено`);
    }
  }

  const newSnapshots = Array.from(uniqueByTarget.values()).map((link) => ({
    otherEquipmentId: link.linkedEquipmentId,
    linkType: link.linkType,
    note: link.note,
  }));

  await logEquipmentLinkChanges(
    equipmentId,
    target[0].name,
    oldSnapshots,
    newSnapshots,
    actor
  );

  await db
    .delete(equipmentLinks)
    .where(or(eq(equipmentLinks.equipmentId, equipmentId), eq(equipmentLinks.linkedEquipmentId, equipmentId)));

  if (uniqueByTarget.size > 0) {
    await db.insert(equipmentLinks).values(
      Array.from(uniqueByTarget.values()).map((link) => ({
        equipmentId,
        linkedEquipmentId: link.linkedEquipmentId,
        linkType: link.linkType,
        note: link.note,
      }))
    );
  }

  return getEquipmentLinksForEquipment(equipmentId);
}

export async function deleteEquipmentLinksForEquipment(equipmentId: string): Promise<void> {
  await db
    .delete(equipmentLinks)
    .where(or(eq(equipmentLinks.equipmentId, equipmentId), eq(equipmentLinks.linkedEquipmentId, equipmentId)));
}
