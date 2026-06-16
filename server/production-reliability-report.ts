import { db } from "./db";
import {
  equipment,
  productionDowntimes,
  requestStatusHistory,
  serviceRequests,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { computeDurations } from "./status-duration-reports";
import { getOeeAnalytics } from "./production-oee-service";
import type { OeeSummaryMetrics } from "@shared/production-oee-types";
import {
  minutesToHours,
  ratioMetric,
  type ProductionReliabilityReport,
  type ReliabilityEquipmentLine,
  type ReliabilityFailureEvent,
} from "@shared/production-reliability-types";

const FAILURE_REQUEST_TYPES = new Set(["repair", "diagnostics"]);
const REPAIR_ACTIVE_STATUSES = new Set(["in_progress", "waiting_parts", "returned"]);
const CLOSED_SR_STATUSES = new Set(["closed", "cancelled", "duplicate", "not_needed"]);

function periodLengthMinutes(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 60000);
}

function overlapsPeriod(start: Date, end: Date, from: Date, to: Date): boolean {
  return start < to && end > from;
}

function inPeriod(date: Date, from: Date, to: Date): boolean {
  return date >= from && date <= to;
}

function repairMinutesFromHistory(
  createdAt: Date,
  status: string,
  closedAt: Date | null,
  updatedAt: Date,
  history: { fromStatus: string | null; toStatus: string; createdAt: Date }[],
  rangeFrom: Date,
  rangeTo: Date
): number {
  const endAt =
    closedAt ??
    (CLOSED_SR_STATUSES.has(status) ? updatedAt : rangeTo);
  const durations = computeDurations(
    history,
    createdAt,
    status,
    endAt,
    rangeFrom,
    rangeTo
  );
  let ms = 0;
  for (const [st, segmentMs] of durations) {
    if (REPAIR_ACTIVE_STATUSES.has(st)) ms += segmentMs;
  }
  return Math.round(ms / 60000);
}

function buildEquipmentLine(
  equipmentId: string,
  equipmentName: string,
  failures: ReliabilityFailureEvent[],
  periodMinutes: number,
  oee: OeeSummaryMetrics | null
): ReliabilityEquipmentLine {
  const repairMinutesTotal = failures.reduce((s, f) => s + f.repairMinutes, 0);
  const failureCount = failures.length;
  const operatingMinutes =
    oee != null && oee.operatingMinutes > 0
      ? oee.operatingMinutes
      : Math.max(0, periodMinutes - repairMinutesTotal);

  const mttrMinutes = ratioMetric(repairMinutesTotal, failureCount);
  const mtbfMinutes = ratioMetric(operatingMinutes, failureCount);

  return {
    equipmentId,
    equipmentName,
    failureCount,
    repairMinutesTotal,
    operatingMinutes: Math.round(operatingMinutes),
    mttrMinutes,
    mtbfMinutes,
    mttrHours: minutesToHours(mttrMinutes),
    mtbfHours: minutesToHours(mtbfMinutes),
    oee,
  };
}

