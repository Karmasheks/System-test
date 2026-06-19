import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  Product,
  Material,
  ProductionOrder,
  ProductionSchedule,
  ProductionFact,
  ProductionPlanConflict,
  ProductionImportBatch,
} from "@shared/schema";
import type { ProductionTooling, ProductionToolingMaintenance } from "@shared/schema";
import type { MaterialRequirementLine } from "@/components/planning/types";

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export type ProductWithSubs = Product & { subdivisionIds: number[] };
export type MaterialWithSubs = Material & { subdivisionIds: number[] };

export type ProductionAnalytics = {
  planFact: Array<{
    orderId: number;
    orderNumber: string;
    productId: number;
    planned: number;
    fact: number;
    defective: number;
    variance: number;
  }>;
  equipmentLoad: Array<{ equipmentId: string; slotCount: number; plannedMinutes: number }>;
  atRiskOrders: ProductionOrder[];
  materialShortages: Array<{
    materialId: number;
    materialName: string;
    quantity: number;
    reservedQuantity: number;
    minStock: number;
  }>;
  downtimes: import("@shared/schema").ProductionDowntime[];
  maintenanceImpact: Array<{
    id: number;
    equipmentId: string;
    equipmentName: string;
    scheduledDate: string;
    status: string;
    maintenanceType: string;
  }>;
  toirOverlay?: ToirOverlayBlock[];
  toirSummary?: {
    maintenanceOverlayMinutes: number;
    repairOverlayMinutes: number;
    downtimeMinutesToir: number;
    slotsWithConflict: number;
    ordersAffected: number;
    plannedProductionMinutes: number;
    availabilityPercent: number | null;
  };
  summary: {
    ordersTotal: number;
    ordersInProgress: number;
    productsTotal: number;
    toolingTotal: number;
    scheduleSlots: number;
    factsRecorded: number;
    totalProduced: number;
    totalDefective: number;
  };
};

export type ToirOverlayBlock = {
  id: string;
  kind: "maintenance" | "repair";
  equipmentId: string;
  equipmentName: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  linkedMaintenanceId?: number;
  linkedServiceRequestId?: number;
  linkedTaskId?: number;
};

export type EquipmentProductionSummary = {
  availableForPlanning: boolean;
  unavailableReasons: string[];
  equipmentStatus: string | null;
  schedule: Array<{
    id: number;
    orderId: number;
    orderNumber: string;
    productName: string;
    productSapCode: string;
    startTime: string;
    endTime: string;
    plannedQuantity: number;
    status: string;
    conflictStatus: string;
    subdivisionId: number;
  }>;
  openConflicts: ProductionPlanConflict[];
};

export function useEquipmentProductionSummary(equipmentId: string | undefined) {
  return useQuery<EquipmentProductionSummary>({
    queryKey: ["/api/production/equipment", equipmentId, "plan-summary"],
    enabled: Boolean(equipmentId),
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/equipment/${equipmentId}/plan-summary`
      );
      return res.json();
    },
  });
}

export function useScheduleToirOverlay(
  subdivisionId: number | null,
  from?: string,
  to?: string
) {
  return useQuery<ToirOverlayBlock[]>({
    queryKey: ["/api/production/schedule/toir-overlay", subdivisionId, from, to],
    enabled: subdivisionId != null && Boolean(from) && Boolean(to),
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/schedule/toir-overlay${qs({
          subdivisionId: String(subdivisionId),
          from,
          to,
        })}`
      );
      return res.json();
    },
  });
}

