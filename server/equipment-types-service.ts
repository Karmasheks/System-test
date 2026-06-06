import { db } from "./db";
import { equipmentTypes } from "@shared/schema";
import { DEFAULT_EQUIPMENT_TYPES } from "@shared/equipment-type-constants";
import { eq } from "drizzle-orm";
import { storage } from "./storage";

export async function seedEquipmentTypes() {
  for (const name of DEFAULT_EQUIPMENT_TYPES) {
    await db.insert(equipmentTypes).values({ name }).onConflictDoNothing({ target: equipmentTypes.name });
  }
}

async function syncTypesFromExistingEquipment() {
  const rows = await storage.getAllEquipment();
  const names = new Set(
    rows.map((r) => r.type?.trim()).filter((t): t is string => Boolean(t))
  );
  for (const name of names) {
    await db.insert(equipmentTypes).values({ name }).onConflictDoNothing({ target: equipmentTypes.name });
  }
}

export async function listEquipmentTypes() {
  await seedEquipmentTypes();
  await syncTypesFromExistingEquipment();
  return db.select().from(equipmentTypes).orderBy(equipmentTypes.name);
}

export async function createEquipmentType(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите название категории");
  const [row] = await db.insert(equipmentTypes).values({ name: trimmed }).returning();
  return row;
}

export async function findOrCreateEquipmentType(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите название категории");
  const [existing] = await db
    .select()
    .from(equipmentTypes)
    .where(eq(equipmentTypes.name, trimmed));
  if (existing) return existing;
  return createEquipmentType(trimmed);
}
