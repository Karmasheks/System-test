import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  maintenanceRecords,
  maintenanceStatusHistory,
  requestStatusHistory,
  serviceRequests,
  taskStatusHistory,
  tasks,
} from "@shared/schema";
import { STATUS_LABELS, type ServiceRequestStatus } from "@shared/service-request-constants";
import { taskStatusLabel } from "@shared/task-status-constants";
import { maintenanceStatusLabel } from "@shared/maintenance-status-constants";

export type StatusDurationEntityType = "task" | "service_request" | "maintenance";

export interface StatusDurationSummary {
  entityType: StatusDurationEntityType;
  status: string;
  statusLabel: string;
  totalHours: number;
  entityCount: number;
  avgHours: number;
}

export interface StatusDurationEntity {
  entityType: StatusDurationEntityType;
  entityId: number;
  title: string;
  status: string;
  statusLabel: string;
  hours: number;
  equipmentId?: string | null;
  equipmentName?: string | null;
}

export interface StatusDurationReport {
  from: string | null;
  to: string | null;
  summary: StatusDurationSummary[];
  entities: StatusDurationEntity[];
}

function statusLabel(entityType: StatusDurationEntityType, status: string): string {
  if (entityType === "service_request") {
    return STATUS_LABELS[status as ServiceRequestStatus] ?? status;
  }
  if (entityType === "maintenance") {
    return maintenanceStatusLabel(status);
  }
  return taskStatusLabel(status);
}

function clipSegmentMs(
  start: Date,
  end: Date,
  rangeFrom?: Date,
  rangeTo?: Date
): number {
  const segStart = rangeFrom && start < rangeFrom ? rangeFrom : start;
  const segEnd = rangeTo && end > rangeTo ? rangeTo : end;
  const ms = segEnd.getTime() - segStart.getTime();
  return ms > 0 ? ms : 0;
}

export function computeDurations(
  history: { fromStatus: string | null; toStatus: string; createdAt: Date }[],
  entityCreatedAt: Date,
  currentStatus: string,
  entityEndAt: Date,
  rangeFrom?: Date,
  rangeTo?: Date
): Map<string, number> {
  const durations = new Map<string, number>();
  const sorted = [...history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const endBound = entityEndAt;

  if (sorted.length === 0) {
    const ms = clipSegmentMs(entityCreatedAt, endBound, rangeFrom, rangeTo);
    if (ms > 0) {
      durations.set(currentStatus, (durations.get(currentStatus) ?? 0) + ms);
    }
    return durations;
  }

  const initialStatus = sorted[0].fromStatus ?? currentStatus;
  const firstChange = sorted[0].createdAt;
  const initialMs = clipSegmentMs(entityCreatedAt, firstChange, rangeFrom, rangeTo);
  if (initialMs > 0) {
    durations.set(initialStatus, (durations.get(initialStatus) ?? 0) + initialMs);
  }

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const nextTime = sorted[i + 1]?.createdAt ?? endBound;
    const ms = clipSegmentMs(entry.createdAt, nextTime, rangeFrom, rangeTo);
    if (ms > 0) {
      durations.set(entry.toStatus, (durations.get(entry.toStatus) ?? 0) + ms);
    }
  }

  return durations;
}