export function useProductionProducts(filters?: {
  subdivisionId?: number;
  search?: string;
  activeOnly?: boolean;
}) {
  return useQuery<ProductWithSubs[]>({
    queryKey: [
      "/api/production/products",
      filters?.subdivisionId,
      filters?.search,
      filters?.activeOnly,
    ],
    enabled: filters?.subdivisionId != null,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/products${qs({
          subdivisionId: filters?.subdivisionId ? String(filters.subdivisionId) : undefined,
          search: filters?.search,
          activeOnly: filters?.activeOnly ? "true" : undefined,
        })}`
      );
      return res.json();
    },
  });
}

export function useProductionMaterials(filters?: {
  subdivisionId?: number;
  search?: string;
  activeOnly?: boolean;
}) {
  return useQuery<MaterialWithSubs[]>({
    queryKey: [
      "/api/production/materials",
      filters?.subdivisionId,
      filters?.search,
      filters?.activeOnly,
    ],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/materials${qs({
          subdivisionId: filters?.subdivisionId ? String(filters.subdivisionId) : undefined,
          search: filters?.search,
          activeOnly: filters?.activeOnly ? "true" : undefined,
        })}`
      );
      return res.json();
    },
  });
}

export type MaterialStockRow = {
  id: number;
  materialId: number;
  subdivisionId: number;
  storageLocation: string;
  quantity: number;
  reservedQuantity: number;
  minStock: number;
  materialName: string;
  sapCode: string;
  materialType: string;
  materialUnit: string;
};

export function useMaterialStocks(subdivisionId: number | null) {
  return useQuery<MaterialStockRow[]>({
    queryKey: ["/api/production/materials/stocks", subdivisionId],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/materials/stocks?subdivisionId=${subdivisionId}`
      );
      return res.json();
    },
  });
}

export type InternalWarehouseSummary = {
  subdivisionId: number;
  from: string | null;
  to: string | null;
  stocks: MaterialStockRow[];
  movements: Array<{
    id: number;
    materialId: number;
    type: string;
    quantity: number;
    materialName: string;
    sapCode: string;
    materialType: string;
    unit: string;
    createdAt: string;
    comment: string | null;
  }>;
  requirements: Array<{
    materialId: number;
    materialName: string;
    sapCode: string;
    required: number;
    available: number;
    unit: string;
    materialType: string;
  }>;
  finishedProducts: Array<{
    productId: number;
    sapCode: string;
    name: string;
    pfNumber: string | null;
    quantityOnHand: number;
    quantityDefective: number;
    quantityOrderRemainder: number;
    orderCount: number;
  }>;
  finishedByOrder: Array<{
    orderId: number;
    orderNumber: string;
    productId: number;
    productName: string;
    sapCode: string;
    pfNumber: string | null;
    targetQuantity: number;
    completedQuantity: number;
    remainderQuantity: number;
    defectiveQuantity: number;
    status: string;
  }>;
  summary: {
    stockItems: number;
    shortages: number;
    toolingItems: number;
    movementsCount: number;
    consumedTotal: number;
    plannedMaterialKg: number;
    activeOrders: number;
    finishedProductSkus: number;
    finishedQuantityTotal: number;
    finishedDefectiveTotal: number;
  };
};

export function useInternalWarehouseSummary(
  subdivisionId: number | null,
  from?: string,
  to?: string
) {
  return useQuery<InternalWarehouseSummary>({
    queryKey: ["/api/production/warehouse/summary", subdivisionId, from, to],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/warehouse/summary${qs({
          subdivisionId: String(subdivisionId),
          from,
          to,
        })}`
      );
      return res.json();
    },
  });
}

export type ToolingProductLink = {
  id: number;
  sapCode: string;
  name: string;
};

export type ProductionToolingView = ProductionTooling & {
  products: ToolingProductLink[];
  cyclesUntilMaintenance: number | null;
  cyclesRemainingGuarantee: number | null;
  maintenanceDue: boolean;
};

export type ProductionToolingDetail = ProductionToolingView & {
  maintenanceHistory: ProductionToolingMaintenance[];
};

