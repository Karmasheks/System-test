import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  mergeProductionDisplayConfig,
  type ProductionDisplayConfig,
} from "@shared/production-display-config";
import {
  readDisplayOverrides,
  writeDisplayOverrides,
  clearDisplayOverrides,
} from "@/lib/production-display-storage";

export type ProductionPlanningSettings = {
  subdivisionId: number;
  materialWriteoffMode: string;
  timezone: string | null;
  defaultShiftTemplateId: number | null;
  displayConfig: ProductionDisplayConfig;
};

export function useProductionPlanningSettings(subdivisionId: number | null) {
  return useQuery<ProductionPlanningSettings>({
    queryKey: ["/api/production/settings", subdivisionId],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/settings?subdivisionId=${subdivisionId}`
      );
      return res.json();
    },
  });
}

export function useProductionDisplayConfig(subdivisionId: number | null) {
  const queryClient = useQueryClient();
  const { data: serverSettings, isLoading } = useProductionPlanningSettings(subdivisionId);

  const [localOverrides, setLocalOverrides] = useState<Partial<ProductionDisplayConfig> | null>(
    () => readDisplayOverrides(subdivisionId)
  );

  const config = useMemo(
    () =>
      mergeProductionDisplayConfig(
        serverSettings?.displayConfig,
        localOverrides ?? undefined
      ),
    [serverSettings?.displayConfig, localOverrides]
  );

  const applyLocalOverrides = useCallback(
    (overrides: Partial<ProductionDisplayConfig>) => {
      const merged = mergeProductionDisplayConfig(config, overrides);
      setLocalOverrides(merged);
      writeDisplayOverrides(subdivisionId, merged);
    },
    [config, subdivisionId]
  );

  const resetLocalOverrides = useCallback(() => {
    setLocalOverrides(null);
    clearDisplayOverrides(subdivisionId);
  }, [subdivisionId]);

  const saveToServer = useMutation({
    mutationFn: async (payload: {
      displayConfig: ProductionDisplayConfig;
      materialWriteoffMode?: string;
    }) => {
      if (subdivisionId == null) throw new Error("Укажите подразделение");
      const res = await apiRequest("PATCH", "/api/production/settings", {
        subdivisionId,
        displayConfig: payload.displayConfig,
        materialWriteoffMode: payload.materialWriteoffMode,
      });
      return res.json() as Promise<ProductionPlanningSettings>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/production/settings", subdivisionId], data);
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/production/analytics"] });
      resetLocalOverrides();
    },
  });

  return {
    config,
    isLoading,
    serverSettings,
    localOverridesActive: localOverrides != null,
    applyLocalOverrides,
    resetLocalOverrides,
    saveToServer,
  };
}
