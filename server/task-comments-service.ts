import { db } from "./db";
import { taskComments } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

type AuthUser = { id: number; name: string };

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
