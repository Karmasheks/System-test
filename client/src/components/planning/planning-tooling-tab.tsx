import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAccessControl } from "@/hooks/use-access-control";
import {
  useProductionTooling,
  useProductionProducts,
  useProductionMutations,
  useToolingDetail,
  useToolingMaintenanceDue,
  type ProductionToolingView,
} from "@/hooks/use-production-planning";
import {
  TOOLING_STATUS_LABELS,
  TOOLING_TYPE_LABELS,
} from "@/lib/production-planning-constants";
import {
  ToolingStatusBadge,
  PercentCell,
  plannedDateClass,
} from "@/lib/production-tooling-status";
import { cn } from "@/lib/utils";
import { Plus, Wrench, PackagePlus, CheckCircle2 } from "lucide-react";
import { computeShiftNormFromCycle } from "@shared/production-norm-utils";
import {
  warrantyUsagePercent,
  maintenanceUsagePercent,
} from "@shared/production-tooling-utils";
import {
  effectivePiecesPerCycle,
  formatCavitiesDisplay,
  parseCavitiesInput,
} from "@shared/cavities-utils";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

type Props = {
  subdivisionId: number;
};

type ProductParamsForm = {
  cycleTimeSec: string;
  productWeight: string;
  shotWeight: string;
  defaultShiftNorm: string;
};

type ToolingFormState = {
  pfNumber: string;
  name: string;
  cavities: string;
  piecesPerCycle: string;
  productIds: number[];
  productParams: Record<number, ProductParamsForm>;
  toolingType: string;
  status: string;
  storageLocation: string;
  cyclesUntilGuarantee: string;
  maintenanceCycleInterval: string;
  cycleCounterTotal: string;
  cyclesSinceMaintenance: string;
  cyclesAtLastMaintenance: string;
  lastMaintenanceAt: string;
  fixedAssetNumber: string;
  infoUpdatedAt: string;
  nextMaintenancePlannedAt: string;
  lastMaintenanceDurationHours: string;
  estimatedMaintenanceHours: string;
  comment: string;
};

function paramsFromProduct(p: {
  cycleTimeSec?: number | null;
  productWeight?: number | null;
  shotWeight?: number | null;
  defaultShiftNorm?: number | null;
}): ProductParamsForm {
  return {
    cycleTimeSec: p.cycleTimeSec ? String(p.cycleTimeSec) : "",
    productWeight: p.productWeight ? String(p.productWeight) : "",
    shotWeight: p.shotWeight ? String(p.shotWeight) : "",
    defaultShiftNorm: p.defaultShiftNorm ? String(p.defaultShiftNorm) : "",
  };
}

function cavitiesConfigFromForm(form: ToolingFormState) {
  const parsed = parseCavitiesInput(form.cavities);
  const ppc = parseOptionalInt(form.piecesPerCycle);
  return {
    ...parsed,
    piecesPerCycle: ppc,
  };
}

function effectivePiecesFromForm(form: ToolingFormState): number {
  return effectivePiecesPerCycle(cavitiesConfigFromForm(form));
}

function parseProductParams(params: ProductParamsForm, form: ToolingFormState) {
  const cycle = params.cycleTimeSec ? Number(params.cycleTimeSec) : undefined;
  const cavityFields = cavitiesConfigFromForm(form);
  const piecesPerCycle = effectivePiecesPerCycle(cavityFields);
  return {
    cycleTimeSec: cycle,
    cavities: cavityFields.cavities,
    productWeight: params.productWeight ? Number(params.productWeight) : undefined,
    shotWeight: params.shotWeight ? Number(params.shotWeight) : undefined,
    defaultShiftNorm: params.defaultShiftNorm
      ? Number(params.defaultShiftNorm)
      : computeShiftNormFromCycle(cycle ?? null, piecesPerCycle) ?? undefined,
  };
}

const emptyForm = (): ToolingFormState => ({
  pfNumber: "",
  name: "",
  cavities: "",
  piecesPerCycle: "",
  productIds: [],
  productParams: {},
  toolingType: "press_form",
  status: "ok",
  storageLocation: "",
  cyclesUntilGuarantee: "",
  maintenanceCycleInterval: "",
  cycleCounterTotal: "",
  cyclesSinceMaintenance: "",
  cyclesAtLastMaintenance: "",
  lastMaintenanceAt: "",
  fixedAssetNumber: "",
  infoUpdatedAt: "",
  nextMaintenancePlannedAt: "",
  lastMaintenanceDurationHours: "",
  estimatedMaintenanceHours: "",
  comment: "",
});

function toDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseOptionalFloat(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function productsNeedSync(
  editing: ProductionToolingView | null,
  form: ToolingFormState
): boolean {
  if (form.productIds.length === 0) return false;
  if (!editing) return true;
  const prevIds = [...editing.products.map((p) => p.id)].sort((a, b) => a - b);
  const nextIds = [...form.productIds].sort((a, b) => a - b);
  if (prevIds.length !== nextIds.length || prevIds.some((id, i) => id !== nextIds[i])) {
    return true;
  }
  return form.productIds.some((id) => {
    const params = form.productParams[id];
    return Boolean(
      params?.cycleTimeSec ||
        params?.productWeight ||
        params?.shotWeight ||
        params?.defaultShiftNorm
    );
  });
}

function productNamesList(products: ProductionToolingView["products"]) {
  if (products.length === 0) return "—";
  return products.map((p) => p.name).join("; ");
}

function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function buildCycleCounterPayload(form: ToolingFormState) {
  const cycleCounterTotal = parseOptionalInt(form.cycleCounterTotal);
  const cyclesSinceMaintenance = parseOptionalInt(form.cyclesSinceMaintenance);
  let cyclesAtLastMaintenance = parseOptionalInt(form.cyclesAtLastMaintenance);

  if (
    cyclesAtLastMaintenance === undefined &&
    cycleCounterTotal !== undefined &&
    cyclesSinceMaintenance !== undefined
  ) {
    cyclesAtLastMaintenance = Math.max(0, cycleCounterTotal - cyclesSinceMaintenance);
  }

  const hasCounters =
    cycleCounterTotal !== undefined ||
    cyclesSinceMaintenance !== undefined ||
    cyclesAtLastMaintenance !== undefined ||
    form.lastMaintenanceAt.trim() !== "";

  return {
    cycleCounterTotal,
    cyclesSinceMaintenance,
    cyclesAtLastMaintenance,
    lastMaintenanceAt: form.lastMaintenanceAt.trim()
      ? new Date(form.lastMaintenanceAt).toISOString()
      : undefined,
    skipCycleRecalc: hasCounters,
  };
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ProductLinks({ products }: { products: ProductionToolingView["products"] }) {
  if (products.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {products.map((p) => (
        <Badge key={p.id} variant="outline" className="font-mono text-xs">
          {p.sapCode}
        </Badge>
      ))}
    </div>
  );
}

export function PlanningToolingTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");

  const [section, setSection] = useState("catalog");
  const [search, setSearch] = useState("");
  const { data: tooling = [], isLoading } = useProductionTooling(
    subdivisionId,
    search,
    false
  );
  const { data: maintenanceDue = [], isLoading: maintenanceLoading } =
    useToolingMaintenanceDue(subdivisionId);
  const {
    page,
    setPage,
    pageItems: paginatedTooling,
    totalPages,
    total: toolingTotal,
    from,
    to,
  } = useListPagination(tooling, 25, `${subdivisionId}-${search}`);
  const { data: products = [] } = useProductionProducts({ subdivisionId });
  const {
    createTooling,
    updateTooling,
    updateProduct,
    createProductFromTooling,
    recordToolingMaintenance,
  } = useProductionMutations();

  const [detailId, setDetailId] = useState<number | null>(null);
  const { data: detail } = useToolingDetail(detailId);

  const [productOpen, setProductOpen] = useState(false);
  const [productToolingId, setProductToolingId] = useState<number | null>(null);
  const [productForm, setProductForm] = useState({ sapCode: "", name: "" });

  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceToolingId, setMaintenanceToolingId] = useState<number | null>(null);
  const [maintenanceComment, setMaintenanceComment] = useState("");
  const [maintenancePerformedAt, setMaintenancePerformedAt] = useState("");
  const [maintenanceCyclesAt, setMaintenanceCyclesAt] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionToolingView | null>(null);
  const [form, setForm] = useState<ToolingFormState>(emptyForm());

  const resetForm = () => {
    setForm(emptyForm());
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (row: ProductionToolingView) => {
    const productParams: Record<number, ProductParamsForm> = {};
    for (const link of row.products) {
      const full = products.find((p) => p.id === link.id);
      productParams[link.id] = full
        ? paramsFromProduct(full)
        : paramsFromProduct({
            cycleTimeSec: row.cycleTimeSec,
            productWeight: row.productWeightGr,
            shotWeight: row.shotWeightGr,
          });
    }
    setEditing(row);
    setForm({
      pfNumber: row.pfNumber,
      name: row.name,
      cavities: row.cavitiesLayout?.trim()
        ? row.cavitiesLayout
        : row.cavities != null
          ? String(row.cavities)
          : "",
      piecesPerCycle: row.piecesPerCycle != null ? String(row.piecesPerCycle) : "",
      productIds: row.products.map((p) => p.id),
      productParams,
      toolingType: row.toolingType,
      status: row.status,
      storageLocation: row.storageLocation ?? "",
      cyclesUntilGuarantee: row.cyclesUntilGuarantee
        ? String(row.cyclesUntilGuarantee)
        : "",
      maintenanceCycleInterval: row.maintenanceCycleInterval
        ? String(row.maintenanceCycleInterval)
        : "",
      cycleCounterTotal: String(row.cycleCounterTotal ?? 0),
      cyclesSinceMaintenance: String(row.cyclesSinceMaintenance ?? 0),
      cyclesAtLastMaintenance:
        row.cyclesAtLastMaintenance != null ? String(row.cyclesAtLastMaintenance) : "",
      lastMaintenanceAt: toDateInput(row.lastMaintenanceAt),
      fixedAssetNumber: row.fixedAssetNumber ?? "",
      infoUpdatedAt: toDateInput(row.infoUpdatedAt),
      nextMaintenancePlannedAt: toDateInput(row.nextMaintenancePlannedAt),
      lastMaintenanceDurationHours:
        row.lastMaintenanceDurationHours != null
          ? String(row.lastMaintenanceDurationHours)
          : "",
      estimatedMaintenanceHours:
        row.estimatedMaintenanceHours != null ? String(row.estimatedMaintenanceHours) : "",
      comment: row.comment ?? "",
    });
    setOpen(true);
  };

  const toggleProductId = (productId: number, checked: boolean) => {
    setForm((prev) => {
      const set = new Set(prev.productIds);
      const productParams = { ...prev.productParams };
      if (checked) {
        set.add(productId);
        if (!productParams[productId]) {
          const full = products.find((p) => p.id === productId);
          productParams[productId] = full ? paramsFromProduct(full) : {
            cycleTimeSec: "",
            productWeight: "",
            shotWeight: "",
            defaultShiftNorm: "",
          };
        }
      } else {
        set.delete(productId);
        delete productParams[productId];
      }
      return { ...prev, productIds: [...set], productParams };
    });
  };

  const updateProductParams = (
    productId: number,
    patch: Partial<ProductParamsForm>
  ) => {
    setForm((prev) => ({
      ...prev,
      productParams: {
        ...prev.productParams,
        [productId]: { ...prev.productParams[productId], ...patch },
      },
    }));
  };

  const syncLinkedProducts = async (pfNumber: string) => {
    if (form.productIds.length === 0) return;
    await Promise.all(
      form.productIds.map(async (productId) => {
        const params = form.productParams[productId];
        if (!params) return;
        const parsed = parseProductParams(params, form);
        await updateProduct.mutateAsync({
          id: productId,
          pfNumber,
          ...parsed,
        });
      })
    );
  };

  const handleSave = async () => {
    try {
      const pfNumber = form.pfNumber.trim();
      const cavityFields = cavitiesConfigFromForm(form);
      const firstId = form.productIds[0];
      const firstParsed = firstId && form.productParams[firstId]
        ? parseProductParams(form.productParams[firstId], form)
        : {
            cycleTimeSec: undefined,
            productWeight: undefined,
            shotWeight: undefined,
            defaultShiftNorm: undefined,
          };

      const payload = {
        subdivisionId,
        pfNumber,
        name: form.name.trim(),
        productIds: form.productIds,
        productId: form.productIds[0] ?? undefined,
        toolingType: form.toolingType,
        status: form.status,
        cycleTimeSec: firstParsed.cycleTimeSec,
        cavities: cavityFields.cavities,
        cavitiesLayout: cavityFields.cavitiesLayout ?? null,
        piecesPerCycle: cavityFields.piecesPerCycle ?? null,
        productWeightGr: firstParsed.productWeight,
        shotWeightGr: firstParsed.shotWeight,
        storageLocation: form.storageLocation || undefined,
        cyclesUntilGuarantee: form.cyclesUntilGuarantee
          ? Number(form.cyclesUntilGuarantee)
          : undefined,
        maintenanceCycleInterval: form.maintenanceCycleInterval
          ? Number(form.maintenanceCycleInterval)
          : undefined,
        fixedAssetNumber: form.fixedAssetNumber.trim() || undefined,
        infoUpdatedAt: form.infoUpdatedAt.trim()
          ? new Date(form.infoUpdatedAt).toISOString()
          : undefined,
        lastMaintenanceDurationHours: parseOptionalFloat(form.lastMaintenanceDurationHours),
        estimatedMaintenanceHours: parseOptionalFloat(form.estimatedMaintenanceHours),
        comment: form.comment || undefined,
        ...buildCycleCounterPayload(form),
      };

      if (editing) {
        const saved = await updateTooling.mutateAsync({ id: editing.id, ...payload });
        if (productsNeedSync(editing, form)) {
          await syncLinkedProducts(pfNumber);
        }
        toast({ title: "Оснастка/ПФ обновлена" });
        if (detailId === editing.id && saved?.id) setDetailId(saved.id);
      } else {
        const created = await createTooling.mutateAsync(payload);
        if (form.productIds.length > 0) {
          await syncLinkedProducts(pfNumber);
        }
        toast({ title: "Оснастка/ПФ добавлена" });
        if (created?.id) setDetailId(created.id);
      }
      setOpen(false);
      resetForm();
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  const openCreateProduct = (row: ProductionToolingView) => {
    setProductToolingId(row.id);
    setProductForm({ sapCode: "", name: row.name });
    setProductOpen(true);
  };

  const handleCreateProduct = async () => {
    if (!productToolingId) return;
    try {
      await createProductFromTooling.mutateAsync({
        toolingId: productToolingId,
        sapCode: productForm.sapCode.trim(),
        name: productForm.name.trim() || undefined,
      });
      toast({ title: "Изделие создано и связано с ПФ" });
      setProductOpen(false);
      if (detailId === productToolingId) setDetailId(productToolingId);
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось создать изделие",
        variant: "destructive",
      });
    }
  };

  const openMaintenanceDialog = (toolingId: number) => {
    const row = tooling.find((t) => t.id === toolingId) ?? (detailId === toolingId ? detail : null);
    setMaintenanceToolingId(toolingId);
    setMaintenanceComment("");
    setMaintenancePerformedAt(new Date().toISOString().slice(0, 10));
    setMaintenanceCyclesAt(
      row?.cycleCounterTotal != null ? String(row.cycleCounterTotal) : ""
    );
    setMaintenanceOpen(true);
  };

  const handleRecordMaintenance = async () => {
    if (!maintenanceToolingId) return;
    try {
      const cyclesAt = parseOptionalInt(maintenanceCyclesAt);
      await recordToolingMaintenance.mutateAsync({
        toolingId: maintenanceToolingId,
        comment: maintenanceComment.trim() || undefined,
        performedAt: maintenancePerformedAt || undefined,
        cyclesAtMaintenance: cyclesAt,
      });
      toast({ title: "ТО оснастки/ПФ записано" });
      setMaintenanceOpen(false);
      if (detailId === maintenanceToolingId) setDetailId(maintenanceToolingId);
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось записать ТО",
        variant: "destructive",
      });
    }
  };

  const catalogTable = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="space-y-1">
          <Label>Поиск ПФ / оснастки</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SL2017, пресс-форма…"
            className="w-[280px]"
          />
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить ПФ / оснастку
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">№</TableHead>
              <TableHead>№ ПФ</TableHead>
              <TableHead className="min-w-[180px]">Изделие</TableHead>
              <TableHead>Гнёзд</TableHead>
              <TableHead>Дата обновления</TableHead>
              <TableHead>Смыканий</TableHead>
              <TableHead>Гарантия</TableHead>
              <TableHead>% гарантии</TableHead>
              <TableHead>Дата ТО</TableHead>
              <TableHead>После ТО</TableHead>
              <TableHead>Период ТО</TableHead>
              <TableHead>% наработки</TableHead>
              <TableHead>След. ТО</TableHead>
              <TableHead>№ ОС</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="min-w-[120px]">Местоположение</TableHead>
              <TableHead>ТО, ч</TableHead>
              <TableHead>Оценка ТО, ч</TableHead>
              {canEdit && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 19 : 18} className="text-center text-muted-foreground">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : tooling.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 19 : 18} className="text-center text-muted-foreground">
                  Нет записей. Добавьте пресс-формы и оснастку по каталогу ПФ.
                </TableCell>
              </TableRow>
            ) : (
              paginatedTooling.map((row, index) => {
                const warrantyPct = warrantyUsagePercent(
                  row.cycleCounterTotal,
                  row.cyclesUntilGuarantee
                );
                const maintenancePct = maintenanceUsagePercent(
                  row.cyclesSinceMaintenance,
                  row.maintenanceCycleInterval
                );
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetailId(row.id)}
                  >
                    <TableCell className="text-muted-foreground">{from + index}</TableCell>
                    <TableCell className="font-mono text-blue-700 dark:text-blue-300 underline-offset-2">
                      {row.pfNumber}
                    </TableCell>
                    <TableCell className="text-sm">{productNamesList(row.products)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatCavitiesDisplay({
                        cavitiesLayout: row.cavitiesLayout,
                        cavities: row.cavities,
                      })}
                      {row.piecesPerCycle != null && (
                        <span className="block text-xs text-muted-foreground">
                          {row.piecesPerCycle} изд./цикл
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        row.infoUpdatedAt &&
                          "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
                      )}
                    >
                      {formatDate(row.infoUpdatedAt)}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.cycleCounterTotal}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.cyclesUntilGuarantee ?? "—"}
                    </TableCell>
                    <TableCell>
                      <PercentCell value={warrantyPct} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        row.lastMaintenanceAt &&
                          "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
                      )}
                    >
                      {formatDate(row.lastMaintenanceAt)}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.cyclesSinceMaintenance}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.maintenanceCycleInterval ?? "—"}
                    </TableCell>
                    <TableCell>
                      <PercentCell value={maintenancePct} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums",
                        plannedDateClass(row.nextMaintenancePlannedAt)
                      )}
                    >
                      {formatDate(row.nextMaintenancePlannedAt)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.fixedAssetNumber ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ToolingStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-sm">{row.storageLocation ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.lastMaintenanceDurationHours ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.estimatedMaintenanceHours ?? "—"}
                    </TableCell>
                    {canEdit && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(row)}
                          title="Редактировать"
                        >
                          <Wrench className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <ListPaginationControls
        page={page}
        totalPages={totalPages}
        total={toolingTotal}
        from={from}
        to={to}
        onPageChange={setPage}
        className="px-1"
      />
    </div>
  );

  const maintenanceTable = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Оснастка и ПФ, для которых подошёл интервал ТО по счётчику циклов (данные из факта
        выпуска в плане: изделия ÷ гнёзда).
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№ ПФ</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>SAP / изделия</TableHead>
              <TableHead>Циклов после ТО</TableHead>
              <TableHead>Интервал ТО</TableHead>
              <TableHead>Последнее ТО</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {maintenanceLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : maintenanceDue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Нет оснастки/ПФ, требующей ТО.
                </TableCell>
              </TableRow>
            ) : (
              maintenanceDue.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetailId(row.id)}
                >
                  <TableCell className="font-mono">{row.pfNumber}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell><ProductLinks products={row.products} /></TableCell>
                  <TableCell className="font-medium text-destructive">
                    {row.cyclesSinceMaintenance}
                  </TableCell>
                  <TableCell>{row.maintenanceCycleInterval ?? "—"}</TableCell>
                  <TableCell>{formatDate(row.lastMaintenanceAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <Button
                        size="sm"
                        onClick={() => openMaintenanceDialog(row.id)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Выполнить ТО
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs value={section} onValueChange={setSection}>
        <TabsList>
          <TabsTrigger value="catalog">Каталог</TabsTrigger>
          <TabsTrigger value="maintenance">
            ТО оснастки/ПФ
            {maintenanceDue.length > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0">
                {maintenanceDue.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="mt-4">
          {catalogTable}
        </TabsContent>
        <TabsContent value="maintenance" className="mt-4">
          {maintenanceTable}
        </TabsContent>
      </Tabs>

      <Sheet open={detailId != null} onOpenChange={(v) => !v && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              {detail ? (
                <>
                  <span className="font-mono">{detail.pfNumber}</span>
                  <span>— {detail.name}</span>
                  <ToolingStatusBadge status={detail.status} />
                </>
              ) : (
                "Карточка оснастки/ПФ"
              )}
            </SheetTitle>
          </SheetHeader>

          {detail && (
            <div className="mt-6 space-y-6 text-sm">
              <section className="space-y-2">
                <h3 className="font-medium">Параметры по изделиям</h3>
                {detail.products.length === 0 ? (
                  <p className="text-muted-foreground">Нет привязанных изделий</p>
                ) : (
                  <div className="space-y-3">
                    {detail.products.map((p) => {
                      const full = products.find((pr) => pr.id === p.id);
                      const normPreview = computeShiftNormFromCycle(
                        full?.cycleTimeSec ?? null,
                        effectivePiecesPerCycle(detail)
                      );
                      return (
                        <div key={p.id} className="rounded-md border p-3 space-y-2">
                          <div className="font-medium">
                            <span className="font-mono">{p.sapCode}</span>
                            <span className="text-muted-foreground"> — {p.name}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-muted-foreground">Цикл, сек</div>
                              <div>{full?.cycleTimeSec ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Вес изд., г</div>
                              <div>{full?.productWeight ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Отливка, г</div>
                              <div>{full?.shotWeight ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Норма 11 ч</div>
                              <div>
                                {full?.defaultShiftNorm?.toLocaleString("ru-RU") ??
                                  (normPreview != null
                                    ? normPreview.toLocaleString("ru-RU")
                                    : "—")}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground">Тип</div>
                  <div>{TOOLING_TYPE_LABELS[detail.toolingType] ?? detail.toolingType}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Гнёзда</div>
                  <div>
                    {formatCavitiesDisplay({
                      cavitiesLayout: detail.cavitiesLayout,
                      cavities: detail.cavities,
                    })}
                  </div>
                  {detail.cavitiesLayout && (
                    <div className="text-xs text-muted-foreground">
                      Всего: {detail.cavities ?? "—"} гнёзд
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-muted-foreground">Изделий за цикл (счётчик)</div>
                  <div className="font-medium tabular-nums">
                    {effectivePiecesPerCycle(detail)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">№ ОС</div>
                  <div className="font-mono">{detail.fixedAssetNumber ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Местоположение</div>
                  <div>{detail.storageLocation ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Дата обновления</div>
                  <div>{formatDate(detail.infoUpdatedAt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Плановая дата ТО</div>
                  <div
                    className={cn(
                      "inline-block rounded px-1.5",
                      plannedDateClass(detail.nextMaintenancePlannedAt)
                    )}
                  >
                    {formatDate(detail.nextMaintenancePlannedAt)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    По плану выпуска изделий
                  </p>
                </div>
                <div>
                  <div className="text-muted-foreground">Длительность ТО, ч</div>
                  <div>{detail.lastMaintenanceDurationHours ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Оценка ТО, ч</div>
                  <div>{detail.estimatedMaintenanceHours ?? "—"}</div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Реестр: гарантия и ТО</h3>
                <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Смыканий (всего)</div>
                    <div className="text-lg font-semibold tabular-nums">{detail.cycleCounterTotal}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Гарантия, смыканий</div>
                    <div className="tabular-nums">{detail.cyclesUntilGuarantee ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">% гарантии</div>
                    <PercentCell
                      value={warrantyUsagePercent(
                        detail.cycleCounterTotal,
                        detail.cyclesUntilGuarantee
                      )}
                    />
                  </div>
                  <div>
                    <div className="text-muted-foreground">Осталось до гарантии</div>
                    <div className="tabular-nums">
                      {detail.cyclesRemainingGuarantee != null
                        ? detail.cyclesRemainingGuarantee
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">После последнего ТО</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {detail.cyclesSinceMaintenance}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">На момент ТО</div>
                    <div className="tabular-nums">{detail.cyclesAtLastMaintenance ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Периодичность ТО</div>
                    <div className="tabular-nums">{detail.maintenanceCycleInterval ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">% наработки после ТО</div>
                    <PercentCell
                      value={maintenanceUsagePercent(
                        detail.cyclesSinceMaintenance,
                        detail.maintenanceCycleInterval
                      )}
                    />
                  </div>
                  <div>
                    <div className="text-muted-foreground">До следующего ТО</div>
                    <div className="font-medium tabular-nums">
                      {detail.cyclesUntilMaintenance != null
                        ? detail.cyclesUntilMaintenance
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Последнее ТО</div>
                    <div>{formatDate(detail.lastMaintenanceAt)}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Циклы считаются из факта выпуска: изделия ÷ изделий за цикл
                  ({effectivePiecesPerCycle(detail)}).
                  Для уже работающих форм значения можно задать вручную через «Редактировать».
                </p>
              </section>

              {detail.comment && (
                <section>
                  <div className="text-muted-foreground">Комментарий</div>
                  <div>{detail.comment}</div>
                </section>
              )}

              {detail.maintenanceHistory.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-medium">История ТО</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Дата</TableHead>
                          <TableHead>Циклов</TableHead>
                          <TableHead>Кто</TableHead>
                          <TableHead>Комментарий</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.maintenanceHistory.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>{formatDate(m.performedAt)}</TableCell>
                            <TableCell>{m.cyclesAtMaintenance}</TableCell>
                            <TableCell>{m.performedByName ?? "—"}</TableCell>
                            <TableCell>{m.comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {canEdit && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" onClick={() => openEdit(detail)}>
                    <Wrench className="h-4 w-4 mr-2" />
                    Редактировать
                  </Button>
                  <Button variant="outline" onClick={() => openCreateProduct(detail)}>
                    <PackagePlus className="h-4 w-4 mr-2" />
                    Добавить изделие
                  </Button>
                  <Button onClick={() => openMaintenanceDialog(detail.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Выполнить ТО
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={open} onOpenChange={setOpen} modal>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" blockOutsideClose>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Редактировать оснастку/ПФ" : "Новая ПФ / оснастка"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-3 rounded-md border p-3">
              <h4 className="text-sm font-medium">Общие данные формы</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>№ ПФ</Label>
                  <Input
                    value={form.pfNumber}
                    onChange={(e) => setForm({ ...form, pfNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Тип</Label>
                  <Select
                    value={form.toolingType}
                    onValueChange={(v) => setForm({ ...form, toolingType: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TOOLING_TYPE_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Наименование формы / оснастки</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Гнёзда</Label>
                  <Input
                    value={form.cavities}
                    onChange={(e) => setForm({ ...form, cavities: e.target.value })}
                    placeholder="8 или 2+2+4+1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Схема «2+2+4+1» — сумма {parseCavitiesInput(form.cavities).cavities ?? "—"} гнёзд
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Изделий за цикл (опц.)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.piecesPerCycle}
                    onChange={(e) => setForm({ ...form, piecesPerCycle: e.target.value })}
                    placeholder="Приоритет для счётчика"
                  />
                  <p className="text-xs text-muted-foreground">
                    Счёт смыканий: {effectivePiecesFromForm(form)} изд./цикл
                    {!form.piecesPerCycle.trim() && form.cavities.includes("+")
                      ? " (первое число схемы)"
                      : ""}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Статус</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TOOLING_STATUS_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Место хранения</Label>
                  <Input
                    value={form.storageLocation}
                    onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>№ ОС (инвентарный)</Label>
                  <Input
                    value={form.fixedAssetNumber}
                    onChange={(e) => setForm({ ...form, fixedAssetNumber: e.target.value })}
                    placeholder="1000691"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Дата обновления информации</Label>
                  <Input
                    type="date"
                    value={form.infoUpdatedAt}
                    onChange={(e) => setForm({ ...form, infoUpdatedAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Циклов до гарантии</Label>
                  <Input
                    value={form.cyclesUntilGuarantee}
                    onChange={(e) =>
                      setForm({ ...form, cyclesUntilGuarantee: e.target.value })
                    }
                    placeholder="Опционально"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Периодичность ТО, циклов</Label>
                  <Input
                    value={form.maintenanceCycleInterval}
                    onChange={(e) =>
                      setForm({ ...form, maintenanceCycleInterval: e.target.value })
                    }
                    placeholder="Через сколько циклов ТО"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Плановая дата следующего ТО</Label>
                  <Input
                    type="date"
                    value={form.nextMaintenancePlannedAt}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Рассчитывается автоматически по плану выпуска и наработке после ТО
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Длительность последнего ТО, ч</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.lastMaintenanceDurationHours}
                    onChange={(e) =>
                      setForm({ ...form, lastMaintenanceDurationHours: e.target.value })
                    }
                    placeholder="Часы"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Оценочное время ТО, ч</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.estimatedMaintenanceHours}
                    onChange={(e) =>
                      setForm({ ...form, estimatedMaintenanceHours: e.target.value })
                    }
                    placeholder="Часы"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                <h4 className="text-sm font-medium">Счётчики и ТО (ручной ввод)</h4>
                <p className="text-xs text-muted-foreground">
                  Для форм уже в работе укажите накопленные циклы и дату последнего ТО. После
                  сохранения значения не перезапишутся автоматически, пока поля заполнены.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Всего циклов</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.cycleCounterTotal}
                      onChange={(e) =>
                        setForm({ ...form, cycleCounterTotal: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>После последнего ТО</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.cyclesSinceMaintenance}
                      onChange={(e) =>
                        setForm({ ...form, cyclesSinceMaintenance: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>На момент ТО</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.cyclesAtLastMaintenance}
                      onChange={(e) =>
                        setForm({ ...form, cyclesAtLastMaintenance: e.target.value })
                      }
                      placeholder="Авто: всего − после ТО"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Дата последнего ТО</Label>
                    <Input
                      type="date"
                      value={form.lastMaintenanceAt}
                      onChange={(e) =>
                        setForm({ ...form, lastMaintenanceAt: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Комментарий</Label>
                <Input
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <h4 className="text-sm font-medium">Изделия и параметры</h4>
              <div className="space-y-2">
                <Label>Привязанные изделия (SAP)</Label>
                <ScrollArea className="h-[120px] rounded-md border p-3">
                  {products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет изделий в каталоге</p>
                  ) : (
                    <div className="space-y-2">
                      {products.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={form.productIds.includes(p.id)}
                            onCheckedChange={(checked) =>
                              toggleProductId(p.id, checked === true)
                            }
                          />
                          <span className="font-mono">{p.sapCode}</span>
                          <span className="text-muted-foreground truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {form.productIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Выберите изделия — ниже появятся поля цикла, гнёзд и норм для каждого SAP.
                </p>
              ) : (
                <div className="space-y-3">
                  {form.productIds.map((productId) => {
                    const product = products.find((p) => p.id === productId);
                    const params = form.productParams[productId] ?? paramsFromProduct({});
                    const piecesPerCycle = effectivePiecesFromForm(form);
                    const normPreview = computeShiftNormFromCycle(
                      params.cycleTimeSec ? Number(params.cycleTimeSec) : null,
                      piecesPerCycle
                    );
                    return (
                      <div key={productId} className="rounded-md border p-3 space-y-3">
                        <div className="text-sm font-medium">
                          <span className="font-mono">{product?.sapCode ?? productId}</span>
                          {product?.name && (
                            <span className="text-muted-foreground"> — {product.name}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label>Цикл, сек</Label>
                            <Input
                              value={params.cycleTimeSec}
                              onChange={(e) =>
                                updateProductParams(productId, { cycleTimeSec: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Вес изделия, г</Label>
                            <Input
                              value={params.productWeight}
                              onChange={(e) =>
                                updateProductParams(productId, { productWeight: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Вес отливки, г</Label>
                            <Input
                              value={params.shotWeight}
                              onChange={(e) =>
                                updateProductParams(productId, { shotWeight: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1 col-span-2">
                            <Label>Норма 11 ч, шт</Label>
                            <Input
                              value={params.defaultShiftNorm}
                              onChange={(e) =>
                                updateProductParams(productId, {
                                  defaultShiftNorm: e.target.value,
                                })
                              }
                              placeholder={
                                normPreview != null ? String(normPreview) : "из цикла × гнёзда"
                              }
                            />
                            {normPreview != null && !params.defaultShiftNorm && (
                              <p className="text-xs text-muted-foreground">
                                Расчёт: {normPreview.toLocaleString("ru-RU")} шт/смена
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={handleSave}
              disabled={!form.pfNumber.trim() || !form.name.trim()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productOpen} onOpenChange={setProductOpen} modal>
        <DialogContent blockOutsideClose>
          <DialogHeader>
            <DialogTitle>Создать изделие из ПФ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>SAP-код изделия</Label>
              <Input
                value={productForm.sapCode}
                onChange={(e) => setProductForm({ ...productForm, sapCode: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Наименование</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Цикл, гнёзда и нормы задаются ниже в блоке параметров по изделиям.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>Отмена</Button>
            <Button
              onClick={handleCreateProduct}
              disabled={!productForm.sapCode.trim() || createProductFromTooling.isPending}
            >
              Создать изделие
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={maintenanceOpen} onOpenChange={setMaintenanceOpen} modal>
        <DialogContent blockOutsideClose>
          <DialogHeader>
            <DialogTitle>Выполнить ТО оснастки/ПФ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Зафиксируйте ТО: счётчик «после ТО» сбросится относительно указанного суммарного
              значения циклов на момент обслуживания.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Дата ТО</Label>
                <Input
                  type="date"
                  value={maintenancePerformedAt}
                  onChange={(e) => setMaintenancePerformedAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Циклов на момент ТО</Label>
                <Input
                  type="number"
                  min={0}
                  value={maintenanceCyclesAt}
                  onChange={(e) => setMaintenanceCyclesAt(e.target.value)}
                  placeholder="Текущий счётчик"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Комментарий</Label>
              <Input
                value={maintenanceComment}
                onChange={(e) => setMaintenanceComment(e.target.value)}
                placeholder="Что выполнено…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintenanceOpen(false)}>Отмена</Button>
            <Button
              onClick={handleRecordMaintenance}
              disabled={recordToolingMaintenance.isPending}
            >
              Подтвердить ТО
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
