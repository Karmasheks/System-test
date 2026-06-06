import type { Express, Request, Response } from "express";
import type { AuthenticatedUser } from "./routes";
import {
  createServiceRequestSchema,
  transitionServiceRequestSchema,
  addTimeEntrySchema,
  addRequestPartSchema,
  addCoexecutorSchema,
  addTaskCommentSchema,
  updateServiceRequestDetailsSchema,
  addRequestLinkSchema,
  createServiceRequestSubtaskSchema,
} from "@shared/schema";
import {
  SERVICE_REQUEST_TYPES,
  URGENCY_LEVELS,
  STATUS_LABELS,
  REQUESTER_ROLES,
  MANAGER_ROLES,
  ADMIN_ROLES,
  AWAITING_USER_CONFIRM_STATUSES,
  ENGINEER_ROLES,
  priorityFromUrgency,
  type ServiceRequestStatus,
} from "@shared/service-request-constants";
import { getIsoWeek } from "@shared/iso-week";
import { filterBySubdivisionScope } from "@shared/subdivision-scope";
import {
  assertSubdivisionAccess,
  getSubdivisionScopeForRequest,
  subdivisionForbidden,
} from "./subdivision-scope-middleware";
import {
  listServiceRequests,
  getServiceRequestById,
  createServiceRequest,
  updateServiceRequest,
  getEquipmentForRequest,
  getTimeEntries,
  addTimeEntry,
  addStatusHistory,
  getStatusHistory,
  addRequestComment,
  getRequestComments,
  addAuditLog,
  getAssignableUsers,
  getTotalHoursForRequest,
  getRequestParts,
  addRequestPart,
  updateRequestPartReservation,
  updateRequestPartStatus,
  getCoexecutors,
  addCoexecutor,
  removeCoexecutor,
  getRequestLinks,
  addRequestLink,
  removeRequestLink,
  getHoursByUser,
  getPlanningByWeek,
  getEngineerWorkload,
  getMonthlyClosedReport,
  findRequestByJiraKey,
  getRequestsByEquipmentId,
} from "./service-request-storage";
import {
  ensureChecklistForRequest,
  updateChecklistItem,
  seedDefaultTemplates,
  listAllTemplates,
  createChecklistTemplate,
  deleteChecklistTemplate,
} from "./service-request-checklist";
import {
  onServiceRequestCreated,
  onServiceRequestTransition,
  onPartsReceived,
} from "./service-request-notifications";
import { linkBudgetToServiceRequest } from "./asset-management-storage";
import { validateTransition, WorkflowError } from "./service-request-workflow";
import { updateChecklistItemSchema, insertChecklistTemplateSchema } from "@shared/schema";
import { isToRequestType } from "@shared/service-request-constants";
import { reservePartForWork, handleServiceRequestWarehouseTransition } from "./part-reservation-service";
import {
  createServiceRequestSubtask,
  listTasksForServiceRequest,
  getServiceRequestWorkProgress,
  tryCompleteParentTaskForServiceRequest,
} from "./task-orchestration-service";

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;
type RoleMiddleware = (roles: string[]) => (req: Request, res: Response, next: Function) => void;

