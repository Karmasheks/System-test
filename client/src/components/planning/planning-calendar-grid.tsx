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
  useProductionMutations,
  type DailyPlanGridResponse,
  type DailyPlanCellValue,
} from "@/hooks/use-production-planning";
import { ChevronLeft, ChevronRight, Plus, Save } from "lucide-react";

type Props = {
  subdivisionId: number;
};

type PendingKey = string;

function cellKey(rowKey: string, date: string, shift: "1" | "2"): PendingKey {
  return `${rowKey}::${date}::${shift}`;
}

function emptyCell(): DailyPlanCellValue {
  return { shift1: 0, shift2: 0, fact: 0 };
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
  const { bulkUpsertDailyPlan } = useProductionMutations();

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

  const dates = grid?.dates ?? [];
  const rows = grid?.rows ?? [];

  const getShiftValue = (
    row: DailyPlanGridResponse["rows"][0],
    date: string,
    shift: "1" | "2"
  ) => {
    const key = cellKey(row.key, date, shift);
    if (pending[key] != null) return pending[key];
    const cell = row.cells[date] ?? emptyCell();
    return shift === "1" ? cell.shift1 : cell.shift2;
  };

  const handleShiftChange = (
    row: DailyPlanGridResponse["rows"][0],
    date: string,
    shift: "1" | "2",
    raw: string
  ) => {
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0) return;
    setPending((prev) => ({ ...prev, [cellKey(row.key, date, shift)]: value }));
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
              <Button onClick={handleSave} disabled={bulkUpsertDailyPlan.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Сохранить план
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        План по сменам: в ячейке дня — смена 1 (верх) и смена 2 (низ). Факт выпуска отображается
        под планом (из вкладки «Факт выпуска»).
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка календаря…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-2 text-left sticky left-0 bg-muted/50 z-20 min-w-[160px]">
                  Линия / оборудование
                </th>
                <th className="p-2 text-left min-w-[180px]">Изделие</th>
                <th className="p-2 text-left min-w-[72px]">SAP</th>
                <th className="p-2 text-left min-w-[64px]">№ ПФ</th>
                <th className="p-2 text-center min-w-[72px]">Норма 11ч</th>
                <th className="p-2 text-center min-w-[72px]">План, шт</th>
                <th className="p-2 text-center min-w-[72px]">Остаток</th>
                <th className="p-2 text-center min-w-[72px]">Факт</th>
                <th className="p-2 text-center min-w-[56px]">Смен</th>
                <th className="p-2 text-center min-w-[48px]">%</th>
                {dates.map((d) => (
                  <th
                    key={d}
                    className="p-1 text-center min-w-[56px] whitespace-nowrap border-l border-border/40"
                  >
                    <div>{format(new Date(d), "d", { locale: ru })}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(d), "EEE", { locale: ru })}
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
                      return (
                        <td
                          key={date}
                          className="p-0.5 border-l border-border/30 align-top"
                        >
                          {canEdit ? (
                            <div className="space-y-0.5">
                              <Input
                                type="number"
                                min={0}
                                title="Смена 1"
                                className="h-7 text-center text-[10px] px-0.5"
                                value={getShiftValue(row, date, "1")}
                                onChange={(e) =>
                                  handleShiftChange(row, date, "1", e.target.value)
                                }
                              />
                              <Input
                                type="number"
                                min={0}
                                title="Смена 2"
                                className="h-7 text-center text-[10px] px-0.5 bg-muted/30"
                                value={getShiftValue(row, date, "2")}
                                onChange={(e) =>
                                  handleShiftChange(row, date, "2", e.target.value)
                                }
                              />
                            </div>
                          ) : (
                            <div className="text-center py-1 tabular-nums">
                              <div>{cell.shift1 || ""}</div>
                              <div className="text-muted-foreground">{cell.shift2 || ""}</div>
                            </div>
                          )}
                          {cell.fact > 0 && (
                            <div className="text-[10px] text-center text-green-700 dark:text-green-400 tabular-nums">
                              ф {cell.fact}
                            </div>
                          )}
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
    </div>
  );
}
