import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EquipmentLinkInput, EquipmentLinkView } from "@shared/equipment-link-constants";

function invalidateEquipmentLinkQueries(queryClient: QueryClient, equipmentId: string) {
  queryClient.invalidateQueries({ queryKey: ["/api/equipment", equipmentId, "links"] });
  queryClient.invalidateQueries({ queryKey: ["/api/equipment", equipmentId, "activity"] });
  queryClient.invalidateQueries({ queryKey: ["/api/equipment", equipmentId, "link-history"] });
  queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
}

export function useEquipmentLinks(equipmentId?: string) {
  return useQuery<EquipmentLinkView[]>({
    queryKey: ["/api/equipment", equipmentId, "links"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/equipment/${equipmentId}/links`);
      return res.json();
    },
    enabled: !!equipmentId,
  });
}

export function useEquipmentLinkMutations(equipmentId: string) {
  const queryClient = useQueryClient();

  const sync = useMutation({
    mutationFn: async (links: EquipmentLinkInput[]) => {
      const res = await apiRequest("PUT", `/api/equipment/${equipmentId}/links`, { links });
      return res.json() as Promise<EquipmentLinkView[]>;
    },
    onSuccess: () => {
      invalidateEquipmentLinkQueries(queryClient, equipmentId);
    },
  });

  return { sync };
}

export async function syncEquipmentLinksApi(
  equipmentId: string,
  links: EquipmentLinkInput[],
  queryClient?: QueryClient
) {
  const res = await apiRequest("PUT", `/api/equipment/${equipmentId}/links`, { links });
  const data = (await res.json()) as EquipmentLinkView[];
  if (queryClient) {
    invalidateEquipmentLinkQueries(queryClient, equipmentId);
  }
  return data;
}
