import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { downloadCsv, formatRuDateTime } from "@/lib/export-utils";
import type {
  Contact,
  Supplier,
  BudgetEntry,
  BudgetCategory,
  Document,
  DocumentCategory,
} from "@shared/schema";

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Contacts
export function useContacts(filters?: { equipmentId?: string }) {
  return useQuery<Contact[]>({
    queryKey: ["/api/contacts", filters?.equipmentId],
    queryFn: async () => {
      const url = filters?.equipmentId
        ? `/api/contacts?equipmentId=${encodeURIComponent(filters.equipmentId)}`
        : "/api/contacts";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });
}

export function useContactMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/contacts"] });
  return {
    create: useMutation({
      mutationFn: async (body: Record<string, unknown>) => {
        const res = await apiRequest("POST", "/api/contacts", body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
        const res = await apiRequest("PUT", `/api/contacts/${id}`, body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        await apiRequest("DELETE", `/api/contacts/${id}`);
      },
      onSuccess: invalidate,
    }),
  };
}

// Suppliers
export function useSuppliers(filters?: { equipmentId?: string }) {
  return useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", filters?.equipmentId],
    queryFn: async () => {
      const url = filters?.equipmentId
        ? `/api/suppliers?equipmentId=${encodeURIComponent(filters.equipmentId)}`
        : "/api/suppliers";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });
}

export function useSupplierMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/suppliers"] });
  return {
    create: useMutation({
      mutationFn: async (body: Record<string, unknown>) => {
        const res = await apiRequest("POST", "/api/suppliers", body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
        const res = await apiRequest("PUT", `/api/suppliers/${id}`, body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        await apiRequest("DELETE", `/api/suppliers/${id}`);
      },
      onSuccess: invalidate,
    }),
  };
}

// Budget categories
export function useBudgetCategories() {
  return useQuery<BudgetCategory[]>({
    queryKey: ["/api/budget/categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/budget/categories");
      return res.json();
    },
  });
}

export function useBudgetCategoryMutations() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (name: string) => {
        const res = await apiRequest("POST", "/api/budget/categories", { name });
        return res.json() as Promise<BudgetCategory>;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/budget/categories"] }),
    }),
  };
}

// Budget
export function useBudgetEntries(
  filters?: {
    equipmentId?: string;
    from?: string;
    to?: string;
    category?: string;
    subdivisionId?: number;
  },
  options?: { enabled?: boolean }
) {
  return useQuery<BudgetEntry[]>({
    queryKey: [
      "/api/budget",
      filters?.equipmentId,
      filters?.from,
      filters?.to,
      filters?.category,
      filters?.subdivisionId,
    ],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/budget${qs({
          equipmentId: filters?.equipmentId,
          from: filters?.from,
          to: filters?.to,
          category: filters?.category,
          subdivisionId:
            filters?.subdivisionId != null ? String(filters.subdivisionId) : undefined,
        })}`
      );
      return res.json();
    },
  });
}

export function useBudgetSummary(equipmentId?: string) {
  return useQuery({
    queryKey: ["/api/budget/summary", equipmentId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/budget/summary${equipmentId ? `?equipmentId=${equipmentId}` : ""}`
      );
      return res.json();
    },
  });
}

export function useBudgetMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/budget"] });
    qc.invalidateQueries({ queryKey: ["/api/budget/summary"] });
    qc.invalidateQueries({ queryKey: ["/api/suppliers"] });
    qc.invalidateQueries({ queryKey: ["/api/warehouse/parts"] });
    qc.invalidateQueries({ queryKey: ["/api/warehouse/categories"] });
    qc.invalidateQueries({ queryKey: ["/api/warehouse/dashboard"] });
    qc.invalidateQueries({ queryKey: ["/api/warehouse/alerts"] });
  };
  return {
    create: useMutation({
      mutationFn: async (body: Record<string, unknown>) => {
        const res = await apiRequest("POST", "/api/budget", body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
        const res = await apiRequest("PUT", `/api/budget/${id}`, body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        await apiRequest("DELETE", `/api/budget/${id}`);
      },
      onSuccess: invalidate,
    }),
    linkToRequest: useMutation({
      mutationFn: async ({ requestId, budgetEntryId }: { requestId: number; budgetEntryId: number | null }) => {
        const res = await apiRequest("PATCH", `/api/service-requests/${requestId}/budget`, {
          budgetEntryId,
        });
        return res.json();
      },
      onSuccess: (_d, v) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["/api/service-requests", v.requestId] });
      },
    }),
  };
}

