import { db } from "./db";
import { equipmentComments } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { assertCanModifyComment } from "./comment-access";

type AuthUser = { id: number; name: string; role: string };

export async function listEquipmentComments(equipmentId: string) {
  return db
    .select()
    .from(equipmentComments)
    .where(eq(equipmentComments.equipmentId, equipmentId))
    .orderBy(asc(equipmentComments.createdAt));
}

export async function addEquipmentComment(
  equipmentId: string,
  body: string,
  user: Pick<AuthUser, "id" | "name">
) {
  const [row] = await db
    .insert(equipmentComments)
    .values({
      equipmentId,
      body: body.trim(),
      authorId: user.id,
      authorName: user.name,
    })
    .returning();
  return row;
}

export async function updateEquipmentComment(
  commentId: number,
  body: string,
  user: AuthUser
) {
  const [existing] = await db
    .select()
    .from(equipmentComments)
    .where(eq(equipmentComments.id, commentId));
  if (!existing) {
    throw new Error("Заметка не найдена");
  }
  assertCanModifyComment(existing.authorId, user);
  const [row] = await db
    .update(equipmentComments)
    .set({ body: body.trim(), updatedAt: new Date() })
    .where(eq(equipmentComments.id, commentId))
    .returning();
  return row;
}

export async function deleteEquipmentComment(commentId: number, user: AuthUser) {
  const [existing] = await db
    .select()
    .from(equipmentComments)
    .where(eq(equipmentComments.id, commentId));
  if (!existing) {
    throw new Error("Заметка не найдена");
  }
  assertCanModifyComment(existing.authorId, user);
  await db.delete(equipmentComments).where(eq(equipmentComments.id, commentId));
  return existing;
}

export async function deleteEquipmentCommentsForEquipment(equipmentId: string) {
  await db.delete(equipmentComments).where(eq(equipmentComments.equipmentId, equipmentId));
}
