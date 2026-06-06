import { eq } from "drizzle-orm";
import { db } from "./db";
import { taskCoexecutors, type TaskCoexecutor } from "@shared/schema";

export async function getTaskCoexecutors(taskId: number): Promise<TaskCoexecutor[]> {
  return db.select().from(taskCoexecutors).where(eq(taskCoexecutors.taskId, taskId));
}

export async function addTaskCoexecutor(data: {
  taskId: number;
  userId: number;
  userName: string;
}): Promise<TaskCoexecutor> {
  const existing = await getTaskCoexecutors(data.taskId);
  if (existing.some((c) => c.userId === data.userId)) {
    throw new Error("Соисполнитель уже добавлен");
  }
  const [row] = await db.insert(taskCoexecutors).values(data).returning();
  return row;
}

export async function removeTaskCoexecutor(id: number): Promise<boolean> {
  const result = await db.delete(taskCoexecutors).where(eq(taskCoexecutors.id, id)).returning();
  return result.length > 0;
}
