import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EquipmentType } from "@shared/schema";

export function useEquipmentTypes() {
  return useQuery<EquipmentType[]>({
    queryKey: ["/api/equipment/types"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/equipment/types");
      return res.json();
    },
  });
}

export function useEquipmentTypeMutations() {
  const qc = useQueryClient();
  return {
    createType: useMutation({
      mutationFn: async (name: string) => {
        const res = await apiRequest("POST", "/api/equipment/types", { name });
        return res.json() as Promise<EquipmentType>;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/equipment/types"] }),
    }),
  };
}
