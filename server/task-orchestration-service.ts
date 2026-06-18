import { db } from "./db";
import { storage } from "./storage";
import {
  tasks,
  remarks,
  maintenanceRecords,
  serviceRequests,
  type Task,
  type InsertTask,
} from "@shared/schema";
import type { TaskSourceType } from "@shared/task-source-constants";
import {
  isServiceRequestVoidStatus,
  STATUS_LABELS,
  type ServiceRequestStatus,
} from "@shared/service-request-constants";
import { eq, and, or, isNull, desc, gte, lte } from "drizzle-orm";
import {
  maintenanceTaskDueDate,
  shouldCreateMaintenanceTaskNow,
} from "@shared/maintenance-scheduling-constants";

type AuthUser = { id: number; name: string };

export type CreateLinkedTaskInput = {
  title: string;
  description?: string | null;
  priority?: string;
  status?: string;
  taskType?: string | null;
  maintenanceType?: string | null;
  equipmentId?: string | null;
  dueDate?: Date | null;
  assigneeId?: number;
  assigneeName?: string;
  sourceType: TaskSourceType;
  sourceId?: number | null;
  remarkId?: number | null;
  maintenanceId?: number | null;
  serviceRequestId?: number | null;
  parentTaskId?: number | null;
  rootTaskId?: number | null;
  createdBy: string;
  createdById: number;
};

function countIssuesFromCheckResults(checkResults?: string[] | null): number {
  if (!checkResults?.length) return 0;
  return checkResults.filter((r) => r === "issue" || r === "critical").length;
}

function deriveWorkingStatus(checkResults?: string[] | null): string {
  if (!checkResults?.length) return "working";
  if (checkResults.some((r) => r === "critical")) return "not_working";
  if (checkResults.some((r) => r === "issue")) return "maintenance";
  return "working";
}

export { countIssuesFromCheckResults, deriveWorkingStatus };

export async function findTaskBySource(sourceType: TaskSourceType, sourceId: number) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sourceType, sourceType), eq(tasks.sourceId, sourceId)));
  return row;
}

async function syncEquipmentAfterLinkedTask(input: CreateLinkedTaskInput): Promise<void> {
  if (!input.equipmentId) return;
  const { syncEquipmentOperationalStatus } = await import("./equipment-status-service");
  await syncEquipmentOperationalStatus(input.equipmentId, {
    id: input.createdById,
    name: input.createdBy,
  });
}

export async function createLinkedTask(input: CreateLinkedTaskInput): Promise<Task> {
  if (input.sourceId != null) {
    const existing = await findTaskBySource(input.sourceType, input.sourceId);
    if (existing) {
      await syncEquipmentAfterLinkedTask(input);
      return existing;
    }
  }

  const assigneeId = input.assigneeId ?? null;
  const taskData: InsertTask = {
    title: input.title,
    description: input.description ?? null,
    userId: input.createdById,
    assigneeId,
    assigneeName: assigneeId ? (input.assigneeName ?? null) : null,
    status: input.status ?? "pending",
    priority: input.priority ?? "medium",
    taskType: input.taskType ?? "other",
    maintenanceType: input.maintenanceType ?? null,
    equipmentId: input.equipmentId ?? null,
    dueDate: input.dueDate ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    remarkId: input.remarkId ?? null,
    maintenanceId: input.maintenanceId ?? null,
    serviceRequestId: input.serviceRequestId ?? null,
    parentTaskId: input.parentTaskId ?? null,
    rootTaskId: input.rootTaskId ?? input.parentTaskId ?? null,
    createdBy: input.createdBy,
    createdById: input.createdById,
  };

  const task = await storage.createTask(taskData);

  if (!task.rootTaskId) {
    await storage.updateTask(task.id, { rootTaskId: task.id });
    task.rootTaskId = task.id;
  }

  await storage.createTaskStatusHistory({
    taskId: task.id,
    fromStatus: null,
    toStatus: task.status,
    changedById: input.createdById,
    changedByName: input.createdBy,
    comment: `Создано из источника: ${input.sourceType}`,
  });

  await syncEquipmentAfterLinkedTask(input);

  return task;
}