function csvEscape(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function registerServiceRequestRoutes(
  app: Express,
  authenticate: AuthMiddleware,
  requireRole?: RoleMiddleware
) {
  const managerOnly = requireRole
    ? requireRole(["admin", "manager"])
    : (_req: Request, _res: Response, next: Function) => next();

  seedDefaultTemplates().catch(() => {});

  app.get("/api/checklist-templates", authenticate, managerOnly, async (_req, res) => {
    try {
      const templates = await listAllTemplates();
      res.json(templates);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки шаблонов" });
    }
  });

  app.post("/api/checklist-templates", authenticate, managerOnly, async (req, res) => {
    try {
      const body = insertChecklistTemplateSchema.parse(req.body);
      const row = await createChecklistTemplate({
        requestType: body.requestType,
        equipmentType: body.equipmentType || null,
        equipmentModel: body.equipmentModel || null,
        category: body.category,
        itemText: body.itemText,
        measurementUnit: body.measurementUnit || null,
        measurementNorm: body.measurementNorm || null,
        sortOrder: body.sortOrder ?? 0,
      });
      res.status(201).json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.delete("/api/checklist-templates/:id", authenticate, managerOnly, async (req, res) => {
    const ok = await deleteChecklistTemplate(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Не найдено" });
    res.json({ ok: true });
  });

  app.get("/api/service-requests/meta", authenticate, (_req, res) => {
    res.json({
      types: SERVICE_REQUEST_TYPES,
      urgencyLevels: URGENCY_LEVELS,
      statusLabels: STATUS_LABELS,
    });
  });

  app.get("/api/service-requests/assignees", authenticate, async (_req, res) => {
    try {
      const users = await getAssignableUsers();
      const engineers = users.filter((u) =>
        ["admin", "manager", "engineer", "technician", "service_engineer"].includes(u.role)
      );
      res.json(engineers);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки исполнителей" });
    }
  });

  app.get("/api/service-requests/planning", authenticate, async (req, res) => {
    try {
      const week = req.query.week as string | undefined;
      const [requests, workload] = await Promise.all([
        getPlanningByWeek(week),
        getEngineerWorkload(week ?? getIsoWeek(new Date())),
      ]);
      res.json({ requests, workload, week: week ?? getIsoWeek(new Date()) });
    } catch {
      res.status(500).json({ message: "Ошибка планирования" });
    }
  });

  app.get("/api/service-requests/report/monthly", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      if (!(MANAGER_ROLES as readonly string[]).includes(user.role)) {
        return res.status(403).json({ message: "Отчёт доступен руководителю" });
      }
      const now = new Date();
      const year = Number(req.query.year) || now.getFullYear();
      const month = Number(req.query.month) || now.getMonth() + 1;
      const format = (req.query.format as string) || "json";

      const report = await getMonthlyClosedReport(year, month);

      if (format === "csv") {
        const header = [
          "ID",
          "Оборудование",
          "Тип",
          "Исполнитель",
          "Часы",
          "Комментарий",
          "Закрыта",
        ].join(",");
        const lines = report.map((r) =>
          [
            r.id,
            r.equipmentName,
            r.requestType,
            r.assigneeName,
            r.totalHours,
            r.completionComment,
            r.closedAt,
          ]
            .map(csvEscape)
            .join(",")
        );
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="service-report-${year}-${month}.csv"`
        );
        return res.send("\uFEFF" + [header, ...lines].join("\n"));
      }

      res.json({ year, month, items: report });
    } catch {
      res.status(500).json({ message: "Ошибка формирования отчёта" });
    }
  });

  app.post("/api/integrations/sap/parts-received", async (req, res) => {
    try {
      const secret = process.env.SAP_WEBHOOK_SECRET;
      if (secret && req.headers["x-sap-secret"] !== secret) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { jiraIssueKey, requestId, comment } = req.body;
      let request =
        requestId != null ? await getServiceRequestById(Number(requestId)) : undefined;
      if (!request && jiraIssueKey) {
        request = await findRequestByJiraKey(String(jiraIssueKey));
      }
      if (!request) {
        return res.status(404).json({ message: "Заявка не найдена" });
      }

      const parts = await getRequestParts(request.id);
      for (const p of parts) {
        if (p.status !== "received") {
          await updateRequestPartStatus(p.id, "received", p.quantityRequired);
        }
      }

      const updates: Record<string, unknown> = {
        partsReceivedAt: new Date(),
      };
      if (request.status === "waiting_parts") {
        updates.status = "in_progress";
      }

      await updateServiceRequest(request.id, updates);
      await onPartsReceived({ ...request, ...updates } as typeof request);
      await addRequestComment({
        requestId: request.id,
        authorId: 0,
        authorName: "SAP",
        body: comment ?? "Запчасти поступили (событие SAP)",
      });
      await addStatusHistory({
        requestId: request.id,
        fromStatus: request.status,
        toStatus: request.status === "waiting_parts" ? "in_progress" : request.status,
        changedById: 0,
        changedByName: "SAP",
        comment: "Поступление запчастей",
      });

      res.json({ ok: true, requestId: request.id });
    } catch (e: any) {
      res.status(500).json({ message: e.message ?? "Ошибка SAP webhook" });
    }
  });

  app.get("/api/service-requests", authenticate, async (req, res) => {
    try {
      const { status, assigneeId, equipmentId, scope, subdivisionId } = req.query;

      let list;
      if (scope === "assigned" || scope === "created") {
        if (!req.user) {
          return res.status(401).json({ message: "Authentication required" });
        }
        const { listServiceRequestsForUserScope } = await import("./user-work-service");
        list = await listServiceRequestsForUserScope(req.user.id, scope, {
          status: status as string | undefined,
          equipmentId: equipmentId as string | undefined,
        });
      } else {
        list = await listServiceRequests({
          status: status as string | undefined,
          assigneeId: assigneeId ? Number(assigneeId) : undefined,
          equipmentId: equipmentId as string | undefined,
        });
      }

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        list = filterBySubdivisionScope(list, subScope);
      }
      const subId = subdivisionId ? Number(subdivisionId) : undefined;
      if (subId && !Number.isNaN(subId)) {
        list = list.filter((r) => r.subdivisionId === subId);
      }
      res.json(list);
    } catch {
      res.status(500).json({ message: "Ошибка загрузки заявок" });
    }
  });

  app.get("/api/service-requests/:id", authenticate, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Неверный ID" });

      const request = await getServiceRequestById(id);
      if (!request) return res.status(404).json({ message: "Заявка не найдена" });

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, request.subdivisionId);
        } catch {
          return subdivisionForbidden(res);
        }
      }

      const eq = await getEquipmentForRequest(request.equipmentId);
      const checklist = isToRequestType(request.requestType)
        ? await ensureChecklistForRequest(request.id, request.requestType, eq)
        : [];

      const [
        timeEntries,
        history,
        comments,
        totalHours,
        parts,
        coexecutors,
        hoursByUser,
        equipmentHistory,
        links,
        linkedTasks,
        workProgress,
      ] = await Promise.all([
        getTimeEntries(id),
        getStatusHistory(id),
        getRequestComments(id),
        getTotalHoursForRequest(id),
        getRequestParts(id),
        getCoexecutors(id),
        getHoursByUser(id),
        getRequestsByEquipmentId(request.equipmentId),
        getRequestLinks(id),
        listTasksForServiceRequest(id),
        getServiceRequestWorkProgress(id),
      ]);

      res.json({
        request,
        equipment: eq,
        checklist,
        timeEntries,
        history,
        comments,
        totalHours,
        parts,
        coexecutors,
        hoursByUser,
        equipmentHistory: equipmentHistory.filter((h) => h.id !== id).slice(0, 10),
        links,
        linkedTasks,
        workProgress,
      });
    } catch {
      res.status(500).json({ message: "Ошибка загрузки заявки" });
    }
  });

  app.post("/api/service-requests", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      if (user.role === "viewer") {
        return res.status(403).json({ message: "Недостаточно прав для создания заявки" });
      }

      const body = createServiceRequestSchema.parse(req.body);
      const eq = await getEquipmentForRequest(body.equipmentId);
      if (!eq) return res.status(400).json({ message: "Оборудование не найдено" });
      if (eq.status === "decommissioned") {
        return res.status(400).json({ message: "Оборудование выведено из эксплуатации" });
      }

      const subScope = await getSubdivisionScopeForRequest(req);
      if (subScope) {
        try {
          assertSubdivisionAccess(subScope, eq.subdivisionId);
        } catch {
          return subdivisionForbidden(res);
        }
      }

      const request = await createServiceRequest({
        equipmentId: eq.id,
        equipmentName: eq.name,
        requestType: body.requestType,
        problemDescription: body.problemDescription,
        urgency: body.urgency,
        priority: priorityFromUrgency(body.urgency),
        status: "new",
        requesterId: user.id,
        requesterName: user.name,
        subdivisionId: eq.subdivisionId ?? null,
      });

      await addStatusHistory({
        requestId: request.id,
        fromStatus: null,
        toStatus: "new",
        changedById: user.id,
        changedByName: user.name,
        comment: "Заявка создана",
      });

      await onServiceRequestCreated(request);

      try {
        const { createTaskFromServiceRequest, createMaintenanceFromServiceRequest } = await import(
          "./task-orchestration-service"
        );
        await createTaskFromServiceRequest(request, user);
        if (isToRequestType(body.requestType)) {
          await createMaintenanceFromServiceRequest(request, user);
        }
      } catch (autoErr) {
        console.error("Auto-task/maintenance from SR failed:", autoErr);
      }

      if (body.budgetEntryId) {
        await linkBudgetToServiceRequest(request.id, body.budgetEntryId);
      }

      const created = body.budgetEntryId
        ? await getServiceRequestById(request.id)
        : request;
      res.status(201).json(created);
    } catch (e: any) {
      if (e.name === "ZodError") {
        return res.status(400).json({ message: e.errors?.[0]?.message ?? "Неверные данные" });
      }
      res.status(500).json({ message: e.message ?? "Ошибка создания заявки" });
    }
  });

  app.post("/api/service-requests/:id/transition", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const request = await getServiceRequestById(id);
      if (!request) return res.status(404).json({ message: "Заявка не найдена" });

      const payload = transitionServiceRequestSchema.parse(req.body);
      const toStatus = payload.toStatus as ServiceRequestStatus;

      if (payload.adminForceClose) {
        if (!(ADMIN_ROLES as readonly string[]).includes(user.role)) {
          return res.status(403).json({ message: "Только администратор может закрыть заявку без подтверждения" });
        }
        if (toStatus !== "closed") {
          return res.status(400).json({ message: "Принудительное закрытие возможно только в статус «Закрыто»" });
        }
        if (!(AWAITING_USER_CONFIRM_STATUSES as readonly string[]).includes(request.status)) {
          return res.status(400).json({
            message: "Закрытие без подтверждения доступно только для заявок, ожидающих подтверждения заявителя",
          });
        }
        if (!payload.comment?.trim()) {
          return res.status(400).json({ message: "Укажите причину закрытия без подтверждения заявителя" });
        }

        try {
          const { assertServiceRequestSubtasksComplete } = await import("./task-orchestration-service");
          await assertServiceRequestSubtasksComplete(id);
        } catch (e) {
          return res.status(400).json({
            message: e instanceof Error ? e.message : "Не все подзадачи выполнены",
          });
        }

        const forceCloseComment = payload.comment.trim();
        await handleServiceRequestWarehouseTransition(id, "closed", user);
        const updated = await updateServiceRequest(id, {
          status: "closed",
          closedAt: new Date(),
        });
        await addStatusHistory({
          requestId: id,
          fromStatus: request.status,
          toStatus: "closed",
          changedById: user.id,
          changedByName: user.name,
          comment: `Закрыто администратором без подтверждения заявителя: ${forceCloseComment}`,
        });
        await onServiceRequestTransition(request, request.status, "closed", user.name);
        await tryCompleteParentTaskForServiceRequest(id, user);
        return res.json(updated);
      }

      if (toStatus === "closed" && request.status === "user_review") {
        const isManager = (MANAGER_ROLES as readonly string[]).includes(user.role);
        const isRequester = request.requesterId === user.id;
        if (!isManager && !isRequester) {
          return res.status(403).json({ message: "Подтвердить может заявитель или руководитель" });
        }
        if (isRequester && payload.userAccepted !== true) {
          return res.status(400).json({ message: "Подтвердите выполнение работ" });
        }
      }

      if (
        toStatus === "returned" &&
        request.requesterId !== user.id &&
        !(MANAGER_ROLES as readonly string[]).includes(user.role)
      ) {
        return res.status(403).json({ message: "Отклонить может заявитель" });
      }

      const updates = await validateTransition(
        request,
        {
          toStatus,
          comment: payload.comment,
          assigneeId: payload.assigneeId,
          assigneeName: payload.assigneeName,
          priority: payload.priority,
          plannedHours: payload.plannedHours,
          plannedWeek: payload.plannedWeek,
          plannedDate: payload.plannedDate ? new Date(payload.plannedDate) : undefined,
          completionComment: payload.completionComment,
          jiraIssueKey: payload.jiraIssueKey,
          partsRequired: payload.partsRequired,
          parentRequestId: payload.parentRequestId,
          userAccepted: payload.userAccepted,
          userRejectionComment: payload.userRejectionComment,
        },
        user.role
      );
      const effectiveTo = (updates.status ?? toStatus) as ServiceRequestStatus;

      if (payload.priority && payload.priority !== request.priority) {
        if (!payload.auditComment?.trim()) {
          return res.status(400).json({ message: "Комментарий обязателен при смене приоритета" });
        }
        await addAuditLog({
          requestId: id,
          fieldName: "priority",
          oldValue: request.priority,
          newValue: payload.priority,
          comment: payload.auditComment,
          changedById: user.id,
          changedByName: user.name,
        });
        updates.priority = payload.priority;
      }

      await handleServiceRequestWarehouseTransition(id, effectiveTo, user);

      const updated = await updateServiceRequest(id, updates);
      await addStatusHistory({
        requestId: id,
        fromStatus: request.status,
        toStatus: effectiveTo,
        changedById: user.id,
        changedByName: user.name,
        comment: payload.comment ?? payload.completionComment ?? payload.userRejectionComment,
      });

      await onServiceRequestTransition(request, request.status, effectiveTo, user.name);

      if (effectiveTo === "closed") {
        await tryCompleteParentTaskForServiceRequest(id, user);
      }

      res.json(updated);
    } catch (e) {
      if (e instanceof WorkflowError) return res.status(400).json({ message: e.message });
      res.status(500).json({ message: "Ошибка смены статуса" });
    }
  });

  app.post("/api/service-requests/:id/time-entries", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const request = await getServiceRequestById(id);
      if (!request) return res.status(404).json({ message: "Заявка не найдена" });

      const body = addTimeEntrySchema.parse(req.body);
      const entry = await addTimeEntry({
        requestId: id,
        userId: user.id,
        userName: user.name,
        hours: body.hours,
        workDate: body.workDate,
        comment: body.comment,
      });
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка добавления времени" });
    }
  });

  app.post("/api/service-requests/:id/parts", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const request = await getServiceRequestById(id);
      if (!request) return res.status(404).json({ message: "Заявка не найдена" });

      const body = addRequestPartSchema.parse(req.body);
      let part = await addRequestPart({ requestId: id, ...body });

      if (body.warehousePartId) {
        const reservation = await reservePartForWork(
          body.warehousePartId,
          body.quantityRequired,
          user,
          {
            serviceRequestId: id,
            serviceRequestTitle: `Заявка #${id}`,
            equipmentId: request.equipmentId,
            equipmentName: request.equipmentName,
          }
        );
        const linked = await updateRequestPartReservation(part.id, {
          warehousePartId: body.warehousePartId,
          reservationId: reservation.id,
        });
        if (linked) part = linked;
      }

      res.status(201).json(part);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка добавления запчасти" });
    }
  });

  app.post("/api/service-requests/:id/tasks", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const request = await getServiceRequestById(id);
      if (!request) return res.status(404).json({ message: "Заявка не найдена" });

      const isManager = (MANAGER_ROLES as readonly string[]).includes(user.role);
      const isEngineer = (ENGINEER_ROLES as readonly string[]).includes(user.role);
      if (!isManager && !isEngineer) {
        return res.status(403).json({ message: "Недостаточно прав для создания подзадач" });
      }

      const body = createServiceRequestSubtaskSchema.parse(req.body);
      const task = await createServiceRequestSubtask(id, body, user);
      res.status(201).json(task);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка создания подзадачи" });
    }
  });

  app.post("/api/service-requests/:id/links", authenticate, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const request = await getServiceRequestById(id);
      if (!request) return res.status(404).json({ message: "Заявка не найдена" });

      const body = addRequestLinkSchema.parse(req.body);
      const link = await addRequestLink({ requestId: id, ...body });
      res.status(201).json(link);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка добавления ссылки" });
    }
  });

  app.delete("/api/service-requests/:id/links/:linkId", authenticate, async (req, res) => {
    const ok = await removeRequestLink(Number(req.params.linkId));
    if (!ok) return res.status(404).json({ message: "Ссылка не найдена" });
    res.json({ ok: true });
  });

  app.patch("/api/service-requests/:id/details", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const request = await getServiceRequestById(id);
      if (!request) return res.status(404).json({ message: "Заявка не найдена" });

      const isManager = (MANAGER_ROLES as readonly string[]).includes(user.role);
      const isEngineer = (ENGINEER_ROLES as readonly string[]).includes(user.role);
      if (!isManager && !isEngineer) {
        return res.status(403).json({ message: "Недостаточно прав для изменения заявки" });
      }

      const body = updateServiceRequestDetailsSchema.parse(req.body);
      const updates: Record<string, unknown> = {};

      if (body.equipmentId && body.equipmentId !== request.equipmentId) {
        const eq = await getEquipmentForRequest(body.equipmentId);
        if (!eq) {
          return res.status(400).json({ message: "Оборудование не найдено" });
        }
        updates.equipmentId = eq.id;
        updates.equipmentName = eq.name;
        await addAuditLog({
          requestId: id,
          fieldName: "equipmentId",
          oldValue: request.equipmentId,
          newValue: eq.id,
          comment: `Привязка к оборудованию: ${eq.name}`,
          changedById: user.id,
          changedByName: user.name,
        });
      }

      if (body.requestType && body.requestType !== request.requestType) {
        updates.requestType = body.requestType;
        await addAuditLog({
          requestId: id,
          fieldName: "requestType",
          oldValue: request.requestType,
          newValue: body.requestType,
          comment: "Изменение типа заявки",
          changedById: user.id,
          changedByName: user.name,
        });
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Нет изменений для сохранения" });
      }

      const updated = await updateServiceRequest(id, updates);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка обновления заявки" });
    }
  });

  app.post("/api/service-requests/:id/coexecutors", authenticate, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = addCoexecutorSchema.parse(req.body);
      const row = await addCoexecutor({ requestId: id, ...body });
      res.status(201).json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.delete("/api/service-requests/:id/coexecutors/:coId", authenticate, async (req, res) => {
    const ok = await removeCoexecutor(Number(req.params.coId));
    if (!ok) return res.status(404).json({ message: "Не найдено" });
    res.json({ ok: true });
  });

  app.patch("/api/service-requests/:id/checklist/:itemId", authenticate, async (req, res) => {
    try {
      const requestId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      const body = updateChecklistItemSchema.parse(req.body);
      const row = await updateChecklistItem(itemId, requestId, body);
      if (!row) return res.status(404).json({ message: "Пункт не найден" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка" });
    }
  });

  app.post("/api/service-requests/:id/comments", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const id = Number(req.params.id);
      const parsed = addTaskCommentSchema.parse(req.body);

      const comment = await addRequestComment({
        requestId: id,
        authorId: user.id,
        authorName: user.name,
        body: parsed.body.trim(),
        attachments: parsed.attachments ?? [],
      });
      res.status(201).json(comment);
    } catch (e: any) {
      res.status(400).json({ message: e.message ?? "Ошибка добавления комментария" });
    }
  });
}
