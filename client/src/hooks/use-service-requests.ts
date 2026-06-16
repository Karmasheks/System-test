import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { appendServiceRequestComment } from "@/lib/mutation-cache";
import type { ServiceRequest } from "@shared/schema";

export function useServiceRequests(filters?: {
  status?: string;
  scope?: "assigned" | "created";
  enabled?: boolean;
}) {
  const queryKey = [
    "/api/service-requests",
    filters?.status ?? "all",
    filters?.scope ?? "all",
  ];
  return useQuery<ServiceRequest[]>({
    queryKey,
    enabled: filters?.enabled !== false,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== "all") {
        params.set("status", filters.status);
      }
      if (filters?.scope) {
        params.set("scope", filters.scope);
      }
      const qs = params.toString();
      const url = qs ? `/api/service-requests?${qs}` : "/api/service-requests";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });
}

export function useServiceRequestDetail(id: number | null) {
  return useQuery({
    queryKey: ["/api/service-requests", id],
    enabled: id != null,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/service-requests/${id}`);
      return res.json();
    },
  });
}

export function useServiceRequestMeta() {
  return useQuery({
    queryKey: ["/api/service-requests/meta"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/service-requests/meta");
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function useAssignees() {
  return useQuery({
    queryKey: ["/api/service-requests/assignees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/service-requests/assignees");
      return res.json() as Promise<{ id: number; name: string; email: string; role: string }[]>;
    },
  });
}

export function useCreateServiceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/service-requests", body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}

export function useTransitionServiceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/service-requests/${id}/transition`, body);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
      qc.invalidateQueries({ queryKey: ["/api/service-requests/planning"] });
      qc.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      qc.invalidateQueries({ queryKey: ["/api/calendar/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}

export function useAddTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number;
      hours: number;
      workDate: string;
      comment?: string;
    }) => {
      const res = await apiRequest("POST", `/api/service-requests/${id}/time-entries`, body);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
    },
  });
}

export function useAddRequestComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
      attachments,
    }: {
      id: number;
      body: string;
      attachments?: { name: string; url: string }[];
    }) => {
      const res = await apiRequest("POST", `/api/service-requests/${id}/comments`, {
        body,
        attachments: attachments ?? [],
      });
      return res.json();
    },
    onSuccess: (comment, v) => {
      appendServiceRequestComment(qc, v.id, comment as Record<string, unknown>);
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
    },
  });
}

export function useRequestCommentMutations(requestId: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/service-requests", requestId] });
  };

  return {
    updateComment: useMutation({
      mutationFn: async ({ commentId, body }: { commentId: number; body: string }) => {
        const res = await apiRequest(
          "PUT",
          `/api/service-requests/${requestId}/comments/${commentId}`,
          { body }
        );
        return res.json();
      },
      onSuccess: invalidate,
    }),
    deleteComment: useMutation({
      mutationFn: async (commentId: number) => {
        await apiRequest("DELETE", `/api/service-requests/${requestId}/comments/${commentId}`);
      },
      onSuccess: invalidate,
    }),
  };
}

export function usePlanning(week?: string) {
  return useQuery({
    queryKey: ["/api/service-requests/planning", week],
    queryFn: async () => {
      const url = week
        ? `/api/service-requests/planning?week=${week}`
        : "/api/service-requests/planning";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });
}

export function useAddRequestPart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number;
      partName: string;
      partNumber?: string;
      quantityRequired: number;
      warehousePartId?: number;
    }) => {
      const res = await apiRequest("POST", `/api/service-requests/${id}/parts`, body);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
      qc.invalidateQueries({ queryKey: ["/api/warehouse/parts"] });
      qc.invalidateQueries({ queryKey: ["/api/warehouse/activity"] });
    },
  });
}

export function useUpdateServiceRequestDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number;
      equipmentId?: string;
      requestType?: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/service-requests/${id}/details`, body);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
      qc.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
  });
}

export function useCreateServiceRequestSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number;
      title: string;
      description?: string;
      taskType?: string;
      priority?: string;
    }) => {
      const res = await apiRequest("POST", `/api/service-requests/${id}/tasks`, body);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
    },
  });
}

export function useAddRequestLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number;
      title: string;
      description?: string;
      url: string;
    }) => {
      const res = await apiRequest("POST", `/api/service-requests/${id}/links`, body);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
    },
  });
}

export function useRemoveRequestLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, linkId }: { id: number; linkId: number }) => {
      const res = await apiRequest("DELETE", `/api/service-requests/${id}/links/${linkId}`);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
    },
  });
}

export function useAddCoexecutor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      userId,
      userName,
    }: {
      id: number;
      userId: number;
      userName: string;
    }) => {
      const res = await apiRequest("POST", `/api/service-requests/${id}/coexecutors`, {
        userId,
        userName,
      });
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
    },
  });
}

export function useRemoveCoexecutor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, coId }: { id: number; coId: number }) => {
      const res = await apiRequest("DELETE", `/api/service-requests/${id}/coexecutors/${coId}`);
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.id] });
    },
  });
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      itemId,
      ...body
    }: {
      requestId: number;
      itemId: number;
      isCompleted?: boolean;
      comment?: string;
      measurementValue?: number;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/service-requests/${requestId}/checklist/${itemId}`,
        body
      );
      return res.json();
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/api/service-requests", v.requestId] });
    },
  });
}

export async function downloadMonthlyReport(year: number, month: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(
    `/api/service-requests/report/monthly?year=${year}&month=${month}&format=csv`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error("Ошибка экспорта");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `service-report-${year}-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export type MonthlyServiceReportRow = {
  id: number;
  equipmentName: string;
  equipmentId: string;
  requestType: string;
  assigneeName: string | null;
  requesterName: string;
  totalHours: number;
  hoursByUser: Array<{ userId: number; userName: string; hours: number }>;
  completionComment: string | null;
  closedAt: string | null;
};

export type MonthlyServiceReportResponse = {
  year: number;
  month: number;
  items: MonthlyServiceReportRow[];
};

export function useMonthlyServiceReport(year: number, month: number, enabled = true) {
  return useQuery<MonthlyServiceReportRow[]>({
    queryKey: ["/api/service-requests/report/monthly", year, month],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/service-requests/report/monthly?year=${year}&month=${month}`
      );
      const data = (await res.json()) as MonthlyServiceReportResponse | MonthlyServiceReportRow[];
      if (Array.isArray(data)) return data;
      return data.items ?? [];
    },
    enabled,
  });
}

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ["/api/checklist-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/checklist-templates");
      return res.json();
    },
  });
}

export function useCreateChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/checklist-templates", body);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/checklist-templates"] }),
  });
}

export function useDeleteChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/checklist-templates/${id}`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/checklist-templates"] }),
  });
}
