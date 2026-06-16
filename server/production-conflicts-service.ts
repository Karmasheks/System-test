import { db } from "./db";
import {
  equipment,
  maintenanceRecords,
  productionSchedule,
  productEquipment,
  products,
  productionOrders,
  serviceRequests,
  tasks,
  type ProductionConflictSeverity,
  type ProductionConflictType,
} from "@shared/schema";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { calculateMaterialRequirements } from "./production-materials-service";

const ACTIVE_MAINTENANCE_STATUSES = ["scheduled", "in_progress", "overdue", "unplanned", "postponed"];

const CLOSED_SR_STATUSES = ["closed", "cancelled", "duplicate", "not_needed"];
const ACTIVE_SCHEDULE_STATUSES = ["planned", "in_progress", "paused"];
const ACTIVE_TASK_STATUSES = ["pending", "in_progress", "overdue"];
const REPAIR_TASK_TYPES = ["repair", "diagnostics"];
const REPAIR_SR_TYPES = ["repair", "diagnostics"];

export interface ProductionConflictItem {
  conflictType: ProductionConflictType;
  severity: ProductionConflictSeverity;
  message: string;
  linkedMaintenanceId?: number;
  linkedServiceRequestId?: number;
  linkedTaskId?: number;
  equipmentId?: string;
  orderId?: number;
}

