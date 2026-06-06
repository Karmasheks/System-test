import { storage } from "./storage";
import { getEffectivePermissionsForUser } from "./permissions-service";
import {
  canViewCreatedTasks,
  canViewLevel,
  type TaskCapabilities,
} from "@shared/permissions-constants";
import { getTaskCoexecutors } from "./task-coexecutors-service";
import type { Task } from "@shared/schema";

type AuthUser = { id: number; role: string };

export class TaskAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

async function loadTask(taskId: number): Promise<Task> {
  const task = await storage.getTask(taskId);
  if (!task) {
    throw new TaskAccessError("Задача не найдена", 404);
  }
  return task;
}

function isManagerRole(role: string): boolean {
  return role === "admin" || role === "marketing_manager";
}

function canViewTaskByCapabilities(
  task: Task,
  userId: number,
  role: string,
  taskCapabilities: TaskCapabilities,
  modules: Record<string, string>
): boolean {
  if (isManagerRole(role)) return true;
  if (task.createdById === userId && canViewCreatedTasks(taskCapabilities)) return true;
  if (task.assigneeId === userId) return true;
  if (canViewLevel(modules.tasks as "none" | "view" | "edit")) return true;
  return false;
}

export async function assertCanViewTaskDetails(
  user: AuthUser,
  taskId: number
): Promise<Task> {
  return assertCanViewTaskComments(user, taskId);
}

export async function assertCanViewTaskComments(
  user: AuthUser,
  taskId: number
): Promise<Task> {
  const task = await loadTask(taskId);
  if (isManagerRole(user.role)) return task;

  if (task.createdById === user.id) return task;
  if (task.assigneeId === user.id) return task;

  const coexecs = await getTaskCoexecutors(taskId);
  if (coexecs.some((c) => c.userId === user.id)) return task;

  const fullUser = await storage.getUser(user.id);
  if (!fullUser) throw new TaskAccessError("Пользователь не найден", 401);
  const perms = await getEffectivePermissionsForUser(fullUser);

  if (
    canViewTaskByCapabilities(task, user.id, user.role, perms.taskCapabilities, perms.modules)
  ) {
    return task;
  }

  throw new TaskAccessError("Недостаточно прав для просмотра комментариев", 403);
}

export async function assertCanAddTaskComment(
  user: AuthUser,
  taskId: number
): Promise<Task> {
  const task = await assertCanViewTaskComments(user, taskId);

  if (isManagerRole(user.role)) return task;
  if (task.createdById === user.id) return task;
  if (task.assigneeId === user.id) return task;

  const coexecs = await getTaskCoexecutors(taskId);
  if (coexecs.some((c) => c.userId === user.id)) return task;

  const fullUser = await storage.getUser(user.id);
  if (!fullUser) throw new TaskAccessError("Пользователь не найден", 401);
  const perms = await getEffectivePermissionsForUser(fullUser);

  if (perms.taskCapabilities.process) return task;

  throw new TaskAccessError("Недостаточно прав для добавления комментария", 403);
}

export async function assertCanUpdateTask(user: AuthUser, taskId: number): Promise<Task> {
  const task = await assertCanAddTaskComment(user, taskId);
  if (isManagerRole(user.role)) return task;

  const fullUser = await storage.getUser(user.id);
  if (!fullUser) throw new TaskAccessError("Пользователь не найден", 401);
  const perms = await getEffectivePermissionsForUser(fullUser);

  if (perms.taskCapabilities.process) return task;

  throw new TaskAccessError("Недостаточно прав для изменения задачи", 403);
}
