import { useMemo } from "react";
import { startOfWeek, endOfWeek, eachDayOfInterval, format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Equipment } from "@shared/schema";
import type { ScheduleTimelineSlot, ToirOverlayBlock } from "./types";
import { SCHEDULE_CONFLICT_LABELS } from "@/lib/production-planning-constants";

type Props = {
  equipment: Equipment[];
  slots: ScheduleTimelineSlot[];
  toirOverlay: ToirOverlayBlock[];
  weekAnchor: Date;
  showUnavailableOverlay?: boolean;
  onSlotClick: (slot: ScheduleTimelineSlot) => void;
};

function slotColor(conflictStatus: string, status: string) {
  if (status === "cancelled") return "bg-muted text-muted-foreground border-muted";
  if (conflictStatus === "blocked") return "bg-red-500/90 text-white border-red-600";
  if (conflictStatus === "warning") return "bg-orange-500/90 text-white border-orange-600";
  return "bg-emerald-600/90 text-white border-emerald-700";
}

export function ScheduleTimeline({
  equipment,
  slots,
  toirOverlay,
  weekAnchor,
  showUnavailableOverlay = true,
  onSlotClick,
}: Props) {
  const rangeStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(weekAnchor, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  const positioned = useMemo(() => {
    return slots
      .filter((s) => s.status !== "cancelled")
      .map((slot) => {
        const start = new Date(slot.startTime).getTime();
        const end = new Date(slot.endTime).getTime();
        const left = ((start - rangeStart.getTime()) / totalMs) * 100;
        const width = ((end - start) / totalMs) * 100;
        return { slot, left: Math.max(0, left), width: Math.max(0.5, width) };
      });
  }, [slots, rangeStart, totalMs]);

  if (equipment.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Нет оборудования для отображения графика
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex border-b pb-2 text-xs text-muted-foreground">
        <div className="w-[min(280px,32%)] shrink-0 pr-3 font-medium text-foreground">
          Оборудование
        </div>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {days.map((d) => (
            <div key={d.toISOString()} className="text-center">
              {format(d, "EEE d MMM", { locale: ru })}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1 max-h-[520px] overflow-y-auto">
        {equipment.map((eq) => {
          const rowSlots = positioned.filter((p) => p.slot.equipmentId === eq.id);
          const rowOverlay = toirOverlay.filter((b) => b.equipmentId === eq.id);
          const unavailable =
            eq.status === "repair" ||
            eq.status === "maintenance" ||
            eq.repairSubdivisionId != null;

          return (
            <div key={eq.id} className="flex items-stretch min-h-[52px] border-b border-border/50">
              <div className="w-[min(280px,32%)] shrink-0 pr-3 py-1.5 text-sm" title={eq.name}>
                <span className="font-medium leading-snug whitespace-normal break-words line-clamp-3">
                  {eq.name}
                </span>
                {unavailable && (
                  <span className="block text-xs text-muted-foreground">недоступно</span>
                )}
              </div>
              <div className="relative flex-1 min-h-[52px] bg-muted/30 rounded-md overflow-hidden">
                {showUnavailableOverlay && unavailable && (
                  <div
                    className="absolute inset-0 bg-gray-400/25 pointer-events-none"
                    title="Оборудование недоступно"
                  />
                )}
                {rowOverlay.map((block) => {
                  const blockStart = new Date(block.startTime).getTime();
                  const blockEnd = new Date(block.endTime).getTime();
                  const left = ((blockStart - rangeStart.getTime()) / totalMs) * 100;
                  const width = ((blockEnd - blockStart) / totalMs) * 100;
                  if (left > 100 || left + width < 0) return null;
                  const isRepair = block.kind === "repair";
                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "absolute top-1 bottom-1 rounded border text-[10px] text-white px-1 truncate",
                        isRepair
                          ? "bg-rose-500/65 border-rose-600/50"
                          : "bg-gray-500/50 border-gray-600/40"
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={block.title}
                    >
                      {isRepair ? "Ремонт" : "ТО"}
                    </div>
                  );
                })}
                {rowSlots.map(({ slot, left, width }) => (
                  <button
                    key={slot.id}
                    type="button"
                    className={cn(
                      "absolute top-1 bottom-1 rounded border text-[10px] px-1 shadow-sm hover:opacity-90 text-left overflow-hidden",
                      slotColor(slot.conflictStatus, slot.status)
                    )}
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: width < 3 ? "2rem" : undefined }}
                    onClick={() => onSlotClick(slot)}
                    title={`${slot.orderNumber ?? `#${slot.orderId}`}${slot.productName ? ` · ${slot.productName}` : ""} · ${slot.plannedQuantity} шт`}
                  >
                    <span className="block truncate font-medium">
                      {slot.orderNumber ?? `#${slot.orderId}`}
                    </span>
                    {width >= 6 && slot.productName && (
                      <span className="block truncate opacity-90 text-[9px]">{slot.productName}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-2">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-600" /> Запланировано
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-500" /> Риск
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500" /> Конфликт
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-500/50" /> ТО
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-rose-500/65" /> Ремонт
        </span>
      </div>
    </div>
  );
}