export async function createTaskFromRemark(
  remark: typeof remarks.$inferSelect,
  user: AuthUser
): Promise<Task> {
  if (remark.linkedTaskId) {
    const linked = await storage.getTask(remark.linkedTaskId);
    if (linked) return linked;
  }

  if (remark.type === "inspection" && remark.inspectionId) {
    const byInspection = await findTaskBySource("inspection", remark.inspectionId);
    if (byInspection) {
      await db
        .update(remarks)
        .set({ linkedTaskId: byInspection.id, updatedAt: new Date() })
        .where(eq(remarks.id, remark.id));
      return byInspection;
    }
  }

  const inspectionSourceId =
    remark.type === "inspection" && remark.inspectionId ? remark.inspectionId : null;

  const task = await createLinkedTask({
    title: remark.title,
    description: remark.description,
    priority: remark.priority,
    equipmentId: remark.equipmentId,
    sourceType: remark.type === "inspection" ? "inspection" : "remark",
    sourceId: inspectionSourceId ?? remark.id,
    remarkId: remark.id,
    createdBy: user.name,
    createdById: user.id,
    assigneeName: remark.assignedTo || user.name,
  });

  await db.update(remarks).set({ linkedTaskId: task.id, updatedAt: new Date() }).where(eq(remarks.id, remark.id));
  return task;
}

export async function createTaskFromMaintenance(
  record: typeof maintenanceRecords.$inferSelect,
  user: AuthUser
): Promise<Task> {
  const task = await createLinkedTask({
    title: `ТО: ${record.maintenanceType} — ${record.equipmentName}`,
    description: record.notes ?? undefined,
    priority: record.priority === "critical" ? "urgent" : record.priority,
    taskType: "maintenance",
    maintenanceType: record.maintenanceType,
    equipmentId: record.equipmentId,
    dueDate: maintenanceTaskDueDate(new Date(record.scheduledDate)),
    sourceType: "maintenance",
    sourceId: record.id,
    maintenanceId: record.id,
    createdBy: user.name,
    createdById: user.id,
    assigneeName: record.responsible || user.name,
    status: record.status === "completed" ? "completed" : record.status === "in_progress" ? "in_progress" : "pending",
  });
  return task;
}

export async function createTaskFromServiceRequest(
  request: typeof serviceRequests.$inferSelect,
  user: AuthUser
): Promise<Task> {
  const task = await createLinkedTask({
    title: `Заявка #${request.id}: ${request.equipmentName}`,
    description: request.problemDescription,
    priority: request.priority ?? "medium",
    taskType: request.requestType === "maintenance" ? "maintenance" : "repair",
    equipmentId: request.equipmentId,
    dueDate: request.plannedDate ? new Date(request.plannedDate) : null,
    sourceType: "service_request",
    sourceId: request.id,
    serviceRequestId: request.id,
    createdBy: user.name,
    createdById: user.id,
    assigneeName: request.assigneeName ?? user.name,
    status: "pending",
  });
  return task;
}

export async function listTasksForServiceRequest(serviceRequestId: number) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.serviceRequestId, serviceRequestId))
    .orderBy(desc(tasks.createdAt));
}

export type ServiceRequestWorkProgress = {
  subtasksTotal: number;
  subtasksCompleted: number;
  subtasksProgress: number;
  requestStatus: string;
  requestComplete: boolean;
  overallProgress: number;
  openSubtaskIds: number[];
  inProgressSubtasks: { id: number; title: string }[];
};

const SR_TERMINAL_STATUSES = new Set(["closed", "cancelled", "duplicate", "not_needed"]);

const SR_STATUS_PROGRESS: Record<string, number> = {
  new: 5,
  assigned: 15,
  in_progress: 40,
  waiting_parts: 35,
  returned: 30,
  done: 75,
  user_review: 85,
  closed: 100,
  cancelled: 100,
  duplicate: 100,
  not_needed: 100,
};

export async function getServiceRequestWorkProgress(
  serviceRequestId: number
): Promise<ServiceRequestWorkProgress> {
  const allTasks = await listTasksForServiceRequest(serviceRequestId);
  const [request] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, serviceRequestId));

  const subtasks = allTasks.filter((t) => t.parentTaskId != null);
  const completed = subtasks.filter((t) => t.status === "completed").length;
  const total = subtasks.length;
  const subtasksProgress = total === 0 ? 100 : Math.round((completed / total) * 100);
  const requestComplete = request ? SR_TERMINAL_STATUSES.has(request.status) : false;
  const srProgress = request ? (SR_STATUS_PROGRESS[request.status] ?? 0) : 0;

  let overallProgress: number;
  if (requestComplete && total > 0 && completed < total) {
    overallProgress = Math.round((completed / total) * 90);
  } else if (requestComplete) {
    overallProgress = 100;
  } else if (total > 0) {
    overallProgress = Math.round(subtasksProgress * 0.65 + srProgress * 0.35);
  } else {
    overallProgress = srProgress;
  }

  return {
    subtasksTotal: total,
    subtasksCompleted: completed,
    subtasksProgress,
    requestStatus: request?.status ?? "unknown",
    requestComplete,
    overallProgress,
    openSubtaskIds: subtasks
      .filter((t) => t.status !== "completed" && t.status !== "cancelled")
      .map((t) => t.id),
    inProgressSubtasks: subtasks
      .filter((t) => t.status === "in_progress")
      .map((t) => ({ id: t.id, title: t.title })),
  };
}