export function useProductionTooling(
  subdivisionId: number | null,
  search?: string,
  activeOnly?: boolean
) {
  return useQuery<ProductionToolingView[]>({
    queryKey: ["/api/production/tooling", subdivisionId, search, activeOnly],
    enabled: subdivisionId != null,
    staleTime: 20_000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/tooling${qs({
          subdivisionId: String(subdivisionId),
          search,
          activeOnly: activeOnly ? "true" : undefined,
        })}`
      );
      return res.json();
    },
  });
}

export function useToolingDetail(id: number | null) {
  return useQuery<ProductionToolingDetail>({
    queryKey: ["/api/production/tooling", id],
    enabled: id != null,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/production/tooling/${id}`);
      return res.json();
    },
  });
}

export function useToolingMaintenanceDue(subdivisionId: number | null) {
  return useQuery<ProductionToolingView[]>({
    queryKey: ["/api/production/tooling/maintenance-due", subdivisionId],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/tooling/maintenance-due${qs({
          subdivisionId: String(subdivisionId),
        })}`
      );
      return res.json();
    },
  });
}

export type DailyPlanCellValue = {
  shifts: Record<string, number>;
  fact: number;
};

export type ShiftSlotView = {
  code: string;
  name: string;
  hours: number;
  startTime?: string;
  endTime?: string;
  lunchMinutes?: number;
  breakMinutes?: number;
};

export type DailyPlanGridResponse = {
  subdivisionId: number;
  from: string;
  to: string;
  dates: string[];
  shiftSlots: ShiftSlotView[];
  rows: Array<{
    key: string;
    equipmentId: string;
    equipmentName: string;
    orderId: number | null;
    orderNumber: string | null;
    productId: number | null;
    productName: string | null;
    productSapCode: string | null;
    pfNumber: string | null;
    shiftNorm: number | null;
    normByShift: Record<string, number>;
    targetQuantity: number;
    completedQuantity: number;
    remainderQuantity: number;
    percentComplete: number;
    shiftsToComplete: number | null;
    cells: Record<string, DailyPlanCellValue>;
    planTotal: number;
    factTotal: number;
  }>;
};

export function useShiftTemplates(subdivisionId: number | null) {
  return useQuery({
    queryKey: ["/api/production/shift-templates", subdivisionId],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/shift-templates?subdivisionId=${subdivisionId}`
      );
      return res.json() as Promise<
        Array<{
          id: number;
          name: string;
          description: string | null;
          pattern: { slots: ShiftSlotView[] };
          isActive: boolean;
        }>
      >;
    },
  });
}

export function useActiveShiftPattern(subdivisionId: number | null) {
  return useQuery({
    queryKey: ["/api/production/shift-templates/active", subdivisionId],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/shift-templates/active?subdivisionId=${subdivisionId}`
      );
      return res.json() as Promise<{ slots: ShiftSlotView[] }>;
    },
  });
}

export function useProductShiftNorms(
  productId: number | null,
  subdivisionId: number | null
) {
  return useQuery({
    queryKey: ["/api/production/products", productId, "shift-norms", subdivisionId],
    enabled: productId != null && subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/products/${productId}/shift-norms?subdivisionId=${subdivisionId}`
      );
      return res.json() as Promise<{
        stored: Array<{ shiftCode: string; shiftNorm: number }>;
        resolved: Record<string, number>;
        slots: ShiftSlotView[];
      }>;
    },
  });
}

export type ProductBomLine = {
  bom: import("@shared/schema").ProductBom;
  material: Material;
};

export type ProductEquipmentLink = import("@shared/schema").ProductEquipment;

export function useProductBom(productId: number | null, subdivisionId: number) {
  return useQuery<ProductBomLine[]>({
    queryKey: ["/api/production/bom", productId, subdivisionId],
    enabled: productId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/bom?productId=${productId}&subdivisionId=${subdivisionId}`
      );
      return res.json();
    },
  });
}

export function useProductEquipment(productId: number | null, subdivisionId: number) {
  return useQuery<ProductEquipmentLink[]>({
    queryKey: ["/api/production/products", productId, "equipment", subdivisionId],
    enabled: productId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/products/${productId}/equipment?subdivisionId=${subdivisionId}`
      );
      return res.json();
    },
  });
}