export interface ScheduleConflictCheckInput {
  subdivisionId: number;
  orderId: number;
  equipmentId: string;
  startTime: Date;
  endTime: Date;
  plannedQuantity: number;
  scheduleId?: number;
  productId?: number;
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function checkScheduleConflicts(
  input: ScheduleConflictCheckInput
): Promise<ProductionConflictItem[]> {
  const conflicts: ProductionConflictItem[] = [];
  const {
    subdivisionId,
    orderId,
    equipmentId,
    startTime,
    endTime,
    plannedQuantity,
    scheduleId,
    productId: productIdInput,
  } = input;

  if (endTime <= startTime) {
    conflicts.push({
      conflictType: "deadline_risk",
      severity: "blocking",
      message: "Время завершения должно быть позже времени начала",
      orderId,
      equipmentId,
    });
    return conflicts;
  }

  const [order] = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.id, orderId));
  if (!order) {
    conflicts.push({
      conflictType: "missing_norm",
      severity: "blocking",
      message: "Производственный заказ не найден",
      orderId,
    });
    return conflicts;
  }

  if (order.subdivisionId !== subdivisionId) {
    conflicts.push({
      conflictType: "cross_subdivision",
      severity: "blocking",
      message: "Подразделение заказа не совпадает с указанным",
      orderId,
    });
  }

  const productId = productIdInput ?? order.productId;

  const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, equipmentId));
  if (!eqRow) {
    conflicts.push({
      conflictType: "equipment_busy",
      severity: "blocking",
      message: "Оборудование не найдено",
      equipmentId,
    });
    return conflicts;
  }

  const eqSubdivision = eqRow.subdivisionId ?? eqRow.homeSubdivisionId;
  if (eqSubdivision != null && eqSubdivision !== subdivisionId) {
    conflicts.push({
      conflictType: "cross_subdivision",
      severity: "blocking",
      message: `Оборудование «${eqRow.name}» принадлежит другому подразделению`,
      equipmentId,
      orderId,
    });
  }

  if (eqRow.repairSubdivisionId != null) {
    conflicts.push({
      conflictType: "repair_overlap",
      severity: "blocking",
      message: `Оборудование «${eqRow.name}» отправлено в ремонт (подразделение ${eqRow.repairSubdivisionName ?? eqRow.repairSubdivisionId})`,
      equipmentId,
      orderId,
    });
  }

  if (eqRow.status === "repair" || eqRow.status === "maintenance") {
    conflicts.push({
      conflictType: "repair_overlap",
      severity: "blocking",
      message: `Оборудование «${eqRow.name}» в статусе «${eqRow.status}» — недоступно для планирования`,
      equipmentId,
      orderId,
    });
  }

  const overlappingSchedules = await db
    .select()
    .from(productionSchedule)
    .where(
      and(
        eq(productionSchedule.equipmentId, equipmentId),
        inArray(productionSchedule.status, ACTIVE_SCHEDULE_STATUSES),
        scheduleId ? ne(productionSchedule.id, scheduleId) : undefined
      )
    );

  for (const slot of overlappingSchedules) {
    if (intervalsOverlap(startTime, endTime, slot.startTime, slot.endTime)) {
      conflicts.push({
        conflictType: "equipment_busy",
        severity: "blocking",
        message: `Оборудование занято слотом графика #${slot.id} (${slot.startTime.toISOString()} — ${slot.endTime.toISOString()})`,
        equipmentId,
        orderId,
      });
    }
  }

  const maintenanceRows = await db
    .select()
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.equipmentId, equipmentId),
        inArray(maintenanceRecords.status, [...ACTIVE_MAINTENANCE_STATUSES])
      )
    );

  for (const m of maintenanceRows) {
    const mStart = m.scheduledDate;
    const mEnd = new Date(mStart.getTime() + 4 * 60 * 60 * 1000);
    if (intervalsOverlap(startTime, endTime, mStart, mEnd)) {
      conflicts.push({
        conflictType: "maintenance_overlap",
        severity: "warning",
        message: `Пересечение с плановым ТО #${m.id} (${m.maintenanceType}, ${m.scheduledDate.toISOString()})`,
        equipmentId,
        linkedMaintenanceId: m.id,
        orderId,
      });
    }
  }

  const openRequests = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.equipmentId, equipmentId),
        inArray(serviceRequests.requestType, REPAIR_SR_TYPES),
        ne(serviceRequests.status, "closed")
      )
    );

  for (const sr of openRequests) {
    if (!CLOSED_SR_STATUSES.includes(sr.status)) {
      conflicts.push({
        conflictType: "repair_overlap",
        severity: "blocking",
        message: `Активная заявка #${sr.id} (${sr.requestType}, статус: ${sr.status}) — оборудование недоступно`,
        equipmentId,
        linkedServiceRequestId: sr.id,
        orderId,
      });
    }
  }

  const openTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.equipmentId, equipmentId),
        inArray(tasks.status, ACTIVE_TASK_STATUSES),
        or(
          inArray(tasks.taskType, REPAIR_TASK_TYPES),
          eq(tasks.taskType, "maintenance")
        )
      )
    );

  for (const task of openTasks) {
    conflicts.push({
      conflictType: "repair_overlap",
      severity: "warning",
      message: `Активная задача #${task.id} (${task.taskType ?? "—"}, ${task.title})`,
      equipmentId,
      linkedTaskId: task.id,
      orderId,
    });
  }

  const [product] = await db.select().from(products).where(eq(products.id, productId));
  const [pe] = await db
    .select()
    .from(productEquipment)
    .where(
      and(
        eq(productEquipment.productId, productId),
        eq(productEquipment.equipmentId, equipmentId),
        eq(productEquipment.isActive, true)
      )
    );

  const hasCycle = product?.cycleTimeSec ?? pe?.cycleTimeSecOverride;
  const hasCavities = product?.cavities;
  const hasNorm = product?.defaultShiftNorm ?? pe?.shiftNormOverride;

  if (!hasCycle && !hasCavities && !hasNorm) {
    conflicts.push({
      conflictType: "missing_norm",
      severity: "warning",
      message: "Для изделия не заданы цикл, гнёзда или сменная норма",
      orderId,
      equipmentId,
    });
  }

  if (order.desiredEndDate) {
    const desiredEnd = new Date(order.desiredEndDate);
    desiredEnd.setHours(23, 59, 59, 999);
    if (endTime > desiredEnd) {
      conflicts.push({
        conflictType: "deadline_risk",
        severity: "warning",
        message: `Слот выходит за желаемую дату завершения заказа (${order.desiredEndDate})`,
        orderId,
        equipmentId,
      });
    }
  }

  if (plannedQuantity > 0) {
    const requirements = await calculateMaterialRequirements(
      productId,
      subdivisionId,
      plannedQuantity
    );
    for (const req of requirements) {
      if (!req.sufficient && req.isRequired) {
        conflicts.push({
          conflictType: "no_material",
          severity: req.available <= 0 ? "blocking" : "warning",
          message: `Недостаточно материала «${req.materialName}»: нужно ${req.required}, доступно ${req.available}`,
          orderId,
        });
      }
    }
  }

  return conflicts;
}

export function summarizeConflictStatus(
  conflicts: ProductionConflictItem[]
): "none" | "warning" | "blocked" {
  if (conflicts.some((c) => c.severity === "blocking")) return "blocked";
  if (conflicts.length > 0) return "warning";
  return "none";
}