export async function attachTaskTreeToServiceRequest(
  rootTaskId: number,
  serviceRequestId: number,
  user: AuthUser
): Promise<number> {
  const tree = await listTaskTree(rootTaskId);
  if (!tree) return 0;

  let count = 0;
  for (const t of tree.tasks) {
    if (t.serviceRequestId === serviceRequestId) continue;
    await storage.updateTask(t.id, {
      serviceRequestId,
      lastModifiedBy: user.name,
      lastModifiedById: user.id,
    });
    count++;
  }
  return count;
}

export function taskCompletionBlockedByServiceRequest(
  task: Task,
  progress: ServiceRequestWorkProgress
): string | null {
  if (!task.serviceRequestId) return null;
  if (isServiceRequestVoidStatus(progress.requestStatus)) {
    return null;
  }
  if (progress.requestComplete && progress.subtasksCompleted >= progress.subtasksTotal) {
    return null;
  }
  const openSubtasks = progress.subtasksTotal - progress.subtasksCompleted;
  if (openSubtasks > 0) {
    return `Завершите все подзадачи в сервисной заявке #${task.serviceRequestId} (${progress.subtasksCompleted}/${progress.subtasksTotal})`;
  }
  if (!progress.requestComplete) {
    return `Работа продолжается в сервисной заявке #${task.serviceRequestId}. Закройте заявку после выполнения всех работ.`;
  }
  return null;
}

export async function tryCompleteParentTaskForServiceRequest(
  serviceRequestId: number,
  user: AuthUser
): Promise<Task | null> {
  const progress = await getServiceRequestWorkProgress(serviceRequestId);
  if (!progress.requestComplete) return null;
  if (progress.subtasksTotal > 0 && progress.subtasksCompleted < progress.subtasksTotal) {
    return null;
  }

  const allTasks = await listTasksForServiceRequest(serviceRequestId);
  const rootTask = allTasks.find((t) => t.parentTaskId == null);
  if (!rootTask || rootTask.status === "completed" || rootTask.status === "cancelled") {
    return null;
  }

  const { issueTaskReservations } = await import("./part-reservation-service");

  await storage.updateTask(rootTask.id, {
    status: "completed",
    completedAt: new Date(),
    completedBy: user.name,
    completedById: user.id,
    lastModifiedBy: user.name,
    lastModifiedById: user.id,
  });
  await storage.createTaskStatusHistory({
    taskId: rootTask.id,
    fromStatus: rootTask.status,
    toStatus: "completed",
    changedById: user.id,
    changedByName: user.name,
    comment: `Автозавершение: сервисная заявка #${serviceRequestId} закрыта, все подзадачи выполнены`,
  });
  await issueTaskReservations(rootTask.id, user, rootTask.title);
  return (await storage.getTask(rootTask.id)) ?? null;
}

/** Отменяет открытые задачи заявки при статусах «отменено», «дубликат», «отпала необходимость». */
export async function tryFinalizeTasksForVoidServiceRequest(
  serviceRequestId: number,
  voidStatus: ServiceRequestStatus,
  user: AuthUser
): Promise<Task | null> {
  if (!isServiceRequestVoidStatus(voidStatus)) return null;

  const allTasks = await listTasksForServiceRequest(serviceRequestId);
  const statusLabel = STATUS_LABELS[voidStatus] ?? voidStatus;
  const historyComment = `Автоотмена: сервисная заявка #${serviceRequestId} — ${statusLabel}`;

  for (const t of allTasks) {
    if (t.parentTaskId == null) continue;
    if (t.status === "completed" || t.status === "cancelled") continue;

    await storage.updateTask(t.id, {
      status: "cancelled",
      lastModifiedBy: user.name,
      lastModifiedById: user.id,
    });
    await storage.createTaskStatusHistory({
      taskId: t.id,
      fromStatus: t.status,
      toStatus: "cancelled",
      changedById: user.id,
      changedByName: user.name,
      comment: historyComment,
    });
  }

  const rootTask = allTasks.find((t) => t.parentTaskId == null);
  if (!rootTask || rootTask.status === "completed" || rootTask.status === "cancelled") {
    return null;
  }

  await storage.updateTask(rootTask.id, {
    status: "cancelled",
    lastModifiedBy: user.name,
    lastModifiedById: user.id,
  });
  await storage.createTaskStatusHistory({
    taskId: rootTask.id,
    fromStatus: rootTask.status,
    toStatus: "cancelled",
    changedById: user.id,
    changedByName: user.name,
    comment: historyComment,
  });

  return (await storage.getTask(rootTask.id)) ?? null;
}

