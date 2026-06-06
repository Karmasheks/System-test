import { storage } from "./storage";
import { getTaskCoexecutors } from "./task-coexecutors-service";
import type { Task, TaskComment } from "@shared/schema";

const ENGINEER_NOTIFY_ROLES = new Set([
  "engineer",
  "service_engineer",
  "technician",
  "manager",
  "admin",
]);

export function formatTaskCommentNotificationMessage(
  comment: Pick<TaskComment, "id" | "authorName" | "body">
): string {
  const preview = comment.body.trim().slice(0, 160);
  return JSON.stringify({
    commentId: comment.id,
    text: `${comment.authorName}: ${preview}${comment.body.length > 160 ? "…" : ""}`,
  });
}

export function parseTaskCommentNotificationMessage(message: string): {
  commentId?: number;
  text: string;
} {
  try {
    const parsed = JSON.parse(message) as { commentId?: number; text?: string };
    if (parsed && typeof parsed.text === "string") {
      return { commentId: parsed.commentId, text: parsed.text };
    }
  } catch {
    // legacy plain text
  }
  return { text: message };
}

export async function notifyNewTaskCreated(
  task: Task,
  creatorId: number
): Promise<void> {
  const users = await storage.getAllUsers();
  const recipients = new Set<number>();

  for (const u of users) {
    if (u.id === creatorId) continue;
    if (ENGINEER_NOTIFY_ROLES.has(u.role)) {
      recipients.add(u.id);
    }
  }

  if (task.assigneeId != null && task.assigneeId !== creatorId) {
    recipients.add(task.assigneeId);
  }

  const equipmentSuffix = task.equipmentId ? ` · ${task.equipmentId}` : "";
  const message = `${task.title}${equipmentSuffix}`;

  for (const userId of recipients) {
    await storage.createNotification({
      userId,
      title: `Новая задача #${task.id}`,
      message,
      type: "task_created",
      taskId: task.id,
      equipmentId: task.equipmentId ?? undefined,
      priority: task.priority === "urgent" || task.priority === "high" ? "high" : "medium",
    });
  }
}

export async function notifyTaskCommentAdded(
  task: Task,
  comment: Pick<TaskComment, "id" | "authorId" | "authorName" | "body">
): Promise<void> {
  const recipients = new Set<number>();

  if (task.createdById != null) recipients.add(task.createdById);
  if (task.assigneeId != null) recipients.add(task.assigneeId);

  const coexecs = await getTaskCoexecutors(task.id);
  for (const c of coexecs) {
    recipients.add(c.userId);
  }

  const allUsers = await storage.getAllUsers();
  for (const u of allUsers) {
    if (u.role === "admin" || u.role === "marketing_manager") {
      recipients.add(u.id);
    }
  }

  recipients.delete(comment.authorId);

  if (recipients.size === 0) return;

  const message = formatTaskCommentNotificationMessage(comment);

  for (const userId of recipients) {
    await storage.createNotification({
      userId,
      title: `Комментарий к задаче #${task.id}`,
      message,
      type: "task_comment",
      taskId: task.id,
      equipmentId: task.equipmentId ?? undefined,
      priority: "medium",
    });
  }
}
