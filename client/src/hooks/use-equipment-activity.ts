import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface EquipmentActivityLink {
  type: string;
  id: number;
  label: string;
}

export interface EquipmentActivityItem {
  id: string;
  category:
    | "task"
    | "service_request"
    | "maintenance"
    | "remark"
    | "inspection"
    | "budget"
    | "link"
    | "equipment_status"
    | "equipment_location"
    | "subdivision_transfer"
    | "repair_transfer";
  entityId: number;
  title: string;
  subtitle?: string;
  status?: string;
  statusLabel?: string;
  occurredAt: string;
  actor?: string;
  href?: string;
  links: EquipmentActivityLink[];
}

export function useEquipmentActivity(equipmentId: string | undefined) {
  return useQuery<EquipmentActivityItem[]>({
    queryKey: ["/api/equipment", equipmentId, "activity"],
    enabled: !!equipmentId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/equipment/${equipmentId}/activity`);
      return res.json();
    },
  });
}