export async function assertServiceRequestSubtasksComplete(requestId: number): Promise<void> {
  const progress = await getServiceRequestWorkProgress(requestId);
  if (progress.subtasksTotal > 0 && progress.subtasksCompleted < progress.subtasksTotal) {
    throw new Error(
      `Завершите все подзадачи (${progress.subtasksCompleted}/${progress.subtasksTotal})`
    );
  }
}

export async function createServiceRequestSubtask(
  requestId: number,
  input: {
    title: string;
    description?: string | null;
    taskType?: string | null;
    priority?: string | null;
  },
  user: AuthUser
): Promise<Task> {
  const [request] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, requestId));
  if (!request) throw new Error("Заявка не найдена");

  const [mainTask] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.serviceRequestId, requestId), isNull(tasks.parentTaskId)))
    .limit(1);

  const parent = mainTask ?? (await createTaskFromServiceRequest(request, user));

  return createSubtask(
    parent.id,
    {
      title: input.title,
      description: input.description ?? null,
      taskType: input.taskType ?? "task",
      priority: input.priority ?? request.priority ?? "medium",
      equipmentId: request.equipmentId,
      assigneeId: request.assigneeId ?? user.id,
      assigneeName: request.assigneeName ?? user.name,
      serviceRequestId: requestId,
      createdBy: user.name,
      createdById: user.id,
    },
    user
  );
}

export async function createSubtask(
  parentTaskId: number,
  input: Omit<CreateLinkedTaskInput, "sourceType" | "parentTaskId"> & { title: string },
  user: AuthUser
): Promise<Task> {
  const parent = await storage.getTask(parentTaskId);
  if (!parent) throw new Error("Родительская задача не найдена");

  return createLinkedTask({
    ...input,
    sourceType: "subtask",
    parentTaskId,
    rootTaskId: parent.rootTaskId ?? parent.id,
    equipmentId: input.equipmentId ?? parent.equipmentId,
    serviceRequestId: input.serviceRequestId ?? parent.serviceRequestId,
    createdBy: user.name,
    createdById: user.id,
  });
}

export async function listSubtasks(parentTaskId: number) {
  return db.select().from(tasks).where(eq(tasks.parentTaskId, parentTaskId));
}

export async function listTaskTree(taskId: number) {
  const task = await storage.getTask(taskId);
  if (!task) return null;

  const rootId = task.rootTaskId ?? task.id;
  const allTasks = await db
    .select()
    .from(tasks)
    .where(or(eq(tasks.rootTaskId, rootId), eq(tasks.id, rootId)));

  const root = allTasks.find((t) => t.id === rootId) ?? task;
  return { root, tasks: allTasks };
}

export function summarizeTaskTree(allTasks: Task[], rootId: number) {
  const descendants = allTasks.filter((t) => t.id !== rootId);
  const byStatus: Record<string, number> = {};
  for (const t of descendants) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }
  const completed = descendants.filter((t) => t.status === "completed").length;
  const inProgress = descendants
    .filter((t) => t.status === "in_progress")
    .map((t) => ({ id: t.id, title: t.title, parentTaskId: t.parentTaskId }));
  const openCount = descendants.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  ).length;
  return {
    total: descendants.length,
    completed,
    openCount,
    byStatus,
    inProgress,
    progress: descendants.length ? Math.round((completed / descendants.length) * 100) : 0,
  };
}