// Documents
export function useDocuments(filters?: { equipmentId?: string; category?: string }) {
  return useQuery<Document[]>({
    queryKey: ["/api/documents", filters?.equipmentId, filters?.category],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/documents${qs({ equipmentId: filters?.equipmentId, category: filters?.category })}`
      );
      return res.json();
    },
  });
}

export function useDocumentCategories() {
  return useQuery<DocumentCategory[]>({
    queryKey: ["/api/document-categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/document-categories");
      return res.json();
    },
  });
}

export function useDocumentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/documents"] });
    qc.invalidateQueries({ queryKey: ["/api/document-categories"] });
  };
  return {
    create: useMutation({
      mutationFn: async (body: Record<string, unknown>) => {
        const res = await apiRequest("POST", "/api/documents", body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
        const res = await apiRequest("PUT", `/api/documents/${id}`, body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        await apiRequest("DELETE", `/api/documents/${id}`);
      },
      onSuccess: invalidate,
    }),
    addCategory: useMutation({
      mutationFn: async (name: string) => {
        const res = await apiRequest("POST", "/api/document-categories", { name });
        return res.json();
      },
      onSuccess: invalidate,
    }),
  };
}

// Calendar & reports
export function useCalendarEvents(from?: string, to?: string, equipmentId?: string) {
  return useQuery({
    queryKey: ["/api/calendar/events", from, to, equipmentId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/calendar/events${qs({ from, to, equipmentId })}`
      );
      return res.json();
    },
  });
}

export function useCalendarStats(from?: string, to?: string, equipmentId?: string) {
  return useQuery({
    queryKey: ["/api/calendar/stats", from, to, equipmentId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/calendar/stats${qs({ from, to, equipmentId })}`
      );
      return res.json();
    },
  });
}

export function useEquipmentReports(from?: string, to?: string, equipmentId?: string) {
  return useQuery({
    queryKey: ["/api/reports/equipment", from, to, equipmentId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/equipment${qs({ from, to, equipmentId })}`
      );
      return res.json();
    },
  });
}

export type BudgetReport = {
  period: { from: string | null; to: string | null };
  equipmentId: string | null;
  total: number;
  count: number;
  byCategory: Record<string, number>;
  byEquipment: Array<{
    equipmentId: string | null;
    equipmentName: string;
    total: number;
    count: number;
    byCategory: Record<string, number>;
  }>;
  entries: Array<{
    id: number;
    title: string;
    amount: number;
    category: string;
    equipmentId: string | null;
    equipmentName: string | null;
    expenseDate: string;
  }>;
};

