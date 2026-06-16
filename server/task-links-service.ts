import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { taskLinks, type TaskLink } from "../shared/schema";

export async function listTaskLinks(taskId: number): Promise<TaskLink[]> {
  return db
    .select()
    .from(taskLinks)
    .where(eq(taskLinks.taskId, taskId))
    .orderBy(desc(taskLinks.createdAt));
}

export async function addTaskLink(data: {
  taskId: number;
  title: string;
  description?: string;
  url: string;
}): Promise<TaskLink> {
  const [row] = await db.insert(taskLinks).values(data).returning();
  return row;
}

export async function removeTaskLink(id: number): Promise<boolean> {
  const result = await db.delete(taskLinks).where(eq(taskLinks.id, id)).returning();
  return result.length > 0;
}
