import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAccessControl } from "@/hooks/use-access-control";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import {
  useDailyPlanGrid,
  useProductionOrders,
  useProductionProducts,
  useProductionTooling,
  useProductionMutations,
  type DailyPlanGridResponse,
  type DailyPlanCellValue,
} from "@/hooks/use-production-planning";
import { ChevronLeft, ChevronRight, Plus, Save, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  subdivisionId: number;
};

type PendingKey = string;

function cellKey(rowKey: string, date: string, shift: string): PendingKey {
  return `${rowKey}::${date}::${shift}`;
}

function emptyCell(): DailyPlanCellValue {
  return { shifts: {}, fact: 0 };
}

export function PlanningCalendarGrid({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");

  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const from = startOfMonth(monthAnchor).toISOString();
  const to = endOfMonth(monthAnchor).toISOString();

  const { data: grid, isLoading, refetch } = useDailyPlanGrid(subdivisionId, from, to);
  const { allEquipment } = useEquipmentApi();
  const { data: orders = [] } = useProductionOrders({ subdivisionId });
  const { data: products = [] } = useProductionProducts({ subdivisionId });
  const { data: tooling = [] } = useProductionTooling(subdivisionId);
  const { bulkUpsertDailyPlan, createFact } = useProductionMutations();

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

  const [pending, setPending] = useState<Record<PendingKey, number>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ equipmentId: "", orderId: "" });
  const [factOpen, setFactOpen] = useState(false);
  const [factContext, setFactContext] = useState<{
    row: DailyPlanGridResponse["rows"][0];
    date: string;
  } | null>(null);
  const [factForm, setFactForm] = useState({
    producedQuantity: "",
    defectiveQuantity: "0",
    downtimeMinutes: "0",
    downtimeReason: "",
    comment: "",
  });

  const dates = grid?.dates ?? [];
  const rows = grid?.rows ?? [];
  const shiftSlots =
    grid?.shiftSlots?.length
      ? grid.shiftSlots
      : [
          { code: "1", name: "Смена 1", hours: 11 },
          { code: "2", name: "Смена 2", hours: 11 },
        ];

  const getShiftValue = (
    row: DailyPlanGridResponse["rows"][0],
    date: string,
    shiftCode: string
  ) => {
    const key = cellKey(row.key, date, shiftCode);
    if (pending[key] != null) return pending[key];
    const cell = row.cells[date] ?? emptyCell();
    return cell.shifts[shiftCode] ?? 0;
  };

  const handleShiftChange = (
    row: DailyPlanGridResponse["rows"][0],
    date: string,
    shiftCode: string,
    raw: string
  ) => {
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0) return;
    setPending((prev) => ({ ...prev, [cellKey(row.key, date, shiftCode)]: value }));
  };

  const buildEntries = () => {
    const entries: Array<{
      equipmentId: string;
      orderId: number | null;
      productId: number | null;
      planDate: string;
      shiftCode: string;
      plannedQuantity: number;
      pfNumber: string | null;
    }> = [];

    for (const [key, value] of Object.entries(pending)) {
      const [rowKey, planDate, shiftCode] = key.split("::");
      const row = rows.find((r) => r.key === rowKey);
      if (!row) continue;
      entries.push({
        equipmentId: row.equipmentId,
        orderId: row.orderId,
        productId: row.productId,
        planDate,
        shiftCode,
        plannedQuantity: value,
        pfNumber: row.pfNumber,
      });
    }
    return entries;
  };

  const handleSave = async () => {
    const entries = buildEntries();
    if (entries.length === 0) {
      toast({ title: "Нет изменений" });
      return;
    }
    try {
      await bulkUpsertDailyPlan.mutateAsync({ subdivisionId, entries });
      setPending({});
      toast({ title: "План сохранён" });
      refetch();
    } catch (e: unknown) {
      toast({
        title: "Ошибка сохранения",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  const handleAddRow = async () => {
    const order = orders.find((o) => String(o.id) === addForm.orderId);
    if (!addForm.equipmentId || !order) return;
    const firstDate = dates[0];
    if (!firstDate) return;

    const product = products.find((p) => p.id === order.productId);
    const linkedTooling = product?.pfNumber
      ? tooling.find((t) => t.pfNumber === product.pfNumber)
      : tooling.find((t) => t.products.some((pr) => pr.id === order.productId));

    try {
      await bulkUpsertDailyPlan.mutateAsync({
        subdivisionId,
        entries: [
          {
            equipmentId: addForm.equipmentId,
            orderId: order.id,
            productId: order.productId,
            planDate: firstDate,
            shiftCode: "1",
            plannedQuantity: 0,
            pfNumber: product?.pfNumber ?? linkedTooling?.pfNumber ?? null,
            toolingId: linkedTooling?.id ?? null,
          },
        ],
      });
      setAddOpen(false);
      setAddForm({ equipmentId: "", orderId: "" });
      refetch();
      toast({ title: "Строка добавлена в план" });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const openFactDialog = (
    row: DailyPlanGridResponse["rows"][0],
    date: string
  ) => {
    if (!row.orderId) return;
    setFactContext({ row, date });
    setFactForm({
      producedQuantity: "",
      defectiveQuantity: "0",
      downtimeMinutes: "0",
      downtimeReason: "",
      comment: "",
    });
    setFactOpen(true);
  };

  const handleSaveFact = async () => {
    if (!factContext?.row.orderId) return;
    try {
      await createFact.mutateAsync({
        subdivisionId,
        orderId: factContext.row.orderId,
        equipmentId: factContext.row.equipmentId,
        reportDate: factContext.date,
        producedQuantity: Number(factForm.producedQuantity),
        defectiveQuantity: Number(factForm.defectiveQuantity),
        downtimeMinutes: Number(factForm.downtimeMinutes),
        downtimeReason: factForm.downtimeReason || undefined,
        comment: factForm.comment || undefined,
        factType: "ad_hoc",
      });
      toast({
        title: "Факт смены сохранён",
        description: "Счётчики оснастки и отчётность обновятся автоматически",
      });
      setFactOpen(false);
      refetch();
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить факт",
        variant: "destructive",
      });
    }
  };

  const pendingCount = Object.keys(pending).length;

  const formatShifts = (v: number | null) =>
    v != null ? v.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonthAnchor((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium min-w-[140px] text-center">
            {format(monthAnchor, "LLLL yyyy", { locale: ru })}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Строка (оборудование + заказ)
              </Button>
              <Button
                onClick={handleSave}
                disabled={bulkUpsertDailyPlan.isPending || pendingCount === 0}
                variant={pendingCount > 0 ? "default" : "secondary"}
              >
                <Save className="h-4 w-4 mr-2" />
                Сохранить план{pendingCount > 0 ? ` (${pendingCount})` : ""}
              </Button>
              {pendingCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setPending({})}>
                  Отменить изменения
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        В ячейке дня: <strong>план по сменам</strong> (верх) и <strong>выпуск за день</strong> (кнопка).
        Итог по заказу — в колонке «Факт» слева (сумма всех дней).
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка календаря…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-2 text-left sticky left-0 bg-muted/50 z-20 min-w-[160px]">
                  Линия / оборудование
                </th>
                <th className="p-2 text-left min-w-[180px]">Изделие</th>
                <th className="p-2 text-left min-w-[72px]">SAP</th>
                <th className="p-2 text-left min-w-[64px]">№ ПФ</th>
                <th className="p-2 text-center min-w-[72px]">Норма</th>
                <th className="p-2 text-center min-w-[72px]">План, шт</th>
                <th className="p-2 text-center min-w-[72px]">Остаток</th>
                <th className="p-2 text-center min-w-[72px]">Факт</th>
                <th className="p-2 text-center min-w-[56px]">Смен</th>
                <th className="p-2 text-center min-w-[48px]">%</th>
                {dates.map((d) => (
                  <th
                    key={d}
                    className="p-1.5 text-center min-w-[72px] whitespace-nowrap border-l border-border/40"
                  >
                    <div className="font-medium">{format(new Date(d), "d", { locale: ru })}</div>
                    <div className="text-[11px] text-muted-foreground font-normal">
                      {format(new Date(d), "EEE", { locale: ru })}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                      {shiftSlots.map((s) => s.code).join(" · ")}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={dates.length + 10}
                    className="p-4 text-center text-muted-foreground"
                  >
                    Нет строк плана. Создайте потребность или добавьте строку вручную.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.key} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="p-2 sticky left-0 bg-background z-10 font-medium border-r">
                      {row.equipmentName}
                      {row.orderNumber && (
                        <div className="text-[10px] text-muted-foreground">{row.orderNumber}</div>
                      )}
                    </td>
                    <td className="p-2 text-multiline max-w-[200px]">{row.productName ?? "—"}</td>
                    <td className="p-2 font-mono">{row.productSapCode ?? "—"}</td>
                    <td className="p-2 font-mono">{row.pfNumber ?? "—"}</td>
                    <td className="p-2 text-center tabular-nums">
                      {row.shiftNorm?.toLocaleString("ru-RU") ?? "—"}
                    </td>
                    <td className="p-2 text-center tabular-nums font-medium">
                      {row.targetQuantity.toLocaleString("ru-RU")}
                    </td>
                    <td className="p-2 text-center tabular-nums">
                      {row.remainderQuantity.toLocaleString("ru-RU")}
                    </td>
                    <td className="p-2 text-center tabular-nums text-green-700 dark:text-green-400">
                      {row.completedQuantity.toLocaleString("ru-RU")}
                    </td>
                    <td className="p-2 text-center tabular-nums">
                      {formatShifts(row.shiftsToComplete)}
                    </td>
                    <td className="p-2 text-center tabular-nums">{row.percentComplete}</td>
                    {dates.map((date) => {
                      const cell = row.cells[date] ?? emptyCell();
                      const hasPending = shiftSlots.some(
                        (slot) => pending[cellKey(row.key, date, slot.code)] != null
                      );
                      return (
                        <td
                          key={date}
                          className={cn(
                            "p-1 border-l border-border/30 align-top min-w-[72px]",
                            hasPending && "bg-amber-50/80 dark:bg-amber-950/20"
                          )}
                        >
                          {cell.fact > 0 && (
                            <div className="mb-1 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-center text-xs font-semibold tabular-nums py-0.5">
                              +{cell.fact.toLocaleString("ru-RU")}
                            </div>
                          )}
                          {canEdit ? (
                            <div className="space-y-1">
                              {shiftSlots.map((slot, slotIdx) => (
                                <Input
                                  key={slot.code}
                                  type="number"
                                  min={0}
                                  title={`${slot.name} — план, шт`}
                                  className={cn(
                                    "h-8 text-center text-xs px-1",
                                    slotIdx % 2 === 1 && "bg-muted/30",
                                    pending[cellKey(row.key, date, slot.code)] != null &&
                                      "ring-1 ring-amber-400"
                                  )}
                                  value={getShiftValue(row, date, slot.code)}
                                  onChange={(e) =>
                                    handleShiftChange(row, date, slot.code, e.target.value)
                                  }
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-1 tabular-nums text-xs">
                              {shiftSlots.map((slot, slotIdx) => (
                                <div
                                  key={slot.code}
                                  className={slotIdx % 2 === 1 ? "text-muted-foreground" : ""}
                                >
                                  {(row.cells[date] ?? emptyCell()).shifts[slot.code] || "—"}
                                </div>
                              ))}
                            </div>
                          )}
                          {canEdit && row.orderId ? (
                            <Button
                              type="button"
                              variant={cell.fact > 0 ? "secondary" : "outline"}
                              size="sm"
                              className="w-full h-7 mt-1 text-xs"
                              onClick={() => openFactDialog(row, date)}
                            >
                              <ClipboardList className="h-3.5 w-3.5 mr-1" />
                              Выпуск
                            </Button>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить строку в план</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Оборудование (линия)</Label>
              <Select
                value={addForm.equipmentId}
                onValueChange={(v) => setAddForm({ ...addForm, equipmentId: v })}
              >
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  {equipment.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Заказ</Label>
              <Select
                value={addForm.orderId}
                onValueChange={(v) => setAddForm({ ...addForm, orderId: v })}
              >
                <SelectTrigger><SelectValue placeholder="Выберите заказ" /></SelectTrigger>
                <SelectContent>
                  {orders
                    .filter((o) => !["completed", "cancelled"].includes(o.status))
                    .map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.orderNumber}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button>
            <Button
              onClick={handleAddRow}
              disabled={!addForm.equipmentId || !addForm.orderId}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={factOpen} onOpenChange={setFactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Факт смены</DialogTitle>
          </DialogHeader>
          {factContext && (
            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground">
                {factContext.row.equipmentName} · {factContext.row.productSapCode} ·{" "}
                {format(new Date(factContext.date), "d MMM yyyy", { locale: ru })}
                {factContext.row.pfNumber && (
                  <> · ПФ {factContext.row.pfNumber}</>
                )}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Выпущено, шт</Label>
                  <Input
                    type="number"
                    min={0}
                    value={factForm.producedQuantity}
                    onChange={(e) =>
                      setFactForm({ ...factForm, producedQuantity: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Брак, шт</Label>
                  <Input
                    type="number"
                    min={0}
                    value={factForm.defectiveQuantity}
                    onChange={(e) =>
                      setFactForm({ ...factForm, defectiveQuantity: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Простой, мин</Label>
                  <Input
                    type="number"
                    min={0}
                    value={factForm.downtimeMinutes}
                    onChange={(e) =>
                      setFactForm({ ...factForm, downtimeMinutes: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Причина простоя</Label>
                <Input
                  value={factForm.downtimeReason}
                  onChange={(e) =>
                    setFactForm({ ...factForm, downtimeReason: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Комментарий</Label>
                <Textarea
                  value={factForm.comment}
                  onChange={(e) =>
                    setFactForm({ ...factForm, comment: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFactOpen(false)}>Отмена</Button>
            <Button
              onClick={handleSaveFact}
              disabled={!factForm.producedQuantity || createFact.isPending}
            >
              Сохранить факт
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
