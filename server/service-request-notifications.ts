import { storage } from "./storage";
import { getAssignableUsers } from "./service-request-storage";
import { MANAGER_ROLES, STATUS_LABELS, type ServiceRequestStatus } from "../shared/service-request-constants";
import type { ServiceRequest } from "../shared/schema";

async function notifyUsers(
  userIds: number[],
  data: {
    title: string;
    message: string;
    type: string;
    serviceRequestId: number;
    equipmentId?: string;
    priority?: string;
  }
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const userId of unique) {
    await storage.createNotification({
      userId,
      title: data.title,
      message: data.message,
      type: data.type,
      serviceRequestId: data.serviceRequestId,
      equipmentId: data.equipmentId,
      priority: data.priority ?? "medium",
    });
  }
}

export async function notifyManagersAboutRequest(
  request: ServiceRequest,
  title: string,
  message: string,
  type: string,
  priority = "medium"
) {
  const users = await getAssignableUsers();
  const managerIds = users
    .filter((u) => (MANAGER_ROLES as readonly string[]).includes(u.role))
    .map((u) => u.id);
  await notifyUsers(managerIds, {
    title,
    message,
    type,
    serviceRequestId: request.id,
    equipmentId: request.equipmentId,
    priority,
  });
}

export async function onServiceRequestCreated(request: ServiceRequest) {
  await notifyManagersAboutRequest(
    request,
    `Новая заявка #${request.id}`,
    `${request.equipmentName}: ${request.problemDescription.slice(0, 120)}`,
    "service_request_new",
    request.urgency >= 4 ? "high" : "medium"
  );
}

export async function onServiceRequestTransition(
  request: ServiceRequest,
  fromStatus: string,
  toStatus: ServiceRequestStatus,
  actorName: string
) {
  const label = STATUS_LABELS[toStatus] ?? toStatus;
  const base = `Заявка #${request.id}: ${label} (${actorName})`;

  const recipients: number[] = [];

  if (request.assigneeId) recipients.push(request.assigneeId);
  if (request.requesterId) recipients.push(request.requesterId);

  const users = await getAssignableUsers();
  const managerIds = users
    .filter((u) => (MANAGER_ROLES as readonly string[]).includes(u.role))
    .map((u) => u.id);
  recipients.push(...managerIds);

  await notifyUsers([...new Set(recipients)], {
    title: `Статус: ${label}`,
    message: base,
    type: "service_request_status",
    serviceRequestId: request.id,
    equipmentId: request.equipmentId,
    priority: toStatus === "user_review" ? "high" : "medium",
  });

  if (toStatus === "user_review" && request.requesterId) {
    await notifyUsers([request.requesterId], {
      title: "Подтвердите выполнение работ",
      message: `Заявка #${request.id} по ${request.equipmentName} ожидает вашего подтверждения`,
      type: "service_request_review",
      serviceRequestId: request.id,
      equipmentId: request.equipmentId,
      priority: "high",
    });
  }

  if (toStatus === "waiting_parts" && request.assigneeId) {
    await notifyUsers([request.assigneeId], {
      title: "Ожидание запчастей",
      message: `Заявка #${request.id}: ожидание запчастей`,
      type: "service_request_parts",
      serviceRequestId: request.id,
      equipmentId: request.equipmentId,
      priority: "medium",
    });
  }
}

export async function onPartsReceived(request: ServiceRequest) {
  const recipients: number[] = [];
  if (request.assigneeId) recipients.push(request.assigneeId);
  const users = await getAssignableUsers();
  recipients.push(
    ...users
      .filter((u) => (MANAGER_ROLES as readonly string[]).includes(u.role))
      .map((u) => u.id)
  );
  await notifyUsers([...new Set(recipients)], {
    title: "Запчасти поступили",
    message: `Заявка #${request.id} — можно продолжать работу`,
    type: "service_request_parts_received",
    serviceRequestId: request.id,
    equipmentId: request.equipmentId,
    priority: "high",
  });
}
