import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  useProductionOrders,
  useProductionSchedule,
  useProductionMutations,
  useProductEquipment,
} from "@/hooks/use-production-planning";
import { apiRequest } from "@/lib/queryClient";

type Props = {
  subdivisionId: number;
};

export function PlanningFactsTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");

  const { data: orders = [] } = useProductionOrders({ subdivisionId });
  const { data: schedule = [] } = useProductionSchedule({ subdivisionId });
  const { allEquipment } = useEquipmentApi();
  const { createFact } = useProductionMutations();

  const [form, setForm] = useState({
    orderId: "",
    scheduleId: "",
    equipmentId: "",
    reportDate: new Date().toISOString().slice(0, 10),
    producedQuantity: "",
    defectiveQuantity: "0",
    downtimeMinutes: "0",
    downtimeReason: "",
    comment: "",
    factType: "ad_hoc",
  });

  const selectedOrderId = form.orderId ? Number(form.orderId) : null;
  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const { data: eqLinks = [] } = useProductEquipment(
    selectedOrder?.productId ?? null,
    subdivisionId
  );

  useEffect(() => {
    if (!form.orderId || eqLinks.length === 0) return;
    const preferred =
      eqLinks.find((l) => l.equipmentId === form.equipmentId) ?? eqLinks[0];
    if (preferred && form.equipmentId !== preferred.equipmentId) {
      setForm((f) => ({ ...f, equipmentId: preferred.equipmentId }));
    }
  }, [form.orderId, eqLinks, form.equipmentId]);

  const [remaining, setRemaining] = useState<{
    remainingQuantity: number;
    percentComplete: number;
  } | null>(null);

  const loadRemaining = async (orderId: number) => {
    try {
      const res = await apiRequest("GET", `/api/production/orders/${orderId}/remaining`);
      const data = await res.json();
      setRemaining({
        remainingQuantity: data.remainingQuantity,
        percentComplete: data.percentComplete,
      });
    } catch {
      setRemaining(null);
    }
  };

  const handleSubmit = async () => {
    try {
      const result = await createFact.mutateAsync({
        subdivisionId,
        orderId: Number(form.orderId),
        scheduleId: form.scheduleId ? Number(form.scheduleId) : undefined,
        factType: form.scheduleId ? "scheduled" : "ad_hoc",
        equipmentId: form.equipmentId,
        reportDate: form.reportDate,
        producedQuantity: Number(form.producedQuantity),
        defectiveQuantity: Number(form.defectiveQuantity),
        downtimeMinutes: Number(form.downtimeMinutes),
        downtimeReason: form.downtimeReason || undefined,
        comment: form.comment || undefined,
      });
      toast({
        title: "Факт сохранён",
        description: result.materialWriteoff?.deferred
          ? "Списание материалов выполняется в фоне"
          : "Списание материалов выполнено",
      });
      if (form.orderId) await loadRemaining(Number(form.orderId));
      setForm((f) => ({
        ...f,
        producedQuantity: "",
        defectiveQuantity: "0",
        downtimeMinutes: "0",
        downtimeReason: "",
        comment: "",
      }));
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  const equipment = allEquipment.filter(
    (e) => e.subdivisionId === subdivisionId || e.homeSubdivisionId === subdivisionId
  );

  return (
    <div className="max-w-xl space-y-4">
      {!canEdit && (
        <p className="text-sm text-muted-foreground">Нет прав на ввод факта</p>
      )}

      <div className="space-y-3">
        <div>
          <Label>Заказ</Label>
          <Select
            value={form.orderId}
            onValueChange={(v) => {
              setForm((f) => ({ ...f, orderId: v }));
              loadRemaining(Number(v));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите заказ" />
            </SelectTrigger>
            <SelectContent>
              {orders.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.orderNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {remaining && (
            <p className="text-xs text-muted-foreground mt-1">
              Остаток заказа: {remaining.remainingQuantity} ({remaining.percentComplete}% выполнено)
            </p>
          )}
        </div>

        <div>
          <Label>Слот графика (опционально)</Label>
          <Select
            value={form.scheduleId || "none"}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                scheduleId: v === "none" ? "" : v,
                factType: v === "none" ? "ad_hoc" : "scheduled",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Без слота" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Вне плана (ad hoc)</SelectItem>
              {schedule
                .filter((s) => s.status !== "cancelled")
                .map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    #{s.orderId} · {s.equipmentId}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Оборудование</Label>
          <Select
            value={form.equipmentId}
            onValueChange={(v) => setForm((f) => ({ ...f, equipmentId: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Станок" />
            </SelectTrigger>
            <SelectContent>
              {equipment.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Дата отчёта</Label>
          <Input
            type="date"
            value={form.reportDate}
            onChange={(e) => setForm((f) => ({ ...f, reportDate: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Выпуск, шт</Label>
            <Input
              type="number"
              value={form.producedQuantity}
              onChange={(e) => setForm((f) => ({ ...f, producedQuantity: e.target.value }))}
            />
          </div>
          <div>
            <Label>Брак, шт</Label>
            <Input
              type="number"
              value={form.defectiveQuantity}
              onChange={(e) => setForm((f) => ({ ...f, defectiveQuantity: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Простой, мин</Label>
            <Input
              type="number"
              value={form.downtimeMinutes}
              onChange={(e) => setForm((f) => ({ ...f, downtimeMinutes: e.target.value }))}
            />
          </div>
          <div>
            <Label>Причина простоя</Label>
            <Input
              value={form.downtimeReason}
              onChange={(e) => setForm((f) => ({ ...f, downtimeReason: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label>Комментарий</Label>
          <Textarea
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          />
        </div>

        {canEdit && (
          <Button
            onClick={handleSubmit}
            disabled={
              !form.orderId ||
              !form.equipmentId ||
              !form.producedQuantity ||
              createFact.isPending
            }
          >
            Сохранить факт
          </Button>
        )}
      </div>
    </div>
  );
}