export function useDailyPlanGrid(
  subdivisionId: number | null,
  from?: string,
  to?: string,
  equipmentId?: string
) {
  return useQuery<DailyPlanGridResponse>({
    queryKey: [
      "/api/production/daily-plan/grid",
      subdivisionId,
      from,
      to,
      equipmentId,
    ],
    enabled: subdivisionId != null && Boolean(from) && Boolean(to),
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/daily-plan/grid${qs({
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

export function useProductionOrders(filters?: {
  subdivisionId?: number;
  productId?: number;
  status?: string;
  priority?: string;
}) {
  return useQuery<ProductionOrder[]>({
    queryKey: [
      "/api/production/orders",
      filters?.subdivisionId,
      filters?.productId,
      filters?.status,
      filters?.priority,
    ],
    enabled: filters?.subdivisionId != null,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/orders${qs({
          subdivisionId: filters?.subdivisionId ? String(filters.subdivisionId) : undefined,
          productId: filters?.productId ? String(filters.productId) : undefined,
          status: filters?.status,
          priority: filters?.priority,
        })}`
      );
      return res.json();
    },
  });
}

export function useProductionSchedule(filters?: {
  subdivisionId?: number;
  equipmentId?: string;
  orderId?: number;
  from?: string;
  to?: string;
}) {
  return useQuery<ProductionSchedule[]>({
    queryKey: [
      "/api/production/schedule",
      filters?.subdivisionId,
      filters?.equipmentId,
      filters?.orderId,
      filters?.from,
      filters?.to,
    ],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/schedule${qs({
          subdivisionId: filters?.subdivisionId ? String(filters.subdivisionId) : undefined,
          equipmentId: filters?.equipmentId,
          orderId: filters?.orderId ? String(filters.orderId) : undefined,
          from: filters?.from,
          to: filters?.to,
        })}`
      );
      return res.json();
    },
  });
}

export function useProductionFacts(filters?: {
  subdivisionId?: number;
  orderId?: number;
  equipmentId?: string;
}) {
  return useQuery<ProductionFact[]>({
    queryKey: [
      "/api/production/facts",
      filters?.subdivisionId,
      filters?.orderId,
      filters?.equipmentId,
    ],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/facts${qs({
          subdivisionId: filters?.subdivisionId ? String(filters.subdivisionId) : undefined,
          orderId: filters?.orderId ? String(filters.orderId) : undefined,
          equipmentId: filters?.equipmentId,
        })}`
      );
      return res.json();
    },
  });
}

export type CatalogCounts = {
  productsTotal: number;
  toolingTotal: number;
};

export function useCatalogCounts(subdivisionId: number | null) {
  return useQuery<CatalogCounts>({
    queryKey: ["/api/production/catalog-counts", subdivisionId],
    enabled: subdivisionId != null,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/catalog-counts?subdivisionId=${subdivisionId}`
      );
      return res.json();
    },
  });
}

export type ProductionKpiSummary = {
  planFact: ProductionAnalytics["planFact"];
  equipmentLoad: ProductionAnalytics["equipmentLoad"];
  atRiskOrders: ProductionAnalytics["atRiskOrders"];
  materialShortageCount: number;
  conflictCounts: {
    plan: number;
    maintenance: number;
  };
  summary: ProductionAnalytics["summary"];
};

export function useProductionKpiSummary(
  subdivisionId: number | null,
  from?: string,
  to?: string
) {
  return useQuery<ProductionKpiSummary>({
    queryKey: ["/api/production/kpi-summary", subdivisionId, from, to],
    enabled: subdivisionId != null,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/kpi-summary${qs({
          subdivisionId: String(subdivisionId),
          from,
          to,
        })}`
      );
      return res.json();
    },
  });
}

export function useProductionAnalytics(
  subdivisionId: number | null,
  from?: string,
  to?: string
) {
  return useQuery<ProductionAnalytics>({
    queryKey: ["/api/production/analytics", subdivisionId, from, to],
    enabled: subdivisionId != null,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/analytics${qs({
          subdivisionId: String(subdivisionId),
          from,
          to,
        })}`
      );
      return res.json();
    },
  });
}