export async function getStatusDurationReport(opts: {
  from?: Date;
  to?: Date;
  equipmentId?: string;
}): Promise<StatusDurationReport> {
  const now = new Date();
  const rangeFrom = opts.from;
  const rangeTo = opts.to ?? now;

  const taskFilter = opts.equipmentId ? eq(tasks.equipmentId, opts.equipmentId) : undefined;
  const taskRows = await db
    .select()
    .from(tasks)
    .where(taskFilter ?? sql`true`);

  const srFilter = opts.equipmentId ? eq(serviceRequests.equipmentId, opts.equipmentId) : undefined;
  const srRows = await db
    .select()
    .from(serviceRequests)
    .where(srFilter ?? sql`true`);

  const summaryMap = new Map<string, { ms: number; entities: Set<string> }>();
  const entities: StatusDurationEntity[] = [];

  for (const task of taskRows) {
    const history = await db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id));

    const endAt = task.completedAt ?? (task.status === "completed" ? task.updatedAt : now);
    const durations = computeDurations(
      history,
      task.createdAt,
      task.status,
      endAt,
      rangeFrom,
      rangeTo
    );

    for (const [status, ms] of durations) {
      const key = `task:${status}`;
      const hours = ms / 3600000;
      if (hours <= 0) continue;
      const bucket = summaryMap.get(key) ?? { ms: 0, entities: new Set<string>() };
      bucket.ms += ms;
      bucket.entities.add(String(task.id));
      summaryMap.set(key, bucket);

      entities.push({
        entityType: "task",
        entityId: task.id,
        title: task.title,
        status,
        statusLabel: statusLabel("task", status),
        hours: Math.round(hours * 10) / 10,
        equipmentId: task.equipmentId,
      });
    }
  }

  for (const sr of srRows) {
    const history = await db
      .select()
      .from(requestStatusHistory)
      .where(eq(requestStatusHistory.requestId, sr.id));

    const endAt = sr.closedAt ?? (["closed", "cancelled", "duplicate", "not_needed"].includes(sr.status) ? sr.updatedAt : now);
    const durations = computeDurations(
      history,
      sr.createdAt,
      sr.status,
      endAt,
      rangeFrom,
      rangeTo
    );

    for (const [status, ms] of durations) {
      const key = `sr:${status}`;
      const hours = ms / 3600000;
      if (hours <= 0) continue;
      const bucket = summaryMap.get(key) ?? { ms: 0, entities: new Set<string>() };
      bucket.ms += ms;
      bucket.entities.add(String(sr.id));
      summaryMap.set(key, bucket);

      entities.push({
        entityType: "service_request",
        entityId: sr.id,
        title: `#${sr.id}: ${sr.problemDescription.slice(0, 60)}`,
        status,
        statusLabel: statusLabel("service_request", status),
        hours: Math.round(hours * 10) / 10,
        equipmentId: sr.equipmentId,
        equipmentName: sr.equipmentName,
      });
    }
  }

  const maintFilter = opts.equipmentId
    ? eq(maintenanceRecords.equipmentId, opts.equipmentId)
    : undefined;
  const maintRows = await db
    .select()
    .from(maintenanceRecords)
    .where(maintFilter ?? sql`true`);

  for (const record of maintRows) {
    const history = await db
      .select()
      .from(maintenanceStatusHistory)
      .where(eq(maintenanceStatusHistory.maintenanceRecordId, record.id));

    const endAt =
      record.completedDate ??
      (record.status === "completed" ? record.updatedAt : now);
    const durations = computeDurations(
      history,
      record.createdAt,
      record.status,
      endAt,
      rangeFrom,
      rangeTo
    );

    for (const [status, ms] of durations) {
      const key = `maint:${status}`;
      const hours = ms / 3600000;
      if (hours <= 0) continue;
      const bucket = summaryMap.get(key) ?? { ms: 0, entities: new Set<string>() };
      bucket.ms += ms;
      bucket.entities.add(String(record.id));
      summaryMap.set(key, bucket);

      entities.push({
        entityType: "maintenance",
        entityId: record.id,
        title: `${record.maintenanceType} — ${record.equipmentName}`,
        status,
        statusLabel: statusLabel("maintenance", status),
        hours: Math.round(hours * 10) / 10,
        equipmentId: record.equipmentId,
        equipmentName: record.equipmentName,
      });
    }
  }

  const summary: StatusDurationSummary[] = [];
  for (const [key, bucket] of summaryMap) {
    const [entityTypeRaw, status] = key.split(":");
    const entityType: StatusDurationEntityType =
      entityTypeRaw === "sr"
        ? "service_request"
        : entityTypeRaw === "maint"
          ? "maintenance"
          : "task";
    const totalHours = Math.round((bucket.ms / 3600000) * 10) / 10;
    const entityCount = bucket.entities.size;
    summary.push({
      entityType,
      status,
      statusLabel: statusLabel(entityType, status),
      totalHours,
      entityCount,
      avgHours: entityCount > 0 ? Math.round((totalHours / entityCount) * 10) / 10 : 0,
    });
  }

  summary.sort((a, b) => b.totalHours - a.totalHours);
  entities.sort((a, b) => b.hours - a.hours);

  return {
    from: rangeFrom?.toISOString() ?? null,
    to: rangeTo.toISOString(),
    summary,
    entities: entities.slice(0, 200),
  };
}
