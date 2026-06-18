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
  TOOLING_STATUS_VARIANTS,
  TOOLING_TYPE_LABELS,
} from "@/lib/production-planning-constants";
import { Plus, Wrench, PackagePlus, Eye, CheckCircle2 } from "lucide-react";
import { computeShiftNormFromCycle } from "@shared/production-norm-utils";
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
  productIds: number[];
  productParams: Record<number, ProductParamsForm>;
  toolingType: string;
  status: string;
  storageLocation: string;
  cyclesUntilGuarantee: string;
  maintenanceCycleInterval: string;
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

function parseProductParams(params: ProductParamsForm, cavities?: number) {
  const cycle = params.cycleTimeSec ? Number(params.cycleTimeSec) : undefined;
  return {
    cycleTimeSec: cycle,
    cavities,
    productWeight: params.productWeight ? Number(params.productWeight) : undefined,
    shotWeight: params.shotWeight ? Number(params.shotWeight) : undefined,
    defaultShiftNorm: params.defaultShiftNorm
      ? Number(params.defaultShiftNorm)
      : computeShiftNormFromCycle(cycle ?? null, cavities ?? null) ?? undefined,
  };
}

const emptyForm = (): ToolingFormState => ({
  pfNumber: "",
  name: "",
  cavities: "",
  productIds: [],
  productParams: {},
  toolingType: "press_form",
  status: "ok",
  storageLocation: "",
  cyclesUntilGuarantee: "",
  maintenanceCycleInterval: "",
  comment: "",
});

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

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={TOOLING_STATUS_VARIANTS[status] ?? "outline"}>
      {TOOLING_STATUS_LABELS[status] ?? status}
    </Badge>
  );
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
      cavities: row.cavities ? String(row.cavities) : "",
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
    const cavities = form.cavities ? Number(form.cavities) : undefined;
    for (const productId of form.productIds) {
      const params = form.productParams[productId];
      if (!params) continue;
      const parsed = parseProductParams(params, cavities);
      await updateProduct.mutateAsync({
        id: productId,
        pfNumber,
        ...parsed,
      });
    }
  };

  const handleSave = async () => {
    try {
      const pfNumber = form.pfNumber.trim();
      const cavities = form.cavities ? Number(form.cavities) : undefined;
      const firstId = form.productIds[0];
      const firstParsed = firstId && form.productParams[firstId]
        ? parseProductParams(form.productParams[firstId], cavities)
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
        cavities,
        productWeightGr: firstParsed.productWeight,
        shotWeightGr: firstParsed.shotWeight,
        storageLocation: form.storageLocation || undefined,
        cyclesUntilGuarantee: form.cyclesUntilGuarantee
          ? Number(form.cyclesUntilGuarantee)
          : undefined,
        maintenanceCycleInterval: form.maintenanceCycleInterval
          ? Number(form.maintenanceCycleInterval)
          : undefined,
        comment: form.comment || undefined,
      };

      if (editing) {
        await updateTooling.mutateAsync({ id: editing.id, ...payload });
        await syncLinkedProducts(pfNumber);
        toast({ title: "Оснастка/ПФ обновлена" });
        if (detailId === editing.id) setDetailId(editing.id);
      } else {
        const created = await createTooling.mutateAsync(payload);
        await syncLinkedProducts(pfNumber);
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
    setMaintenanceToolingId(toolingId);
    setMaintenanceComment("");
    setMaintenanceOpen(true);
  };

  const handleRecordMaintenance = async () => {
    if (!maintenanceToolingId) return;
    try {
      await recordToolingMaintenance.mutateAsync({
        toolingId: maintenanceToolingId,
        comment: maintenanceComment.trim() || undefined,
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№ ПФ</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>SAP / изделия</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Циклов (всего)</TableHead>
              <TableHead>После ТО</TableHead>
              <TableHead>До ТО</TableHead>
              <TableHead>До гарантии</TableHead>
              <TableHead>Цикл, сек</TableHead>
              <TableHead>Гнёзд</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : tooling.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground">
                  Нет записей. Добавьте пресс-формы и оснастку по каталогу ПФ.
                </TableCell>
              </TableRow>
            ) : (
              paginatedTooling.map((row) => (
                <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-mono">{row.pfNumber}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell><ProductLinks products={row.products} /></TableCell>
                  <TableCell>
                    {TOOLING_TYPE_LABELS[row.toolingType] ?? row.toolingType}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>{row.cycleCounterTotal}</TableCell>
                  <TableCell>{row.cyclesSinceMaintenance}</TableCell>
                  <TableCell>
                    {row.cyclesUntilMaintenance != null
                      ? row.cyclesUntilMaintenance
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {row.cyclesRemainingGuarantee != null
                      ? row.cyclesRemainingGuarantee
                      : "—"}
                  </TableCell>
                  <TableCell>{row.cycleTimeSec ?? "—"}</TableCell>
                  <TableCell>{row.cavities ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDetailId(row.id)}
                        title="Карточка"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(row)}
                          title="Редактировать"
                        >
                          <Wrench className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{row.pfNumber}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell><ProductLinks products={row.products} /></TableCell>
                  <TableCell className="font-medium text-destructive">
                    {row.cyclesSinceMaintenance}
                  </TableCell>
                  <TableCell>{row.maintenanceCycleInterval ?? "—"}</TableCell>
                  <TableCell>{formatDate(row.lastMaintenanceAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailId(row.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          onClick={() => openMaintenanceDialog(row.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Выполнить ТО
                        </Button>
                      )}
                    </div>
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
                  <StatusBadge status={detail.status} />
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
                        detail.cavities ?? null
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
                  <div className="text-muted-foreground">Гнёзд</div>
                  <div>{detail.cavities ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Место хранения</div>
                  <div>{detail.storageLocation ?? "—"}</div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Счётчики циклов</h3>
                <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                  <div>
                    <div className="text-muted-foreground">Всего (из плана)</div>
                    <div className="text-lg font-semibold">{detail.cycleCounterTotal}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">После последнего ТО</div>
                    <div className="text-lg font-semibold">{detail.cyclesSinceMaintenance}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">На момент ТО</div>
                    <div>{detail.cyclesAtLastMaintenance ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">До следующего ТО</div>
                    <div className="font-medium">
                      {detail.cyclesUntilMaintenance != null
                        ? detail.cyclesUntilMaintenance
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Интервал ТО, циклов</div>
                    <div>{detail.maintenanceCycleInterval ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">До гарантии, циклов</div>
                    <div>
                      {detail.cyclesRemainingGuarantee != null
                        ? detail.cyclesRemainingGuarantee
                        : "—"}
                      {detail.cyclesUntilGuarantee != null && (
                        <span className="text-muted-foreground text-xs ml-1">
                          (лимит {detail.cyclesUntilGuarantee})
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Последнее ТО</div>
                    <div>{formatDate(detail.lastMaintenanceAt)}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Циклы считаются из факта выпуска (вкладка «Факт» / календарь): изделия ÷ гнёзда формы.
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
              <div className="space-y-1">
                <Label>Гнёзд, шт</Label>
                <Input
                  value={form.cavities}
                  onChange={(e) => setForm({ ...form, cavities: e.target.value })}
                  placeholder="Количество гнёзд формы"
                />
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
                    const cavitiesNum = form.cavities ? Number(form.cavities) : null;
                    const normPreview = computeShiftNormFromCycle(
                      params.cycleTimeSec ? Number(params.cycleTimeSec) : null,
                      cavitiesNum
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
              Счётчик «после ТО» обнулится, в историю добавится запис с текущим суммарным
              счётчиком циклов.
            </p>
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