export async function getProductionReliabilityReport(opts: {
  from?: Date;
  to?: Date;
  subdivisionId?: number;
  equipmentId?: string;
}): Promise<ProductionReliabilityReport> {
  const notes: string[] = [];
  const periodFrom =
    opts.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodTo =
    opts.to ??
    new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

  const equipmentRows = await db.select().from(equipment);
  let scopedEquipment = equipmentRows.filter((e) => e.status !== "decommissioned");

  if (opts.subdivisionId != null) {
    scopedEquipment = scopedEquipment.filter(
      (e) =>
        e.subdivisionId === opts.subdivisionId ||
        e.homeSubdivisionId === opts.subdivisionId
    );
  }
  if (opts.equipmentId) {
    scopedEquipment = scopedEquipment.filter((e) => e.id === opts.equipmentId);
  }

  const equipmentIds = scopedEquipment.map((e) => e.id);
  const equipmentNameById = new Map(scopedEquipment.map((e) => [e.id, e.name]));
  const periodMinutes = periodLengthMinutes(periodFrom, periodTo);

  let oeeSummary: OeeSummaryMetrics | null = null;
  let oeeByEquipment = new Map<string, OeeSummaryMetrics>();

  if (opts.subdivisionId != null) {
    try {
      const oee = await getOeeAnalytics({
        subdivisionId: opts.subdivisionId,
        from: periodFrom,
        to: periodTo,
        equipmentId: opts.equipmentId,
      });
      oeeSummary = oee.summary;
      oeeByEquipment = new Map(
        oee.byEquipment.map((line) => [line.equipmentId, line])
      );
      notes.push(...oee.notes);
    } catch {
      notes.push("OEE не рассчитан — проверьте данные планирования.");
    }
  } else {
    notes.push(
      "Для расчёта OEE выберите подразделение. MTBF/MTTR считаются по заявкам и простоям."
    );
  }

  const failures: ReliabilityFailureEvent[] = [];

  if (equipmentIds.length > 0) {
    const srRows = await db
      .select()
      .from(serviceRequests)
      .where(inArray(serviceRequests.equipmentId, equipmentIds));

    const failureRequests = srRows.filter((sr) =>
      FAILURE_REQUEST_TYPES.has(sr.requestType)
    );

    for (const sr of failureRequests) {
      const closedAt = sr.closedAt;
      const inScope =
        (closedAt && inPeriod(closedAt, periodFrom, periodTo)) ||
        inPeriod(sr.createdAt, periodFrom, periodTo);

      if (!inScope) continue;
      if (sr.status === "cancelled" || sr.status === "duplicate" || sr.status === "not_needed") {
        continue;
      }

      const history = await db
        .select()
        .from(requestStatusHistory)
        .where(eq(requestStatusHistory.requestId, sr.id));

      let repairMinutes = repairMinutesFromHistory(
        sr.createdAt,
        sr.status,
        sr.closedAt,
        sr.updatedAt,
        history,
        periodFrom,
        periodTo
      );

      const linkedDowntimes = await db
        .select()
        .from(productionDowntimes)
        .where(eq(productionDowntimes.linkedServiceRequestId, sr.id));

      if (linkedDowntimes.length > 0) {
        repairMinutes = linkedDowntimes.reduce((s, d) => s + d.durationMinutes, 0);
      }

      if (repairMinutes === 0 && closedAt) {
        const span = clipRepairSpan(sr.createdAt, closedAt, periodFrom, periodTo);
        repairMinutes = Math.round(span / 60000);
      }

      failures.push({
        id: `sr:${sr.id}`,
        source: "service_request",
        sourceId: sr.id,
        equipmentId: sr.equipmentId,
        equipmentName: sr.equipmentName,
        title: `#${sr.id}: ${sr.problemDescription.slice(0, 80)}`,
        repairMinutes,
        failureAt: sr.createdAt.toISOString(),
        resolvedAt: closedAt?.toISOString() ?? null,
      });
    }

    let downtimes = await db.select().from(productionDowntimes);
    if (opts.subdivisionId != null) {
      downtimes = downtimes.filter((d) => d.subdivisionId === opts.subdivisionId);
    }
    downtimes = downtimes.filter(
      (d) =>
        equipmentIds.includes(d.equipmentId) &&
        d.reasonType === "repair" &&
        !d.linkedServiceRequestId
    );

    for (const d of downtimes) {
      const anchor = d.startTime ?? d.createdAt;
      const end = d.endTime ?? new Date(anchor.getTime() + d.durationMinutes * 60000);
      if (!overlapsPeriod(anchor, end, periodFrom, periodTo)) continue;

      failures.push({
        id: `downtime:${d.id}`,
        source: "production_downtime",
        sourceId: d.id,
        equipmentId: d.equipmentId,
        equipmentName: equipmentNameById.get(d.equipmentId) ?? d.equipmentId,
        title: d.reasonText ?? "Простой (ремонт)",
        repairMinutes: d.durationMinutes,
        failureAt: anchor.toISOString(),
        resolvedAt: d.endTime?.toISOString() ?? null,
      });
    }
  }

  const failuresByEquipment = new Map<string, ReliabilityFailureEvent[]>();
  for (const f of failures) {
    const list = failuresByEquipment.get(f.equipmentId) ?? [];
    list.push(f);
    failuresByEquipment.set(f.equipmentId, list);
  }

  const byEquipment: ReliabilityEquipmentLine[] = scopedEquipment.map((eq) =>
    buildEquipmentLine(
      eq.id,
      eq.name,
      failuresByEquipment.get(eq.id) ?? [],
      periodMinutes,
      oeeByEquipment.get(eq.id) ?? null
    )
  );

  byEquipment.sort((a, b) => a.equipmentName.localeCompare(b.equipmentName));

  const totalRepair = failures.reduce((s, f) => s + f.repairMinutes, 0);
  const failureCount = failures.length;
  const operatingMinutes =
    oeeSummary != null && oeeSummary.operatingMinutes > 0
      ? oeeSummary.operatingMinutes
      : Math.max(
          0,
          periodMinutes * scopedEquipment.length - totalRepair
        );

  const mttrMinutes = ratioMetric(totalRepair, failureCount);
  const mtbfMinutes = ratioMetric(operatingMinutes, failureCount);

  if (failureCount === 0) {
    notes.push("В периоде нет зарегистрированных отказов (ремонт/диагностика).");
  }

  failures.sort(
    (a, b) => new Date(b.failureAt).getTime() - new Date(a.failureAt).getTime()
  );

  return {
    from: periodFrom.toISOString(),
    to: periodTo.toISOString(),
    subdivisionId: opts.subdivisionId ?? null,
    equipmentId: opts.equipmentId ?? null,
    summary: {
      failureCount,
      repairMinutesTotal: totalRepair,
      operatingMinutes: Math.round(operatingMinutes),
      mttrMinutes,
      mtbfMinutes,
      mttrHours: minutesToHours(mttrMinutes),
      mtbfHours: minutesToHours(mtbfMinutes),
      equipmentInScope: scopedEquipment.length,
      oee: oeeSummary,
    },
    failures,
    byEquipment,
    notes,
  };
}

function clipRepairSpan(
  start: Date,
  end: Date,
  rangeFrom: Date,
  rangeTo: Date
): number {
  const segStart = start < rangeFrom ? rangeFrom : start;
  const segEnd = end > rangeTo ? rangeTo : end;
  const ms = segEnd.getTime() - segStart.getTime();
  return ms > 0 ? ms : 0;
}