export function useProductionConflicts(subdivisionId: number | null) {
  return useQuery<ProductionPlanConflict[]>({
    queryKey: ["/api/production/conflicts", subdivisionId],
    enabled: subdivisionId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/conflicts?subdivisionId=${subdivisionId}`
      );
      return res.json();
    },
  });
}

export function useOrderMaterialRequirements(orderId: number | null) {
  return useQuery<{
    orderId: number;
    quantity: number;
    requirements: MaterialRequirementLine[];
  } | null>({
    queryKey: ["/api/production/orders", orderId, "material-requirements"],
    enabled: orderId != null,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/production/orders/${orderId}/material-requirements`
      );
      return res.json();
    },
  });
}

export function useProductionMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/production/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/materials"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/schedule"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/facts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/kpi-summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/catalog-counts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/conflicts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/materials/stocks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/warehouse/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/tooling"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/daily-plan/grid"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/shift-templates"] });
  };

  const invalidateToolingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/production/tooling"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/catalog-counts"] });
  };

  const invalidateProductsQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/production/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/production/catalog-counts"] });
  };

  const patchToolingInCaches = (updated: ProductionToolingView) => {
    queryClient.setQueriesData<ProductionToolingView[]>(
      { queryKey: ["/api/production/tooling"] },
      (old) => {
        if (!old || !Array.isArray(old)) return old;
        const idx = old.findIndex((t) => t.id === updated.id);
        if (idx < 0) return old;
        const next = [...old];
        next[idx] = { ...next[idx], ...updated };
        return next;
      }
    );
    queryClient.setQueryData<ProductionToolingDetail>(
      ["/api/production/tooling", updated.id],
      (old) => (old ? { ...old, ...updated } : old)
    );
  };

  const createOrder = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/orders", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/production/orders/${id}/status`, { status });
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/production/orders/${id}`);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const updateMaterialStock = useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: number;
      minStock?: number;
      storageLocation?: string;
      quantity?: number;
    }) => {
      const res = await apiRequest("PATCH", `/api/production/materials/stocks/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["/api/production/warehouse/summary"] });
    },
  });

  const adjustMaterialStock = useMutation({
    mutationFn: async ({
      id,
      quantityDelta,
      comment,
    }: {
      id: number;
      quantityDelta: number;
      comment?: string;
    }) => {
      const res = await apiRequest("POST", `/api/production/materials/stocks/${id}/adjust`, {
        quantityDelta,
        comment,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["/api/production/warehouse/summary"] });
    },
  });

  const assignSchedule = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/schedule", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/production/schedule/${id}`, body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const cancelSchedule = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/production/schedule/${id}/cancel`);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const createFact = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/facts", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const importOrders = useMutation({
    mutationFn: async (body: {
      subdivisionId: number;
      fileName?: string;
      rows: Array<Record<string, unknown>>;
    }) => {
      const res = await apiRequest("POST", "/api/production/import/orders", body);
      return res.json() as Promise<ProductionImportBatch>;
    },
    onSuccess: invalidateAll,
  });

  const resolveConflict = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/production/conflicts/${id}/resolve`);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const previewImport = useMutation({
    mutationFn: async (body: {
      defaultSubdivisionId: number;
      fileName?: string;
      rows: import("@shared/production-excel-fields").MappedProductionImportRow[];
    }) => {
      const res = await apiRequest("POST", "/api/production/import/preview", body);
      return res.json();
    },
  });

  const confirmImport = useMutation({
    mutationFn: async (body: {
      defaultSubdivisionId: number;
      fileName?: string;
      rows: import("@shared/production-excel-fields").MappedProductionImportRow[];
    }) => {
      const res = await apiRequest("POST", "/api/production/import/confirm", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const checkConflicts = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/conflicts/check", body);
      return res.json();
    },
  });

  const createTooling = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/tooling", body);
      return res.json() as Promise<ProductionToolingView>;
    },
    onSuccess: (data) => {
      if (data?.id) patchToolingInCaches(data);
      invalidateToolingQueries();
      invalidateProductsQueries();
    },
  });

  const updateTooling = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/production/tooling/${id}`, body);
      return res.json() as Promise<ProductionToolingView>;
    },
    onSuccess: (data) => {
      if (data?.id) patchToolingInCaches(data);
      invalidateToolingQueries();
      invalidateProductsQueries();
    },
  });

  const bulkUpsertDailyPlan = useMutation({
    mutationFn: async (body: {
      subdivisionId: number;
      entries: Array<{
        equipmentId: string;
        orderId?: number | null;
        productId?: number | null;
        planDate: string;
        shiftCode?: string;
        plannedQuantity: number;
        pfNumber?: string | null;
        toolingId?: number | null;
      }>;
    }) => {
      const res = await apiRequest("POST", "/api/production/daily-plan/bulk", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const createMaterial = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/materials", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const createProduct = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/products", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/production/products/${id}`, body);
      return res.json();
    },
    onSuccess: invalidateProductsQueries,
  });

  const createProductFromTooling = useMutation({
    mutationFn: async ({
      toolingId,
      ...body
    }: { toolingId: number } & Record<string, unknown>) => {
      const res = await apiRequest(
        "POST",
        `/api/production/tooling/${toolingId}/create-product`,
        body
      );
      return res.json();
    },
    onSuccess: () => {
      invalidateToolingQueries();
      invalidateProductsQueries();
    },
  });

  const recordToolingMaintenance = useMutation({
    mutationFn: async ({
      toolingId,
      ...body
    }: {
      toolingId: number;
      comment?: string;
      performedAt?: string;
      cyclesAtMaintenance?: number;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/production/tooling/${toolingId}/maintenance`,
        body
      );
      return res.json();
    },
    onSuccess: () => {
      invalidateToolingQueries();
    },
  });

  const addBomLine = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/bom", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const removeBomLine = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/production/bom/${id}`);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const upsertProductEquipment = useMutation({
    mutationFn: async ({
      productId,
      ...body
    }: { productId: number } & Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/production/products/${productId}/equipment`, body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const createPlanningDemand = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/orders/planning-demand", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const createShiftTemplate = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/production/shift-templates", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const updateShiftTemplate = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/production/shift-templates/${id}`, body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const setDefaultShiftTemplate = useMutation({
    mutationFn: async (body: { subdivisionId: number; templateId: number | null }) => {
      const res = await apiRequest("POST", "/api/production/shift-templates/default", body);
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const upsertProductShiftNorms = useMutation({
    mutationFn: async ({
      productId,
      ...body
    }: { productId: number } & Record<string, unknown>) => {
      const res = await apiRequest(
        "PUT",
        `/api/production/products/${productId}/shift-norms`,
        body
      );
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  return {
    createOrder,
    updateOrderStatus,
    deleteOrder,
    adjustMaterialStock,
    updateMaterialStock,
    assignSchedule,
    updateSchedule,
    cancelSchedule,
    createFact,
    importOrders,
    resolveConflict,
    previewImport,
    confirmImport,
    checkConflicts,
    createTooling,
    updateTooling,
    bulkUpsertDailyPlan,
    createMaterial,
    createProduct,
    updateProduct,
    createProductFromTooling,
    recordToolingMaintenance,
    addBomLine,
    removeBomLine,
    upsertProductEquipment,
    createPlanningDemand,
    createShiftTemplate,
    updateShiftTemplate,
    setDefaultShiftTemplate,
    upsertProductShiftNorms,
    invalidateAll,
  };
}