/** Завершить все незакрытые подзадачи дерева при закрытии корневой задачи */
export async function cascadeCompleteSubtasks(
  rootId: number,
  user: AuthUser,
  skipTaskId: number
): Promise<number> {
  const { issueTaskReservations } = await import("./part-reservation-service");

  const allTasks = await db
    .select()
    .from(tasks)
    .where(or(eq(tasks.rootTaskId, rootId), eq(tasks.id, rootId)));

  const incomplete = allTasks.filter(
    (t) => t.id !== skipTaskId && t.id !== rootId && t.status !== "completed" && t.status !== "cancelled"
  );

  for (const sub of incomplete) {
    await storage.updateTask(sub.id, {
      status: "completed",
      completedAt: new Date(),
      completedBy: user.name,
      completedById: user.id,
      lastModifiedBy: user.name,
      lastModifiedById: user.id,
    });
    await storage.createTaskStatusHistory({
      taskId: sub.id,
      fromStatus: sub.status,
      toStatus: "completed",
      changedById: user.id,
      changedByName: user.name,
      comment: `Автозавершение при закрытии главной задачи #${rootId}`,
    });
    await issueTaskReservations(sub.id, user, sub.title);
  }

  return incomplete.length;
}

export async function convertTaskToServiceRequest(
  taskId: number,
  user: AuthUser,
  options: { requestType?: string; problemDescription?: string }
) {
  const task = await storage.getTask(taskId);
  if (!task) throw new Error("Задача не найдена");
  if (task.serviceRequestId) {
    const [existing] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, task.serviceRequestId));
    if (existing) return { task, serviceRequest: existing };
  }

  const { createServiceRequest, addStatusHistory, getEquipmentForRequest } = await import(
    "./service-request-storage"
  );

  const equipmentRow = task.equipmentId ? await getEquipmentForRequest(task.equipmentId) : undefined;

  const serviceRequest = await createServiceRequest({
    equipmentId: task.equipmentId ?? equipmentRow?.id ?? "UNKNOWN",
    equipmentName: equipmentRow?.name ?? task.equipmentId ?? "Не указано",
    requestType: options.requestType ?? task.taskType ?? "repair",
    problemDescription:
      options.problemDescription ??
      task.description ??
      `Создано из задачи #${task.id}: ${task.title}`,
    urgency: task.priority === "urgent" ? 5 : task.priority === "high" ? 4 : 3,
    priority: task.priority ?? "medium",
    status: "new",
    requesterId: user.id,
    requesterName: user.name,
  });

  await addStatusHistory({
    requestId: serviceRequest.id,
    fromStatus: null,
    toStatus: "new",
    changedById: user.id,
    changedByName: user.name,
    comment: `Создано из задачи #${task.id}`,
  });

  await storage.updateTask(taskId, {
    serviceRequestId: serviceRequest.id,
    lastModifiedBy: user.name,
    lastModifiedById: user.id,
    ...(task.status === "pending" ? { status: "in_progress" } : {}),
  });

  await attachTaskTreeToServiceRequest(taskId, serviceRequest.id, user);

  const newStatus = task.status === "pending" ? "in_progress" : task.status;

  await storage.createTaskStatusHistory({
    taskId,
    fromStatus: task.status,
    toStatus: newStatus,
    changedById: user.id,
    changedByName: user.name,
    comment: `Переведено в сервисную заявку #${serviceRequest.id} — дальнейшая работа и подзадачи в заявке`,
  });

  const updatedTask = await storage.getTask(taskId);

  return { task: updatedTask ?? task, serviceRequest };
}

export async function createLinkedTaskFromInspection(
  inspection: {
    id: number;
    equipmentId: string;
    equipmentName: string;
    comments?: string[] | null;
    issuesCount?: number | null;
  },
  user: AuthUser
) {
  return createLinkedTask({
    title: `Осмотр: ${inspection.equipmentName}`,
    description: inspection.comments?.filter(Boolean).join("\n") || undefined,
    equipmentId: inspection.equipmentId,
    priority: (inspection.issuesCount ?? 0) > 2 ? "high" : "medium",
    sourceType: "inspection",
    sourceId: inspection.id,
    createdBy: user.name,
    createdById: user.id,
  });
}

