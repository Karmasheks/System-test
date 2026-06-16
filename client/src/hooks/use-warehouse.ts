import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  WarehouseCategory,
  WarehousePart,
  WarehouseMovement,
  WarehousePartComment,
  WarehouseStockAlert,
} from "@shared/schema";

import type { LinkedWorkItem } from "@shared/warehouse-linked-work";

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useWarehouseCategories() {
  return useQuery<WarehouseCategory[]>({
    queryKey: ["/api/warehouse/categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/warehouse/categories");
      return res.json();
    },
  });
}

export function useWarehouseParts(filters?: {
  categoryId?: number;
  subdivisionId?: number;
  equipmentId?: string;
  search?: string;
  lowStock?: boolean;
}) {
  return useQuery<WarehousePart[]>({
    queryKey: [
      "/api/warehouse/parts",
      filters?.categoryId,
      filters?.subdivisionId,
      filters?.equipmentId,
      filters?.search,
      filters?.lowStock,
    ],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/warehouse/parts${qs({
          categoryId: filters?.categoryId ? String(filters.categoryId) : undefined,
          subdivisionId: filters?.subdivisionId ? String(filters.subdivisionId) : undefined,
          equipmentId: filters?.equipmentId,
          search: filters?.search,
          lowStock: filters?.lowStock ? "true" : undefined,
        })}`
      );
      return res.json();
    },
  });
}

export function useWarehousePart(id: number | null) {
  return useQuery<WarehousePart>({
    queryKey: ["/api/warehouse/parts", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/warehouse/parts/${id}`);
      return res.json();
    },
  });
}

export function useWarehouseMovements(partId: number | null) {
  return useQuery<(WarehouseMovement & { linkedWork?: LinkedWorkItem[] })[]>({
    queryKey: ["/api/warehouse/parts", partId, "movements"],
    enabled: !!partId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/warehouse/parts/${partId}/movements`);
      return res.json();
    },
  });
}

export type EnrichedPartReservation = import("@shared/schema").PartReservation & {
  linkedWork: LinkedWorkItem[];
};

export function usePartReservations(partId: number | null) {
  return useQuery<EnrichedPartReservation[]>({
    queryKey: ["/api/warehouse/parts", partId, "reservations"],
    enabled: !!partId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/warehouse/parts/${partId}/reservations`);
      return res.json();
    },
  });
}

export function useWarehouseComments(partId: number | null) {
  return useQuery<WarehousePartComment[]>({
    queryKey: ["/api/warehouse/parts", partId, "comments"],
    enabled: !!partId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/warehouse/parts/${partId}/comments`);
      return res.json();
    },
  });
}

export type WarehouseAlertWithPart = WarehouseStockAlert & { part: WarehousePart };

export function useWarehouseAlerts() {
  return useQuery<WarehouseAlertWithPart[]>({
    queryKey: ["/api/warehouse/alerts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/warehouse/alerts");
      return res.json();
    },
  });
}

export function useWarehouseDashboard() {
  return useQuery({
    queryKey: ["/api/warehouse/dashboard"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/warehouse/dashboard");
      return res.json();
    },
  });
}

export type WarehouseActivityItem = WarehouseMovement & {
  partName: string;
  linkedWork?: LinkedWorkItem[];
};

export function useWarehouseActivity(limit = 50) {
  return useQuery<WarehouseActivityItem[]>({
    queryKey: ["/api/warehouse/activity", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/warehouse/activity?limit=${limit}`);
      return res.json();
    },
  });
}

export function useWarehouseMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/warehouse/parts"] });
    qc.invalidateQueries({ queryKey: ["/api/warehouse/alerts"] });
    qc.invalidateQueries({ queryKey: ["/api/warehouse/dashboard"] });
  };

  return {
    createCategory: useMutation({
      mutationFn: async (name: string) => {
        const res = await apiRequest("POST", "/api/warehouse/categories", { name });
        return res.json();
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/warehouse/categories"] }),
    }),
    createPart: useMutation({
      mutationFn: async (body: Record<string, unknown>) => {
        const res = await apiRequest("POST", "/api/warehouse/parts", body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    updatePart: useMutation({
      mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
        const res = await apiRequest("PUT", `/api/warehouse/parts/${id}`, body);
        return res.json();
      },
      onSuccess: invalidate,
    }),
    removePart: useMutation({
      mutationFn: async (id: number) => {
        await apiRequest("DELETE", `/api/warehouse/parts/${id}`);
      },
      onSuccess: invalidate,
    }),
    addMovement: useMutation({
      mutationFn: async ({ partId, ...body }: { partId: number } & Record<string, unknown>) => {
        const res = await apiRequest("POST", `/api/warehouse/parts/${partId}/movements`, body);
        return res.json();
      },
      onSuccess: (_d, vars) => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["/api/warehouse/parts", vars.partId, "movements"] });
        qc.invalidateQueries({ queryKey: ["/api/warehouse/activity"] });
        qc.invalidateQueries({ queryKey: ["/api/budget"] });
      },
    }),
    addComment: useMutation({
      mutationFn: async ({ partId, body }: { partId: number; body: string }) => {
        const res = await apiRequest("POST", `/api/warehouse/parts/${partId}/comments`, { body });
        return res.json();
      },
      onSuccess: (_d, vars) => {
        qc.invalidateQueries({ queryKey: ["/api/warehouse/parts", vars.partId, "comments"] });
      },
    }),
    updateComment: useMutation({
      mutationFn: async ({
        partId,
        commentId,
        body,
      }: {
        partId: number;
        commentId: number;
        body: string;
      }) => {
        const res = await apiRequest(
          "PUT",
          `/api/warehouse/parts/${partId}/comments/${commentId}`,
          { body }
        );
        return res.json();
      },
      onSuccess: (_d, vars) => {
        qc.invalidateQueries({ queryKey: ["/api/warehouse/parts", vars.partId, "comments"] });
      },
    }),
    deleteComment: useMutation({
      mutationFn: async ({ partId, commentId }: { partId: number; commentId: number }) => {
        await apiRequest("DELETE", `/api/warehouse/parts/${partId}/comments/${commentId}`);
      },
      onSuccess: (_d, vars) => {
        qc.invalidateQueries({ queryKey: ["/api/warehouse/parts", vars.partId, "comments"] });
      },
    }),
    resolveAlert: useMutation({
      mutationFn: async ({
        alertId,
        resolutionType,
        comment,
      }: {
        alertId: number;
        resolutionType: string;
        comment?: string;
      }) => {
        const res = await apiRequest("PATCH", `/api/warehouse/alerts/${alertId}/resolve`, {
          resolutionType,
          comment,
        });
        return res.json();
      },
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      },
    }),
  };
}

export function useTeamUsers() {
  return useQuery<{ id: number; name: string; email: string; role: string }[]>({
    queryKey: ["/api/users/list"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users/list");
      return res.json();
    },
  });
}
