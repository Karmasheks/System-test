import type { ServiceRequest } from "../shared/schema";
import {
  type ServiceRequestStatus,
  canTransition,
  MANAGER_ROLES,
  ENGINEER_ROLES,
  priorityFromUrgency,
} from "../shared/service-request-constants";
import {
  getTotalHoursForRequest,
  getRequestParts,
} from "./service-request-storage";
import { validateChecklistComplete } from "./service-request-checklist";
import { isToRequestType } from "../shared/service-request-constants";
import { isoWeekToMonday } from "@shared/iso-week";
import { assertServiceRequestSubtasksComplete } from "./task-orchestration-service";

export type TransitionPayload = {
  toStatus: ServiceRequestStatus;
  comment?: string;
  assigneeId?: number;
  assigneeName?: string;
  priority?: string;
  plannedHours?: number;
  plannedWeek?: string;
  plannedDate?: Date;
  completionComment?: string;
  jiraIssueKey?: string;
  partsRequired?: boolean;
  parentRequestId?: number;
  userAccepted?: boolean;
  userRejectionComment?: string;
};

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export async function validateTransition(
  request: ServiceRequest,
  payload: TransitionPayload,
  userRole: string
): Promise<Partial<ServiceRequest>> {
  const from = request.status as ServiceRequestStatus;
  const to = payload.toStatus;

  if (!canTransition(from, to)) {
    throw new WorkflowError(`Переход «${from}» → «${to}» недопустим`);
  }

  const updates: Partial<ServiceRequest> = { status: to };
  const isManager = (MANAGER_ROLES as readonly string[]).includes(userRole);
  const isEngineer = (ENGINEER_ROLES as readonly string[]).includes(userRole);

  switch (to) {
    case "assigned": {
      if (!isManager && !isEngineer) {
        throw new WorkflowError("Назначать исполнителя могут руководитель или инженер");
      }
      const assigneeId = payload.assigneeId ?? request.assigneeId;
      const assigneeName = payload.assigneeName ?? request.assigneeName;
      if (!assigneeId || !assigneeName) {
        throw new WorkflowError("Укажите исполнителя");
      }
      updates.assigneeId = assigneeId;
      updates.assigneeName = assigneeName;
      updates.priority = payload.priority ?? request.priority ?? priorityFromUrgency(request.urgency);
      if (payload.plannedHours != null) updates.plannedHours = payload.plannedHours;
      if (payload.plannedWeek) updates.plannedWeek = payload.plannedWeek;
      else if (request.plannedWeek) updates.plannedWeek = request.plannedWeek;
      if (payload.plannedDate) updates.plannedDate = payload.plannedDate;
      else if (request.plannedDate) updates.plannedDate = request.plannedDate;
      if (!updates.plannedWeek && !updates.plannedDate) {
        throw new WorkflowError("Укажите плановую неделю или дату выполнения");
      }
      if (!updates.plannedDate && updates.plannedWeek) {
        const monday = isoWeekToMonday(updates.plannedWeek);
        if (monday) updates.plannedDate = monday;
      }
      break;
    }
    case "in_progress": {
      if (!isEngineer) throw new WorkflowError("Недостаточно прав");
      break;
    }
    case "waiting_parts": {
      if (!isEngineer) throw new WorkflowError("Недостаточно прав");
      const parts = await getRequestParts(request.id);
      if (parts.length === 0) {
        throw new WorkflowError("Добавьте хотя бы одну позицию запчастей");
      }
      updates.partsRequired = true;
      break;
    }
    case "done": {
      if (!isEngineer) throw new WorkflowError("Недостаточно прав");
      try {
        await assertServiceRequestSubtasksComplete(request.id);
      } catch (e) {
        throw new WorkflowError(e instanceof Error ? e.message : "Не все подзадачи выполнены");
      }
      const totalHours = await getTotalHoursForRequest(request.id);
      if (totalHours <= 0) {
        throw new WorkflowError("Укажите фактические трудозатраты перед завершением");
      }
      if (isToRequestType(request.requestType)) {
        const checklistErr = await validateChecklistComplete(request.id);
        if (checklistErr) throw new WorkflowError(checklistErr);
      }
      if (!payload.completionComment?.trim()) {
        throw new WorkflowError("Укажите итоговый комментарий");
      }
      updates.completionComment = payload.completionComment.trim();
      updates.status = "user_review";
      break;
    }
    case "user_review": {
      break;
    }
    case "closed": {
      try {
        await assertServiceRequestSubtasksComplete(request.id);
      } catch (e) {
        throw new WorkflowError(e instanceof Error ? e.message : "Не все подзадачи выполнены");
      }
      if (!isManager && request.requesterId !== undefined) {
        // заявитель может закрыть после принятия — проверяется отдельно в routes
      }
      if (payload.userAccepted === true || request.userAccepted === true) {
        updates.userAccepted = true;
        updates.closedAt = new Date();
      } else if (isManager) {
        updates.closedAt = new Date();
      } else {
        throw new WorkflowError("Требуется подтверждение заявителя");
      }
      break;
    }
    case "returned": {
      if (!payload.userRejectionComment?.trim()) {
        throw new WorkflowError("Укажите причину «не принято»");
      }
      updates.userAccepted = false;
      updates.userRejectionComment = payload.userRejectionComment.trim();
      break;
    }
    case "duplicate": {
      if (!payload.parentRequestId) {
        throw new WorkflowError("Укажите номер основной заявки");
      }
      updates.parentRequestId = payload.parentRequestId;
      break;
    }
    case "cancelled":
    case "not_needed":
      break;
    default:
      break;
  }

  return updates;
}