export function useBudgetReport(from?: string, to?: string, equipmentId?: string) {
  return useQuery<BudgetReport>({
    queryKey: ["/api/reports/budget", from, to, equipmentId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/budget${qs({ from, to, equipmentId })}`
      );
      return res.json();
    },
  });
}

export type WarehouseReport = {
  period: { from: string | null; to: string | null };
  subdivisionId: number | null;
  summary: {
    totalParts: number;
    zeroStockCount: number;
    lowStockCount: number;
    unresolvedAlerts: number;
    movementsCount: number;
    incomingQuantity: number;
    outgoingQuantity: number;
    estimatedStockValue: number;
  };
  parts: Array<{
    id: number;
    name: string;
    categoryName: string | null;
    quantity: number;
    minStock: number;
    reservedQuantity: number;
    unitCost: number | null;
    equipmentName: string | null;
    subdivisionName: string | null;
    storageLocation: string | null;
    stockStatus: "zero" | "low" | "ok";
  }>;
  movements: Array<{
    id: number;
    partId: number;
    partName: string;
    type: string;
    typeLabel: string;
    quantity: number;
    equipmentName: string | null;
    destination: string | null;
    comment: string | null;
    performedByName: string;
    createdAt: string;
  }>;
  alerts: Array<{
    id: number;
    partId: number;
    partName: string;
    alertType: string;
    quantity: number;
    minStock: number;
    createdAt: string;
  }>;
};

export function useWarehouseReport(
  from?: string,
  to?: string,
  subdivisionId?: number | null
) {
  return useQuery<WarehouseReport>({
    queryKey: ["/api/reports/warehouse", from, to, subdivisionId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/warehouse${qs({
          from,
          to,
          subdivisionId:
            subdivisionId != null ? String(subdivisionId) : undefined,
        })}`
      );
      return res.json();
    },
  });
}

export type StatusDurationSummary = {
  entityType: "task" | "service_request" | "maintenance";
  status: string;
  statusLabel: string;
  totalHours: number;
  entityCount: number;
  avgHours: number;
};

export type StatusDurationReport = {
  from: string | null;
  to: string | null;
  summary: StatusDurationSummary[];
  entities: {
    entityType: "task" | "service_request" | "maintenance";
    entityId: number;
    title: string;
    status: string;
    statusLabel: string;
    hours: number;
    equipmentId?: string | null;
    equipmentName?: string | null;
  }[];
};

export function useStatusDurationReport(from?: string, to?: string, equipmentId?: string) {
  return useQuery<StatusDurationReport>({
    queryKey: ["/api/reports/status-durations", from, to, equipmentId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/status-durations${qs({ from, to, equipmentId })}`
      );
      return res.json();
    },
  });
}

export type UserWorkReport = {
  period: { from: string | null; to: string | null };
  users: Array<{
    userId: number;
    userName: string;
    role: string;
    department: string | null;
    position: string | null;
    openTasks: Array<{
      id: number;
      title: string;
      status: string;
      statusLabel: string;
      dueDate: string | null;
      assigneeAssignedAt: string | null;
      assignedDurationHours: number | null;
      actualHours: number | null;
    }>;
    openServiceRequests: Array<{
      id: number;
      equipmentName: string;
      status: string;
      statusLabel: string;
      loggedHours: number;
    }>;
    completedTasksInPeriod: Array<{
      id: number;
      title: string;
      completedAt: string | null;
      completedBy: string | null;
      completionComment: string | null;
      assigneeAssignedAt: string | null;
      assignedDurationHours: number | null;
      actualHours: number;
    }>;
    serviceRequestEntriesInPeriod: Array<{
      requestId: number;
      equipmentName: string;
      hours: number;
    }>;
    openTasksCount: number;
    openServiceRequestsCount: number;
    taskHoursInPeriod: number;
    serviceRequestHoursInPeriod: number;
    totalHoursInPeriod: number;
  }>;
};

export function useUserWorkReport(from?: string, to?: string, enabled = true) {
  return useQuery<UserWorkReport>({
    queryKey: ["/api/reports/user-work", from, to],
    enabled,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/user-work${qs({ from, to })}`);
      return res.json();
    },
  });
}

export type EmployeeWorkReport = {
  userId: number;
  userName: string;
  department: string | null;
  position: string | null;
  period: { from: string | null; to: string | null };
  summary: {
    openTasksCount: number;
    completedTasksCount: number;
    completedTasksToday: number;
    totalHoursInPeriod: number;
    totalHoursToday: number;
  };
  openTasks: Array<{
    id: number;
    title: string;
    status: string;
    statusLabel: string;
    createdAt: string | null;
    assigneeAssignedAt: string | null;
    assignedDurationHours: number | null;
  }>;
  completedTasks: Array<{
    id: number;
    title: string;
    status: string;
    statusLabel: string;
    completionComment: string | null;
    createdAt: string | null;
    assigneeAssignedAt: string | null;
    completedAt: string | null;
    completedBy: string | null;
    actualHours: number;
    assignedDurationHours: number | null;
  }>;
};

