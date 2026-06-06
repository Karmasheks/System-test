import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckSquare,
  ClipboardList,
  Eye,
  Wrench,
} from "lucide-react";
import { STATUS_LABELS, type ServiceRequestStatus } from "@shared/service-request-constants";

export interface RecentActivity {
  id: string;
  message: string;
  time: string;
  icon: LucideIcon;
  color: string;
  link?: string;
  timestamp: number;
}

function toTime(ts: number): string {
  return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ru });
}

export function buildRecentActivities(params: {
  maintenanceRecords: Array<{
    id: number;
    equipmentName: string;
    maintenanceType: string;
    status: string;
    updatedAt?: Date | string;
    scheduledDate: Date | string;
    createdAt?: Date | string;
  }>;
  remarks: Array<{
    id: string;
    equipmentName: string;
    title?: string;
    description?: string;
    status: string;
    createdAt: string | Date;
    updatedAt?: string | Date;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    status: string;
    updatedAt?: string | Date;
    createdAt: string | Date;
  }>;
  serviceRequests: Array<{
    id: number;
    equipmentName: string;
    status: string;
    problemDescription?: string;
    updatedAt?: Date | string;
    createdAt?: Date | string;
  }>;
  inspectionSummary?: { inspected: number; total: number };
  limit?: number;
}): RecentActivity[] {
  const items: RecentActivity[] = [];

  for (const r of params.maintenanceRecords) {
    const ts = new Date(r.updatedAt || r.scheduledDate || r.createdAt || Date.now()).getTime();
    const label =
      r.status === "completed"
        ? "Выполнено ТО"
        : r.status === "in_progress"
          ? "ТО в процессе"
          : r.status === "postponed"
            ? "ТО отложено"
            : "Запланировано ТО";
    items.push({
      id: `maint-${r.id}`,
      message: `${label}: ${r.equipmentName} (${r.maintenanceType})`,
      time: toTime(ts),
      icon: Wrench,
      color: "text-blue-600 dark:text-blue-400",
      link: "/maintenance",
      timestamp: ts,
    });
  }

  for (const remark of params.remarks) {
    const ts = new Date(remark.updatedAt || remark.createdAt).getTime();
    const text = (remark.title || remark.description || "без описания").slice(0, 80);
    items.push({
      id: `remark-${remark.id}`,
      message: `Замечание (${remark.status}): ${remark.equipmentName} — ${text}`,
      time: toTime(ts),
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
      link: "/remarks",
      timestamp: ts,
    });
  }

  for (const task of params.tasks) {
    const ts = new Date(task.updatedAt || task.createdAt).getTime();
    const label =
      task.status === "completed"
        ? "Задача выполнена"
        : task.status === "in_progress"
          ? "Задача в работе"
          : task.status === "overdue"
            ? "Просроченная задача"
            : "Новая задача";
    items.push({
      id: `task-${task.id}`,
      message: `${label}: ${task.title}`,
      time: toTime(ts),
      icon: CheckSquare,
      color: "text-green-600 dark:text-green-400",
      link: "/tasks",
      timestamp: ts,
    });
  }

  for (const sr of params.serviceRequests) {
    const ts = new Date(sr.updatedAt || sr.createdAt || Date.now()).getTime();
    const statusLabel =
      STATUS_LABELS[sr.status as ServiceRequestStatus] ?? sr.status;
    items.push({
      id: `sr-${sr.id}`,
      message: `Заявка №${sr.id} (${statusLabel}): ${sr.equipmentName}`,
      time: toTime(ts),
      icon: ClipboardList,
      color: "text-indigo-600 dark:text-indigo-400",
      link: `/service-requests/${sr.id}`,
      timestamp: ts,
    });
  }

  if (params.inspectionSummary && params.inspectionSummary.total > 0) {
    items.push({
      id: "inspection-today",
      message: `Осмотры сегодня: ${params.inspectionSummary.inspected} из ${params.inspectionSummary.total}`,
      time: "Сегодня",
      icon: Eye,
      color: "text-purple-600 dark:text-purple-400",
      link: "/daily-inspection",
      timestamp: Date.now(),
    });
  }

  return items
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, params.limit ?? 8);
}