/** Создаёт или обновляет замечание и связанную задачу по результатам осмотра (без дублей). */
export async function syncRemarkFromDailyInspection(
  inspection: {
    id: number;
    equipmentId: string;
    equipmentName: string;
    comments?: string[] | null;
    issuesCount?: number | null;
    checkResults?: string[] | null;
    inspectedBy?: string | null;
  },
  user: AuthUser
) {
  const issuesCount =
    inspection.issuesCount ?? countIssuesFromCheckResults(inspection.checkResults);
  const description = (inspection.comments ?? []).filter(Boolean).join("\n").trim();

  const [byInspection] = await db
    .select()
    .from(remarks)
    .where(eq(remarks.inspectionId, inspection.id))
    .limit(1);

  let remark = byInspection;

  if (!remark) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const [byEquipmentToday] = await db
      .select()
      .from(remarks)
      .where(
        and(
          eq(remarks.equipmentId, inspection.equipmentId),
          eq(remarks.type, "inspection"),
          gte(remarks.createdAt, start),
          lte(remarks.createdAt, end)
        )
      )
      .orderBy(desc(remarks.createdAt))
      .limit(1);
    remark = byEquipmentToday;
  }

  if (issuesCount === 0 && !description) {
    if (remark && remark.status !== "resolved" && remark.status !== "closed") {
      await storage.updateRemark(String(remark.id), {
        status: "resolved",
        resolvedAt: new Date(),
        resolvedBy: user.name,
        inspectionId: inspection.id,
      });
      if (remark.linkedTaskId) {
        const task = await storage.getTask(remark.linkedTaskId);
        if (task && task.status !== "completed") {
          await storage.updateTask(remark.linkedTaskId, {
            status: "completed",
            completedAt: new Date(),
          });
        }
      }
    }
    return remark ?? null;
  }

  const hasCritical = inspection.checkResults?.includes("critical");
  const priority = hasCritical
    ? "critical"
    : issuesCount > 2
      ? "high"
      : "medium";

  const remarkPayload = {
    title: `Осмотр: ${inspection.equipmentName}`,
    description: description || "Отклонения при ежедневном осмотре",
    equipmentName: inspection.equipmentName,
    equipmentId: inspection.equipmentId,
    type: "inspection",
    priority,
    inspectionId: inspection.id,
    reportedBy: inspection.inspectedBy ?? user.name,
    assignedTo: inspection.inspectedBy ?? user.name,
  };

  let reopened = false;
  if (remark) {
    reopened = remark.status === "resolved" || remark.status === "closed";
    const updated = await storage.updateRemark(String(remark.id), {
      ...remarkPayload,
      status: reopened ? "open" : remark.status,
      resolvedAt: reopened ? null : remark.resolvedAt,
      resolvedBy: reopened ? null : remark.resolvedBy,
      updatedAt: new Date(),
    });
    remark = updated ?? remark;
  } else {
    remark = await storage.createRemark({
      ...remarkPayload,
      status: "open",
      notes: [],
    });
  }

  if (remark.linkedTaskId) {
    const task = await storage.getTask(remark.linkedTaskId);
    if (task) {
      await storage.updateTask(remark.linkedTaskId, {
        title: remark.title,
        description: remark.description,
        priority: remark.priority,
        status:
          task.status === "completed"
            ? "completed"
            : reopened && issuesCount > 0
              ? "pending"
              : task.status,
        completedAt:
          issuesCount === 0 && task.status !== "completed"
            ? new Date()
            : reopened
              ? null
              : task.completedAt,
      });
      return remark;
    }
  }

  await createTaskFromRemark(remark, user);
  return remark;
}

/** @deprecated use syncRemarkFromDailyInspection */
export async function createRemarkFromDailyInspection(
  inspection: Parameters<typeof syncRemarkFromDailyInspection>[0],
  user: AuthUser
) {
  return syncRemarkFromDailyInspection(inspection, user);
}

export async function createMaintenanceFromServiceRequest(
  request: typeof serviceRequests.$inferSelect,
  user: AuthUser
) {
  if (request.requestType !== "maintenance") return null;

  const existing = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.equipmentId, request.equipmentId));

  const linked = existing.find((m) => m.notes?.includes(`SR#${request.id}`));
  if (linked) return linked;

  const record = await storage.createMaintenanceRecord({
    equipmentId: request.equipmentId,
    equipmentName: request.equipmentName,
    maintenanceType: "Плановое ТО",
    scheduledDate: request.plannedDate ? new Date(request.plannedDate) : new Date(),
    responsible: request.assigneeName ?? user.name,
    status: "scheduled",
    priority: "medium",
    notes: `SR#${request.id}: ${request.problemDescription.slice(0, 200)}`,
    createdById: user.id,
    createdByName: user.name,
  });

  if (shouldCreateMaintenanceTaskNow(new Date(record.scheduledDate))) {
    await createTaskFromMaintenance(record, user);
  }
  return record;
}
