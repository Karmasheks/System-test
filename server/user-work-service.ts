import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { filterBySubdivisionScope, resolveSubdivisionScope } from "@shared/subdivision-scope";
import {
  requestCoexecutors,
  serviceRequests,
  taskCoexecutors,
  tasks,
  type ServiceRequest,
  type Task,
} from "@shared/schema";

export type UserWorkScope = "assigned" | "created";

export async function listTasksForUserScope(
  userId: number,
  scope: UserWorkScope
): Promise<Task[]> {
  const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt));

  if (scope === "created") {
    let list = allTasks.filter((t) => t.createdById === userId);
    const user = await storage.getUser(userId);
    if (user) {
      list = filterBySubdivisionScope(list, resolveSubdivisionScope(user));
    }
    return list;
  }

  const coexecRows = await db
    .select({ taskId: taskCoexecutors.taskId })
    .from(taskCoexecutors)
    .where(eq(taskCoexecutors.userId, userId));
  const coexecTaskIds = new Set(coexecRows.map((r) => r.taskId));

  let list = allTasks.filter(
    (t) => t.assigneeId === userId || coexecTaskIds.has(t.id)
  );

  const user = await storage.getUser(userId);
  if (user) {
    const subScope = resolveSubdivisionScope(user);
    list = filterBySubdivisionScope(list, subScope);
  }
  return list;
}

export async function listServiceRequestsForUserScope(
  userId: number,
  scope: UserWorkScope,
  filters?: { status?: string; equipmentId?: string }
): Promise<ServiceRequest[]> {
  const rows = await db
    .select()
    .from(serviceRequests)
    .orderBy(desc(serviceRequests.createdAt));

  const coexecRows = await db
    .select({ requestId: requestCoexecutors.requestId })
    .from(requestCoexecutors)
    .where(eq(requestCoexecutors.userId, userId));
  const coexecRequestIds = new Set(coexecRows.map((r) => r.requestId));

  let list = rows.filter((r) => {
    if (filters?.status && r.status !== filters.status) return false;
    if (filters?.equipmentId && r.equipmentId !== filters.equipmentId) return false;

    if (scope === "created") {
      return r.requesterId === userId;
    }

    return r.assigneeId === userId || coexecRequestIds.has(r.id);
  });

  const user = await storage.getUser(userId);
  if (user) {
    list = filterBySubdivisionScope(list, resolveSubdivisionScope(user));
  }
  return list;
}
