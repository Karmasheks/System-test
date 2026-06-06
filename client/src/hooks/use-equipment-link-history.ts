import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EquipmentActivityItem } from "@/hooks/use-equipment-activity";

export function useEquipmentLinkHistory(equipmentId: string | undefined) {
  return useQuery<EquipmentActivityItem[]>({
    queryKey: ["/api/equipment", equipmentId, "link-history"],
    enabled: !!equipmentId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/equipment/${equipmentId}/link-history`);
      return res.json();
    },
  });
}
