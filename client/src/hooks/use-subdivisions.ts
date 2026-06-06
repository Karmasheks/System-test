import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Subdivision } from "@shared/schema";

export function useSubdivisions() {
  return useQuery<Subdivision[]>({
    queryKey: ["/api/subdivisions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/subdivisions");
      return res.json();
    },
  });
}

export function useSubdivisionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/subdivisions"] });
    qc.invalidateQueries({ queryKey: ["/api/subdivisions/all"] });
    qc.invalidateQueries({ queryKey: ["/api/equipment"] });
    qc.invalidateQueries({ queryKey: ["/api/warehouse/parts"] });
  };

  return {
    create: useMutation({
      mutationFn: async (name: string) => {
        const res = await apiRequest("POST", "/api/subdivisions", { name });
        return res.json() as Promise<Subdivision>;
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, name }: { id: number; name: string }) => {
        const res = await apiRequest("PATCH", `/api/subdivisions/${id}`, { name });
        return res.json() as Promise<Subdivision>;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        const res = await apiRequest("DELETE", `/api/subdivisions/${id}`);
        return res.json() as Promise<{
          ok: boolean;
          mode: "deleted" | "deactivated";
          message?: string;
        }>;
      },
      onSuccess: invalidate,
    }),
  };
}
