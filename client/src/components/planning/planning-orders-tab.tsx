import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useAccessControl } from "@/hooks/use-access-control";
import {
  useProductionOrders,
  useProductionProducts,
  useProductionTooling,
  useProductionMutations,
  useActiveShiftPattern,
  useProductShiftNorms,
} from "@/hooks/use-production-planning";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { resolveShiftNorm } from "@shared/production-norm-utils";
import { formatCavitiesDisplay } from "@shared/cavities-utils";
import {
  buildAutoPlanDistribution,
  sumDistribution,
  type PlanDistributionLine,
} from "@shared/production-plan-distribution";
import {
  PRODUCTION_ORDER_PRIORITY_LABELS,
  PRODUCTION_ORDER_STATUS_LABELS,
} from "@/lib/production-planning-constants";
import { Plus, Upload, ArrowRightCircle } from "lucide-react";
import type { ProductionOrder } from "@shared/schema";
import { ProductionExcelImportDialog } from "@/components/planning/production-excel-import-dialog";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

type Props = {
  subdivisionId: number;
};

export function PlanningOrdersTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: orders = [], isLoading } = useProductionOrders({
    subdivisionId,
    status: statusFilter === "all" ? undefined : statusFilter,
    priority: priorityFilter === "all" ? undefined : priorityFilter,
  });
  const { data: products = [] } = useProductionProducts({
    subdivisionId,
    activeOnly: true,
  });
  const { data: tooling = [] } = useProductionTooling(subdivisionId);
  const { data: shiftPattern } = useActiveShiftPattern(subdivisionId);
  const shiftSlots = shiftPattern?.slots ?? [];
  const { allEquipment } = useEquipmentApi();
  const equipment = useMemo(
    () =>
      allEquipment.filter(
        (e) =>
          e.status !== "decommissioned" &&
          ((e as { subdivisionId?: number }).subdivisionId === subdivisionId ||
            (e as { homeSubdivisionId?: number }).homeSubdivisionId === subdivisionId)
      ),
    [allEquipment, subdivisionId]
  );

  const ordersFilterKey = `${statusFilter}|${priorityFilter}`;
  const {
    page,
    setPage,
    pageItems: orderPageItems,
    totalPages,
    total: ordersTotal,
    from,
    to,
  } = useListPagination(orders, 25, ordersFilterKey);

  const { createOrder, updateOrderStatus, createPlanningDemand } = useProductionMutations();

  const [form, setForm] = useState({
    toolingId: "",
    productId: "",
    equipmentId: "",
    requestedQuantity: "10000",
    desiredStartDate: new Date().toISOString().slice(0, 10),
    desiredEndDate: "",
    shiftNormOverride: "",
    priority: "medium",
    orderNumber: "",
    comment: "",
    mode: "planning" as "planning" | "simple",
  });

  const [activeShiftCodes, setActiveShiftCodes] = useState<string[]>(["1", "2"]);
  const [planDistribution, setPlanDistribution] = useState<PlanDistributionLine[]>([]);
  const [distributionTouched, setDistributionTouched] = useState(false);

  const selectedTooling = tooling.find((t) => String(t.id) === form.toolingId);
  const selectedProduct = products.find(
    (p) =>
      String(p.id) === form.productId ||
      (selectedTooling?.productId != null && p.id === selectedTooling.productId)
  );

  const productIdForNorms = form.productId
    ? Number(form.productId)
    : selectedTooling?.productId ?? null;
  const { data: productShiftNorms } = useProductShiftNorms(productIdForNorms, subdivisionId);

  useEffect(() => {
    if (shiftSlots.length > 0) {
      setActiveShiftCodes(shiftSlots.map((s) => s.code));
    }
  }, [shiftSlots.map((s) => s.code).join(",")]);

  const normByShift = useMemo(() => {
    const resolved = productShiftNorms?.resolved ?? {};
    const out: Record<string, number> = {};
    for (const slot of shiftSlots) {
      const fromSettings = resolved[slot.code];
      if (fromSettings && fromSettings > 0) {
        out[slot.code] = fromSettings;
        continue;
      }
      if (selectedProduct) {
        const computed = resolveShiftNorm(
          selectedProduct,
          null,
          selectedTooling ?? undefined,
          { shiftCode: slot.code, shiftHours: slot.hours, shiftNormByCode: resolved }
        );
        if (computed && computed > 0) out[slot.code] = computed;
      }
    }
    return out;
  }, [shiftSlots, productShiftNorms, selectedProduct, selectedTooling]);

  useEffect(() => {
    if (form.mode !== "planning" || distributionTouched) return;
    const qty = Number(form.requestedQuantity);
    if (!qty || qty <= 0 || !form.desiredStartDate || activeShiftCodes.length === 0) {
      setPlanDistribution([]);
      return;
    }
    const lines = buildAutoPlanDistribution({
      totalQuantity: qty,
      startDate: form.desiredStartDate,
      endDate: form.desiredEndDate || undefined,
      slots: shiftSlots,
      activeShiftCodes,
      normByShift,
    });
    setPlanDistribution(lines);
  }, [
    form.mode,
    form.requestedQuantity,
    form.desiredStartDate,
    form.desiredEndDate,
    activeShiftCodes,
    normByShift,
    shiftSlots,
    distributionTouched,
  ]);

  const normPreview = useMemo(() => {
    if (!selectedProduct) return null;
    return resolveShiftNorm(
      selectedProduct,
      null,
      selectedTooling ?? undefined
    );
  }, [selectedProduct, selectedTooling]);

  const handleProductChange = (productId: string) => {
    const product = products.find((p) => String(p.id) === productId);
    let toolingId = "";
    if (product) {
      const byPf = product.pfNumber
        ? tooling.find((t) => t.pfNumber === product.pfNumber)
        : undefined;
      const byLink = tooling.find((t) => t.products.some((pr) => pr.id === product.id));
      const linked = byPf ?? byLink;
      if (linked) toolingId = String(linked.id);
    }
    setForm((f) => ({
      ...f,
      productId,
      toolingId: toolingId || f.toolingId,
    }));
  };

  const handleToolingChange = (toolingId: string) => {
    const t = tooling.find((x) => String(x.id) === toolingId);
    setForm((f) => ({
      ...f,
      toolingId,
      productId: t?.productId ? String(t.productId) : f.productId,
    }));
  };

  const handleCreate = async () => {
    try {
      if (form.mode === "planning") {
        const productId = form.productId
          ? Number(form.productId)
          : selectedTooling?.productId;
        if (!productId || !form.equipmentId) {
          toast({
            title: "Укажите оборудование и изделие (или ПФ с изделием)",
            variant: "destructive",
          });
          return;
        }
        await createPlanningDemand.mutateAsync({
          subdivisionId,
          productId,
          equipmentId: form.equipmentId,
          toolingId: form.toolingId ? Number(form.toolingId) : undefined,
          requestedQuantity: Number(form.requestedQuantity),
          desiredStartDate: form.desiredStartDate || undefined,
          desiredEndDate: form.desiredEndDate || undefined,
          shiftNormOverride: form.shiftNormOverride
            ? Number(form.shiftNormOverride)
            : undefined,
          activeShiftCodes,
          planDistribution: planDistribution.length > 0 ? planDistribution : undefined,
          priority: form.priority,
          orderNumber: form.orderNumber.trim() || undefined,
          comment: form.comment || undefined,
        });
        toast({
          title: "Потребность создана",
          description: "Заказ в плане — откройте «График» → «Календарь»",
        });
      } else {
        await createOrder.mutateAsync({
          subdivisionId,
          productId: Number(form.productId),
          requestedQuantity: Number(form.requestedQuantity),
          priority: form.priority,
          orderNumber: form.orderNumber.trim(),
          orderNumberIsManual: Boolean(form.orderNumber.trim()),
          comment: form.comment || undefined,
          status: "draft",
          source: "manual",
        });
        toast({ title: "Заказ создан (черновик)" });
      }
      setCreateOpen(false);
      setDistributionTouched(false);
      setPlanDistribution([]);
      setForm({
        toolingId: "",
        productId: "",
        equipmentId: "",
        requestedQuantity: "10000",
        desiredStartDate: new Date().toISOString().slice(0, 10),
        desiredEndDate: "",
        shiftNormOverride: "",
        priority: "medium",
        orderNumber: "",
        comment: "",
        mode: "planning",
      });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось создать заказ",
        variant: "destructive",
      });
    }
  };

  const handleToPlan = async (order: ProductionOrder) => {
    try {
      await updateOrderStatus.mutateAsync({ id: order.id, status: "ready" });
      toast({ title: "Заказ готов к планированию" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Ошибка",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {Object.entries(PRODUCTION_ORDER_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Приоритет" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все приоритеты</SelectItem>
              {Object.entries(PRODUCTION_ORDER_PRIORITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1" />
              Импорт Excel
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Потребность / заказ
            </Button>
          </div>
        )}
      </div>

      <div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>Изделие</TableHead>
                <TableHead>Запрошено</TableHead>
                <TableHead>Выполнено</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : ordersTotal === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Нет заказов
                  </TableCell>
                </TableRow>
              ) : (
                orderPageItems.map((o) => {
                const product = products.find((p) => p.id === o.productId);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.orderNumber}</TableCell>
                    <TableCell>{product?.name ?? `ID ${o.productId}`}</TableCell>
                    <TableCell>{o.requestedQuantity}</TableCell>
                    <TableCell>{o.completedQuantity}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PRODUCTION_ORDER_STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {PRODUCTION_ORDER_PRIORITY_LABELS[o.priority] ?? o.priority}
                    </TableCell>
                    <TableCell>
                      {canEdit && o.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToPlan(o)}
                          title="В план"
                        >
                          <ArrowRightCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
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
          total={ordersTotal}
          from={from}
          to={to}
          onPageChange={setPage}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Потребность / заказ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Режим</Label>
              <Select
                value={form.mode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, mode: v as "planning" | "simple" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">
                    Планирование (оборудование + график)
                  </SelectItem>
                  <SelectItem value="simple">Простой заказ (черновик)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.mode === "planning" && (
              <>
                <div>
                  <Label>Оборудование (линия)</Label>
                  <Select
                    value={form.equipmentId}
                    onValueChange={(v) => setForm((f) => ({ ...f, equipmentId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите линию" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipment.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Изделие</Label>
                  <Select
                    value={form.productId}
                    onValueChange={handleProductChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите изделие" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.sapCode} — {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProduct && (
                    <p className="text-xs text-muted-foreground mt-1">
                      SAP: {selectedProduct.sapCode}
                      {shiftSlots.length > 0 ? (
                        <>
                          {" · "}
                          {shiftSlots.map((slot) => (
                            <span key={slot.code} className="mr-2">
                              {slot.name}:{" "}
                              {normByShift[slot.code]?.toLocaleString("ru-RU") ?? "—"} шт
                            </span>
                          ))}
                        </>
                      ) : normPreview != null ? (
                        <> · норма: {normPreview.toLocaleString("ru-RU")} шт</>
                      ) : null}
                    </p>
                  )}
                </div>
                <div>
                  <Label>ПФ / оснастка</Label>
                  <Select
                    value={form.toolingId || "none"}
                    onValueChange={(v) => handleToolingChange(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Подставится по изделию" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не выбрано</SelectItem>
                      {tooling.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.pfNumber} — {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTooling && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Гнёзд: {formatCavitiesDisplay(selectedTooling)}
                      {selectedTooling.maintenanceCycleInterval != null && (
                        <> · ТО каждые {selectedTooling.maintenanceCycleInterval} циклов</>
                      )}
                    </p>
                  )}
                </div>
              </>
            )}

            {form.mode !== "planning" && (
            <div>
              <Label>Изделие</Label>
              <Select
                value={form.productId}
                onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите изделие" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.sapCode} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            {form.mode === "planning" && shiftSlots.length > 0 && (
              <div>
                <Label className="mb-2 block">Смены в плане</Label>
                <div className="flex flex-wrap gap-4">
                  {shiftSlots.map((slot) => (
                    <label key={slot.code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={activeShiftCodes.includes(slot.code)}
                        onCheckedChange={(checked) => {
                          setDistributionTouched(false);
                          setActiveShiftCodes((prev) =>
                            checked
                              ? [...prev, slot.code].sort()
                              : prev.filter((c) => c !== slot.code)
                          );
                        }}
                      />
                      {slot.name} ({slot.hours} ч)
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>План, шт</Label>
                <Input
                  type="number"
                  value={form.requestedQuantity}
                  onChange={(e) => {
                    setDistributionTouched(false);
                    setForm((f) => ({ ...f, requestedQuantity: e.target.value }));
                  }}
                />
              </div>
              {form.mode === "planning" && (
                <div>
                  <Label>Норма смены (override)</Label>
                  <Input
                    type="number"
                    placeholder={normPreview != null ? String(normPreview) : ""}
                    value={form.shiftNormOverride}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, shiftNormOverride: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>

            {form.mode === "planning" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Начало</Label>
                  <Input
                    type="date"
                    value={form.desiredStartDate}
                    onChange={(e) => {
                      setDistributionTouched(false);
                      setForm((f) => ({ ...f, desiredStartDate: e.target.value }));
                    }}
                  />
                </div>
                <div>
                  <Label>Окончание</Label>
                  <Input
                    type="date"
                    value={form.desiredEndDate}
                    onChange={(e) => {
                      setDistributionTouched(false);
                      setForm((f) => ({ ...f, desiredEndDate: e.target.value }));
                    }}
                  />
                </div>
              </div>
            )}

            {form.mode === "planning" && planDistribution.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Label>Распределение по дням и сменам</Label>
                  <span className="text-xs text-muted-foreground">
                    Σ {sumDistribution(planDistribution).toLocaleString("ru-RU")} /{" "}
                    {Number(form.requestedQuantity).toLocaleString("ru-RU")} шт
                  </span>
                </div>
                <div className="rounded-md border max-h-[200px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Смена</TableHead>
                        <TableHead className="text-right">План, шт</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planDistribution.map((line, idx) => {
                        const slot = shiftSlots.find((s) => s.code === line.shiftCode);
                        return (
                          <TableRow key={`${line.planDate}-${line.shiftCode}-${idx}`}>
                            <TableCell>{line.planDate}</TableCell>
                            <TableCell>{slot?.name ?? `Смена ${line.shiftCode}`}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                className="h-8 w-24 ml-auto text-right"
                                value={line.plannedQuantity}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  if (Number.isNaN(v) || v < 0) return;
                                  setDistributionTouched(true);
                                  setPlanDistribution((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, plannedQuantity: v } : l
                                    )
                                  );
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => setDistributionTouched(false)}
                >
                  Пересчитать автоматически
                </Button>
              </div>
            )}

            <div>
              <Label>Номер заказа (опционально)</Label>
              <Input
                value={form.orderNumber}
                onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))}
                placeholder="Авто, если пусто"
              />
            </div>
            <div>
              <Label>Приоритет</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCTION_ORDER_PRIORITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={
                createPlanningDemand.isPending ||
                createOrder.isPending ||
                (form.mode === "planning" && !form.equipmentId) ||
                (form.mode === "simple" && !form.productId) ||
                (form.mode === "planning" && !form.productId && !selectedTooling?.productId)
              }
            >
              {form.mode === "planning" ? "Создать и добавить в график" : "Создать черновик"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductionExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        subdivisionId={subdivisionId}
      />
    </div>
  );
}
