import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { OeeAnalyticsResponse } from "@shared/production-oee-types";

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useProductionOee(
  subdivisionId: number | null,
  from?: string,
  to?: string,
  equipmentId?: string
) {
  return useQuery<OeeAnalyticsResponse>({
    queryKey: [
      "/api/production/oee/analytics",
      subdivisionId,
      from,
      to,
      equipmentId,
    ],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/oee/analytics${qs({
          subdivisionId: String(subdivisionId),
          from,
          to,
          equipmentId,
        })}`
      );
      return res.json();
    },
  });
}
