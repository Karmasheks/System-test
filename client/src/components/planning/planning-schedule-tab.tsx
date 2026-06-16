import { useMemo, useState } from "react";
import { startOfWeek, endOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/hooks/use-toast";
import { useAccessControl } from "@/hooks/use-access-control";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import {
  useProductionOrders,
  useProductionSchedule,
  useProductionMutations,
  useScheduleToirOverlay,
} from "@/hooks/use-production-planning";
import { useProductionDisplayConfig } from "@/hooks/use-production-display-config";
import { ProductionDisplaySettings } from "./production-display-settings";
import { PlanningCalendarGrid } from "./planning-calendar-grid";
import { ScheduleTimeline } from "./schedule-timeline";
import type { ScheduleTimelineSlot } from "./types";
import { SCHEDULE_CONFLICT_LABELS } from "@/lib/production-planning-constants";

type Props = {
  subdivisionId: number;
};

export function PlanningScheduleTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");
  const weekAnchor = startOfWeek(new Date(), { weekStartsOn: 1 });
  const from = weekAnchor.toISOString();
  const to = endOfWeek(weekAnchor, { weekStartsOn: 1 }).toISOString();

  const { allEquipment } = useEquipmentApi();
  const { data: orders = [] } = useProductionOrders({ subdivisionId });
  const { data: schedule = [] } = useProductionSchedule({
    subdivisionId,
    from,
    to,
  });
  const { data: toirOverlayRaw = [] } = useScheduleToirOverlay(subdivisionId, from, to);
  const { config: displayConfig } = useProductionDisplayConfig(subdivisionId);

  const toirOverlay = useMemo(() => {
    return toirOverlayRaw.filter((b) => {
      if (b.kind === "maintenance" && !displayConfig.timeline.showMaintenanceOverlay) return false;
      if (b.kind === "repair" && !displayConfig.timeline.showRepairOverlay) return false;
      return true;
    });
  }, [toirOverlayRaw, displayConfig.timeline]);

  const { assignSchedule, updateSchedule, cancelSchedule } = useProductionMutations();

  const equipment = useMemo(
    () =>
      allEquipment.filter(
        (e) =>
          e.status !== "decommissioned" &&
          (e.subdivisionId === subdivisionId || e.homeSubdivisionId === subdivisionId)
      ),
    [allEquipment, subdivisionId]
  );

  const slots: ScheduleTimelineSlot[] = schedule
    .filter((s) =>
      (displayConfig.timeline.slotStatuses as string[]).includes(s.status)
    )
    .map((s) => ({
    id: s.id,
    equipmentId: s.equipmentId,
    orderId: s.orderId,
    startTime: String(s.startTime),
    endTime: String(s.endTime),
    plannedQuantity: s.plannedQuantity,
    status: s.status,
    conflictStatus: s.conflictStatus,
    comment: s.comment,
  }));

  const [selected, setSelected] = useState<ScheduleTimelineSlot | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "timeline">("calendar");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    orderId: "",
    equipmentId: "",
    startTime: "",
    endTime: "",
    plannedQuantity: "0",
  });

  const [editForm, setEditForm] = useState({
    equipmentId: "",
    startTime: "",
    endTime: "",
    plannedQuantity: "0",
  });

  const openAssign = () => {
    setAssignForm({
      orderId: orders[0] ? String(orders[0].id) : "",
      equipmentId: equipment[0]?.id ?? "",
      startTime: "",
      endTime: "",
      plannedQuantity: "0",
    });
    setAssignOpen(true);
  };

  const handleAssign = async () => {
    try {
      await assignSchedule.mutateAsync({
        subdivisionId,
        orderId: Number(assignForm.orderId),
        equipmentId: assignForm.equipmentId,
        startTime: new Date(assignForm.startTime).toISOString(),
        endTime: new Date(assignForm.endTime).toISOString(),
        plannedQuantity: Number(assignForm.plannedQuantity),
        status: "planned",
      });
      toast({ title: "Слот добавлен в график" });
      setAssignOpen(false);
    } catch (e: unknown) {
      const conflicts = (e as { conflicts?: unknown }).conflicts;
      toast({
        title: "Не удалось назначить",
        description:
          conflicts
            ? "Конфликты планирования"
            : e instanceof Error
              ? e.message
              : "Ошибка",
        variant: "destructive",
      });
    }
  };

  const openEdit = (slot: ScheduleTimelineSlot) => {
    setSelected(slot);
    setEditForm({
      equipmentId: slot.equipmentId,
      startTime: slot.startTime.slice(0, 16),
      endTime: slot.endTime.slice(0, 16),
      plannedQuantity: String(slot.plannedQuantity),
    });
  };

  const handleUpdate = async () => {
    if (!selected) return;
    try {
      await updateSchedule.mutateAsync({
        id: selected.id,
        equipmentId: editForm.equipmentId,
        startTime: new Date(editForm.startTime).toISOString(),
        endTime: new Date(editForm.endTime).toISOString(),
        plannedQuantity: Number(editForm.plannedQuantity),
      });
      toast({ title: "График обновлён" });
      setSelected(null);
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Ошибка",
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    if (!selected) return;
    try {
      await cancelSchedule.mutateAsync(selected.id);
      toast({ title: "Планирование отменено" });
      setSelected(null);
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={viewMode === "calendar" ? "default" : "outline"}
            onClick={() => setViewMode("calendar")}
          >
            Календарь плана
          </Button>
          <Button
            size="sm"
            variant={viewMode === "timeline" ? "default" : "outline"}
            onClick={() => setViewMode("timeline")}
          >
            Таймлайн
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {canEdit && viewMode === "timeline" && (
          <Button size="sm" onClick={openAssign}>
            Назначить на оборудование
          </Button>
        )}
        <ProductionDisplaySettings subdivisionId={subdivisionId} context="timeline" />
        </div>
      </div>

      {viewMode === "calendar" ? (
        <PlanningCalendarGrid subdivisionId={subdivisionId} />
      ) : (
      <ScheduleTimeline
        equipment={equipment}
        slots={slots}
        toirOverlay={toirOverlay}
        weekAnchor={weekAnchor}
        showUnavailableOverlay={displayConfig.timeline.showUnavailableOverlay}
        onSlotClick={openEdit}
      />
      )}

      <Dialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Задание #{selected?.orderId}
              {selected && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {SCHEDULE_CONFLICT_LABELS[selected.conflictStatus]}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && canEdit && (
            <div className="space-y-3">
              <div>
                <Label>Оборудование</Label>
                <Select
                  value={editForm.equipmentId}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, equipmentId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Начало</Label>
                <Input
                  type="datetime-local"
                  value={editForm.startTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div>
                <Label>Завершение</Label>
                <Input
                  type="datetime-local"
                  value={editForm.endTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
              <div>
                <Label>План, шт</Label>
                <Input
                  type="number"
                  value={editForm.plannedQuantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, plannedQuantity: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {canEdit && selected && (
              <>
                <Button variant="destructive" onClick={handleCancel}>
                  Отменить план
                </Button>
                <Button onClick={handleUpdate}>Сохранить</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Назначить заказ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Заказ</Label>
              <Select
                value={assignForm.orderId}
                onValueChange={(v) => setAssignForm((f) => ({ ...f, orderId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Заказ" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.orderNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Оборудование</Label>
              <Select
                value={assignForm.equipmentId}
                onValueChange={(v) => setAssignForm((f) => ({ ...f, equipmentId: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Начало</Label>
              <Input
                type="datetime-local"
                value={assignForm.startTime}
                onChange={(e) => setAssignForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <Label>Завершение</Label>
              <Input
                type="datetime-local"
                value={assignForm.endTime}
                onChange={(e) => setAssignForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
            <div>
              <Label>План, шт</Label>
              <Input
                type="number"
                value={assignForm.plannedQuantity}
                onChange={(e) => setAssignForm((f) => ({ ...f, plannedQuantity: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAssign} disabled={assignSchedule.isPending}>
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
