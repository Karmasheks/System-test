import { db } from "./db";
import { subdivisions, users, equipment, warehouseParts, tasks, serviceRequests, remarks } from "@shared/schema";
import { DEFAULT_SUBDIVISIONS } from "@shared/subdivision-constants";
import { eq, sql } from "drizzle-orm";

function isUniqueNameError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

async function findSubdivisionByName(name: string) {
  const [row] = await db.select().from(subdivisions).where(eq(subdivisions.name, name)).limit(1);
  return row;
}

/** Создаёт стандартные подразделения только если справочник пуст (не при каждом запросе). */
export async function seedSubdivisions() {
  const rows = await db.select({ id: subdivisions.id }).from(subdivisions).limit(1);
  if (rows.length > 0) return;

  for (const name of DEFAULT_SUBDIVISIONS) {
    await db.insert(subdivisions).values({ name }).onConflictDoNothing({ target: subdivisions.name });
  }
}

export async function backfillSubdivisionLinks() {
  const rows = await db.select().from(subdivisions).orderBy(subdivisions.id).limit(1);
  const fallback = rows[0];
  if (!fallback) return;

  const id = fallback.id;
  const name = fallback.name;

  await db.execute(sql`
    UPDATE equipment SET subdivision_id = ${id}, subdivision_name = ${name}
    WHERE subdivision_id IS NULL
  `);
  await db.execute(sql`
    UPDATE warehouse_parts SET subdivision_id = ${id}, subdivision_name = ${name}
    WHERE subdivision_id IS NULL
  `);
  await db.execute(sql`
    UPDATE tasks SET subdivision_id = ${id}
    WHERE subdivision_id IS NULL
  `);
  await db.execute(sql`
    UPDATE service_requests SET subdivision_id = ${id}
    WHERE subdivision_id IS NULL
  `);
  await db.execute(sql`
    UPDATE remarks SET subdivision_id = ${id}
    WHERE subdivision_id IS NULL
  `);
}

export async function listSubdivisions() {
  return db.select().from(subdivisions).where(eq(subdivisions.isActive, true)).orderBy(subdivisions.name);
}

export async function listAllSubdivisions() {
  return db.select().from(subdivisions).orderBy(subdivisions.name);
}

export async function createSubdivision(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите название подразделения");

  const existing = await findSubdivisionByName(trimmed);
  if (existing) {
    if (existing.isActive) {
      throw new Error("Подразделение с таким названием уже существует");
    }
    const [row] = await db
      .update(subdivisions)
      .set({ isActive: true })
      .where(eq(subdivisions.id, existing.id))
      .returning();
    if (!row) throw new Error("Не удалось восстановить подразделение");
    return row;
  }

  try {
    const [row] = await db.insert(subdivisions).values({ name: trimmed }).returning();
    return row;
  } catch (err) {
    if (isUniqueNameError(err)) {
      throw new Error("Подразделение с таким названием уже существует");
    }
    throw err;
  }
}

export async function getSubdivisionById(id: number) {
  const [row] = await db.select().from(subdivisions).where(eq(subdivisions.id, id)).limit(1);
  return row;
}

export async function findOrCreateSubdivision(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите название подразделения");
  const [existing] = await db.select().from(subdivisions).where(eq(subdivisions.name, trimmed));
  if (existing) return existing;
  return createSubdivision(trimmed);
}

export async function resolveSubdivisionFields(
  subdivisionId?: number | null,
  subdivisionName?: string | null
): Promise<{ subdivisionId: number | null; subdivisionName: string | null }> {
  if (subdivisionId) {
    const row = await getSubdivisionById(subdivisionId);
    if (row) {
      return { subdivisionId: row.id, subdivisionName: row.name };
    }
  }
  if (subdivisionName?.trim()) {
    const row = await findOrCreateSubdivision(subdivisionName.trim());
    return { subdivisionId: row.id, subdivisionName: row.name };
  }
  return { subdivisionId: null, subdivisionName: null };
}

export type SubdivisionUsage = {
  users: number;
  equipment: number;
  warehouseParts: number;
  tasks: number;
  serviceRequests: number;
  remarks: number;
};

export async function getSubdivisionUsage(id: number): Promise<SubdivisionUsage> {
  const [usersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.subdivisionId, id));
  const [equipmentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(equipment)
    .where(eq(equipment.subdivisionId, id));
  const [partsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(warehouseParts)
    .where(eq(warehouseParts.subdivisionId, id));
  const [tasksCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.subdivisionId, id));
  const [requestsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(serviceRequests)
    .where(eq(serviceRequests.subdivisionId, id));
  const [remarksCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(remarks)
    .where(eq(remarks.subdivisionId, id));

  return {
    users: usersCount?.count ?? 0,
    equipment: equipmentCount?.count ?? 0,
    warehouseParts: partsCount?.count ?? 0,
    tasks: tasksCount?.count ?? 0,
    serviceRequests: requestsCount?.count ?? 0,
    remarks: remarksCount?.count ?? 0,
  };
}

export async function subdivisionInUse(id: number): Promise<boolean> {
  const usage = await getSubdivisionUsage(id);
  return Object.values(usage).some((n) => n > 0);
}

export type RemoveSubdivisionResult =
  | { mode: "deleted" }
  | { mode: "deactivated"; usage: SubdivisionUsage };

/** Удаляет из справочника: без связей — физически, со связями — скрывает (is_active=false). */
export async function removeSubdivision(id: number): Promise<RemoveSubdivisionResult> {
  const usage = await getSubdivisionUsage(id);
  const inUse = Object.values(usage).some((n) => n > 0);

  if (inUse) {
    const [row] = await db
      .update(subdivisions)
      .set({ isActive: false })
      .where(eq(subdivisions.id, id))
      .returning();
    if (!row) throw new Error("Подразделение не найдено");
    return { mode: "deactivated", usage };
  }

  await db.delete(subdivisions).where(eq(subdivisions.id, id));
  return { mode: "deleted" };
}

export async function renameSubdivision(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Укажите название подразделения");

  const current = await getSubdivisionById(id);
  if (!current) throw new Error("Подразделение не найдено");
  if (current.name === trimmed) return current;

  const duplicate = await findSubdivisionByName(trimmed);
  if (duplicate && duplicate.id !== id) {
    if (!duplicate.isActive) {
      const usage = await getSubdivisionUsage(duplicate.id);
      const inUse = Object.values(usage).some((n) => n > 0);
      if (inUse) {
        throw new Error(
          "Такое название занято скрытым подразделением с привязанными данными. Выберите другое имя."
        );
      }
      await db.delete(subdivisions).where(eq(subdivisions.id, duplicate.id));
    } else {
      throw new Error("Подразделение с таким названием уже существует");
    }
  }

  try {
    const [row] = await db
      .update(subdivisions)
      .set({ name: trimmed, isActive: true })
      .where(eq(subdivisions.id, id))
      .returning();
    if (!row) throw new Error("Подразделение не найдено");

    await db.execute(sql`
      UPDATE equipment SET subdivision_name = ${trimmed}
      WHERE subdivision_id = ${id}
    `);
    await db.execute(sql`
      UPDATE warehouse_parts SET subdivision_name = ${trimmed}
      WHERE subdivision_id = ${id}
    `);
    return row;
  } catch (err) {
    if (isUniqueNameError(err)) {
      throw new Error("Подразделение с таким названием уже существует");
    }
    throw err;
  }
}

export async function initSubdivisionSystem() {
  await seedSubdivisions();
  await backfillSubdivisionLinks();
}
