import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useAccessControl } from "@/hooks/use-access-control";
import { useProductionDisplayConfig } from "@/hooks/use-production-display-config";
import {
  PRODUCTION_SCHEDULE_STATUS_CODES,
  PRODUCTION_SCHEDULE_STATUS_LABELS,
  type ProductionDisplayConfig,
} from "@shared/production-display-config";
import { SlidersHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Props = {
  subdivisionId: number | null;
  context?: "calendar" | "timeline" | "all";
};

function toggleStatus(
  current: ProductionDisplayConfig["timeline"]["slotStatuses"],
  status: string
) {
  return current.includes(status as ProductionDisplayConfig["timeline"]["slotStatuses"][number])
    ? current.filter((s) => s !== status)
    : [...current, status as ProductionDisplayConfig["timeline"]["slotStatuses"][number]];
}

export function ProductionDisplaySettings({ subdivisionId, context = "all" }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");
  const {
    config,
    applyLocalOverrides,
    resetLocalOverrides,
    saveToServer,
    localOverridesActive,
    isLoading,
  } = useProductionDisplayConfig(subdivisionId);

  if (subdivisionId == null) return null;

  const showCalendar = context === "all" || context === "calendar";
  const showTimeline = context === "all" || context === "timeline";

  const handleSaveServer = async () => {
    try {
      await saveToServer.mutateAsync({ displayConfig: config });
      toast({ title: "Настройки сохранены для подразделения" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={isLoading}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Отображение
          {localOverridesActive && (
            <span className="text-xs text-orange-600 dark:text-orange-400">•</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[min(80vh,520px)] overflow-y-auto" align="end">
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Настройки отображения</p>
            <p className="text-xs text-muted-foreground mt-1">
              Локальные изменения применяются сразу. Сохранение в подразделение — для всех пользователей.
            </p>
          </div>

          {showCalendar && (
            <div className="space-y-2">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                Календарь ТО
              </p>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.calendar.showProduction}
                  onCheckedChange={(v) =>
                    applyLocalOverrides({
                      calendar: { ...config.calendar, showProduction: Boolean(v) },
                    })
                  }
                />
                Показывать производственные слоты
              </label>
              <div>
                <Label className="text-xs">Макс. событий в день</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  className="h-8 mt-1"
                  value={config.calendar.maxEventsPerDay}
                  onChange={(e) =>
                    applyLocalOverrides({
                      calendar: {
                        ...config.calendar,
                        maxEventsPerDay: Number(e.target.value) || 8,
                      },
                    })
                  }
                />
              </div>
            </div>
          )}

          {showTimeline && (
            <div className="space-y-2">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                График планирования
              </p>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.timeline.showMaintenanceOverlay}
                  onCheckedChange={(v) =>
                    applyLocalOverrides({
                      timeline: { ...config.timeline, showMaintenanceOverlay: Boolean(v) },
                    })
                  }
                />
                Overlay ТО
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.timeline.showRepairOverlay}
                  onCheckedChange={(v) =>
                    applyLocalOverrides({
                      timeline: { ...config.timeline, showRepairOverlay: Boolean(v) },
                    })
                  }
                />
                Overlay ремонтов
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.timeline.showUnavailableOverlay}
                  onCheckedChange={(v) =>
                    applyLocalOverrides({
                      timeline: { ...config.timeline, showUnavailableOverlay: Boolean(v) },
                    })
                  }
                />
                Затемнение недоступного оборудования
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">ТО, ч</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.5}
                    className="h-8 mt-1"
                    value={config.timeline.maintenanceDefaultHours}
                    onChange={(e) =>
                      applyLocalOverrides({
                        timeline: {
                          ...config.timeline,
                          maintenanceDefaultHours: Number(e.target.value) || 4,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Ремонт, ч</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.5}
                    className="h-8 mt-1"
                    value={config.timeline.repairDefaultHours}
                    onChange={(e) =>
                      applyLocalOverrides({
                        timeline: {
                          ...config.timeline,
                          repairDefaultHours: Number(e.target.value) || 4,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
              Статусы слотов
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {PRODUCTION_SCHEDULE_STATUS_CODES.map((status) => {
                const inCalendar = config.calendar.slotStatuses.includes(status);
                const inTimeline = config.timeline.slotStatuses.includes(status);
                const checked =
                  showCalendar && showTimeline
                    ? inCalendar && inTimeline
                    : showCalendar
                      ? inCalendar
                      : inTimeline;
                return (
                  <label key={status} className="flex items-center gap-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        const patch: Partial<ProductionDisplayConfig> = {};
                        if (showCalendar) {
                          patch.calendar = {
                            ...config.calendar,
                            slotStatuses: toggleStatus(config.calendar.slotStatuses, status),
                          };
                        }
                        if (showTimeline) {
                          patch.timeline = {
                            ...config.timeline,
                            slotStatuses: toggleStatus(config.timeline.slotStatuses, status),
                          };
                        }
                        applyLocalOverrides(patch);
                      }}
                    />
                    {PRODUCTION_SCHEDULE_STATUS_LABELS[status] ?? status}
                  </label>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            {localOverridesActive && (
              <Button size="sm" variant="ghost" onClick={resetLocalOverrides}>
                Сбросить локально
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                onClick={handleSaveServer}
                disabled={saveToServer.isPending}
              >
                Сохранить в подразделение
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
