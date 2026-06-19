import { useMemo, useState } from "react";
import { addWeeks, startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import {
  useProductionOrders,
  useProductionProducts,
  useProductionSchedule,
  useScheduleToirOverlay,
} from "@/hooks/use-production-planning";
import { useProductionDisplayConfig } from "@/hooks/use-production-display-config";
import { ProductionDisplaySettings } from "./production-display-settings";
import { PlanningCalendarGrid } from "./planning-calendar-grid";
import { PlanningOrdersTab } from "./planning-orders-tab";
import { ScheduleTimeline } from "./schedule-timeline";
import type { ScheduleTimelineSlot } from "./types";

type Props = {
  subdivisionId: number;
};

export function PlanningScheduleTab({ subdivisionId }: Props) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [timelineOpen, setTimelineOpen] = useState(false);

  const from = weekAnchor.toISOString();
  const to = endOfWeek(weekAnchor, { weekStartsOn: 1 }).toISOString();

  const { allEquipment } = useEquipmentApi();
  const { data: orders = [] } = useProductionOrders({ subdivisionId });
  const { data: products = [] } = useProductionProducts({ subdivisionId, activeOnly: true });
  const { data: schedule = [] } = useProductionSchedule({ subdivisionId, from, to });
  const { data: toirOverlayRaw = [] } = useScheduleToirOverlay(subdivisionId, from, to);
  const { config: displayConfig } = useProductionDisplayConfig(subdivisionId);

  const toirOverlay = useMemo(() => {
    return toirOverlayRaw.filter((b) => {
      if (b.kind === "maintenance" && !displayConfig.timeline.showMaintenanceOverlay) return false;
      if (b.kind === "repair" && !displayConfig.timeline.showRepairOverlay) return false;
      return true;
    });
  }, [toirOverlayRaw, displayConfig.timeline]);

  const equipment = useMemo(() => {
    const scoped = allEquipment.filter(
      (e) =>
        e.status !== "decommissioned" &&
        (e.subdivisionId === subdivisionId || e.homeSubdivisionId === subdivisionId)
    );
    const ids = new Set(scoped.map((e) => e.id));
    for (const s of schedule) {
      if (!ids.has(s.equipmentId)) {
        const eq = allEquipment.find((e) => e.id === s.equipmentId);
        if (eq) scoped.push(eq);
      }
    }
    return scoped;
  }, [allEquipment, subdivisionId, schedule]);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const slots: ScheduleTimelineSlot[] = schedule
    .filter((s) => (displayConfig.timeline.slotStatuses as string[]).includes(s.status))
    .map((s) => {
      const order = orderById.get(s.orderId);
      const product = order ? productById.get(order.productId) : undefined;
      return {
        id: s.id,
        equipmentId: s.equipmentId,
        orderId: s.orderId,
        orderNumber: order?.orderNumber,
        productName: product?.name,
        startTime: String(s.startTime),
        endTime: String(s.endTime),
        plannedQuantity: s.plannedQuantity,
        status: s.status,
        conflictStatus: s.conflictStatus,
        comment: s.comment,
      };
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Потребности и заказы</CardTitle>
          <CardDescription>
            Создайте потребность — затем заполните план по сменам в календаре ниже. Статус меняется
            в списке.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanningOrdersTab subdivisionId={subdivisionId} embedded />
        </CardContent>
      </Card>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-semibold">Календарь плана</h3>
            <p className="text-sm text-muted-foreground">
              План по сменам и выпуск за день — всё в одной таблице. Отдельная вкладка «Факт
              выпуска» не нужна.
            </p>
          </div>
          <ProductionDisplaySettings subdivisionId={subdivisionId} context="calendar" />
        </div>
        <PlanningCalendarGrid subdivisionId={subdivisionId} />
      </div>

      <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between">
            <span>Расширенный таймлайн (по часам)</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${timelineOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Дополнительный вид по точному времени. Основная работа — в календаре смен выше.
          </p>
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekAnchor((w) => subWeeks(w, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[160px] text-center">
                {format(weekAnchor, "d MMM", { locale: ru })} —{" "}
                {format(endOfWeek(weekAnchor, { weekStartsOn: 1 }), "d MMM yyyy", { locale: ru })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekAnchor((w) => addWeeks(w, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWeekAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                Сегодня
              </Button>
            </div>
            <ProductionDisplaySettings subdivisionId={subdivisionId} context="timeline" />
          </div>
          <ScheduleTimeline
            equipment={equipment}
            slots={slots}
            toirOverlay={toirOverlay}
            weekAnchor={weekAnchor}
            showUnavailableOverlay={displayConfig.timeline.showUnavailableOverlay}
            onSlotClick={() => {}}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