export function useEmployeeWorkReport(userId?: number, from?: string, to?: string) {
  return useQuery<EmployeeWorkReport>({
    queryKey: ["/api/reports/employee-work", userId, from, to],
    enabled: !!userId,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/employee-work${qs({ userId: userId ? String(userId) : undefined, from, to })}`
      );
      return res.json();
    },
  });
}

export async function downloadEmployeeWorkReportCsv(userId: number, from: string, to: string) {
  const token = localStorage.getItem("token");
  const url = `/api/reports/employee-work${qs({ userId: String(userId), from, to })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Ошибка формирования отчёта по сотруднику");
  const data = (await res.json()) as EmployeeWorkReport;

  const rows: string[][] = [
    ["Сотрудник", data.userName],
    ["Должность", data.position ?? ""],
    ["Подразделение", data.department ?? ""],
    ["Период закрытых задач", from, "—", to],
    [],
    ["Задачи на сотруднике"],
    ["ID", "Название", "Статус", "Создана", "Назначена", "В работе, ч"],
    ...data.openTasks.map((t) => [
      String(t.id),
      t.title,
      t.statusLabel,
      formatRuDateTime(t.createdAt),
      formatRuDateTime(t.assigneeAssignedAt),
      t.assignedDurationHours != null ? String(t.assignedDurationHours) : "",
    ]),
    [],
    ["Закрытые задачи за период"],
    ["ID", "Название", "Создана", "Назначена", "Закрыта", "Факт, ч", "От назнач., ч", "Итог работ"],
    ...data.completedTasks.map((t) => [
      String(t.id),
      t.title,
      formatRuDateTime(t.createdAt),
      formatRuDateTime(t.assigneeAssignedAt),
      formatRuDateTime(t.completedAt),
      String(t.actualHours),
      t.assignedDurationHours != null ? String(t.assignedDurationHours) : "",
      t.completionComment ?? "",
    ]),
    [],
    ["Итого закрыто задач", String(data.summary.completedTasksCount)],
    ["Итого часов за период", String(data.summary.totalHoursInPeriod)],
    ["Закрыто сегодня", String(data.summary.completedTasksToday)],
    ["Часов сегодня", String(data.summary.totalHoursToday)],
  ];

  downloadCsv(rows, `employee-work-${data.userName.replace(/\s+/g, "-")}-${from}-${to}.csv`);
}

export async function downloadBudgetReportCsv(from: string, to: string, equipmentId?: string) {
  const token = localStorage.getItem("token");
  const url = `/api/reports/budget${qs({ from, to, equipmentId })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Ошибка отчёта по затратам");
  const data: BudgetReport = await res.json();
  const rows: string[][] = [
    ["Период", data.period.from ?? "", data.period.to ?? ""],
    ["Всего потрачено", String(data.total)],
    ["Количество записей", String(data.count)],
    [],
    ["Оборудование", "Сумма", "Записей"],
    ...data.byEquipment.map((r) => [r.equipmentName, String(r.total), String(r.count)]),
  ];
  downloadCsv(rows, `budget-report-${from}-${to}.csv`);
}

export async function downloadEquipmentReportCsv(from: string, to: string, equipmentId?: string) {
  const token = localStorage.getItem("token");
  const url = `/api/reports/equipment${qs({ from, to, equipmentId })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Ошибка отчёта");
  const data = await res.json();
  const rows = [
    ["Период", data.period.from, data.period.to],
    ["Бюджет", data.monthly.budgetTotal],
    ["ТО выполнено", data.maintenance.completed],
    ["ТО просрочено", data.maintenance.overdue],
    ["Задач решено", data.resolvedTasks.count],
    ["Простой (ед.)", data.downtime.equipmentInMaintenance],
  ];
  downloadCsv(rows, `report-${from}-${to}.csv`);
}
