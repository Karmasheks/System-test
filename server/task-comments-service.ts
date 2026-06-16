import { db } from "./db";
import { taskComments } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { assertCanModifyComment } from "./comment-access";

type AuthUser = { id: number; name: string; role: string };

export async function listTaskComments(taskId: number) {
  return db
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt));
}

export async function addTaskComment(
  taskId: number,
  body: string,
  user: AuthUser,
  attachments: { name: string; url: string }[] = []
) {
  const [row] = await db
    .insert(taskComments)
    .values({
      taskId,
      body: body.trim(),
      attachments,
      authorId: user.id,
      authorName: user.name,
    })
    .returning();
  return row;
}

export async function updateTaskComment(
  taskId: number,
  commentId: number,
  body: string,
  user: AuthUser
) {
  const [existing] = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.id, commentId));
  if (!existing || existing.taskId !== taskId) {
    throw new Error("Комментарий не найден");
  }
  assertCanModifyComment(existing.authorId, user);
  const [row] = await db
    .update(taskComments)
    .set({ body: body.trim(), updatedAt: new Date() })
    .where(eq(taskComments.id, commentId))
    .returning();
  return row;
}

export async function deleteTaskComment(taskId: number, commentId: number, user: AuthUser) {
  const [existing] = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.id, commentId));
  if (!existing || existing.taskId !== taskId) {
    throw new Error("Комментарий не найден");
  }
  assertCanModifyComment(existing.authorId, user);
  await db.delete(taskComments).where(eq(taskComments.id, commentId));
  return existing;
}
