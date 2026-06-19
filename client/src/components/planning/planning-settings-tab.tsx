import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAccessControl } from "@/hooks/use-access-control";
import { useProductionDisplayConfig } from "@/hooks/use-production-display-config";
import {
  PRODUCTION_SCHEDULE_STATUS_CODES,
  PRODUCTION_SCHEDULE_STATUS_LABELS,
  type ProductionDisplayConfig,
} from "@shared/production-display-config";
import { useToast } from "@/hooks/use-toast";
import { Settings2 } from "lucide-react";
import { PlanningShiftSettings } from "@/components/planning/planning-shift-settings";
import { ProductCatalogSettingsPanel } from "@/components/planning/product-catalog-settings-panel";

const WRITEOFF_MODE_LABELS: Record<string, string> = {
  sync: "Синхронно с фактом выпуска",
  async: "Асинхронно (фоновая обработка)",
  manual: "Вручную",
};

type Props = {
  subdivisionId: number;
  subdivisionName?: string;
};

function toggleStatus(
  current: ProductionDisplayConfig["timeline"]["slotStatuses"],
  status: string
) {
  return current.includes(status as ProductionDisplayConfig["timeline"]["slotStatuses"][number])
    ? current.filter((s) => s !== status)
    : [...current, status as ProductionDisplayConfig["timeline"]["slotStatuses"][number]];
}

export function PlanningSettingsTab({ subdivisionId, subdivisionName }: Props) {
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
    serverSettings,
  } = useProductionDisplayConfig(subdivisionId);

  const [writeoffMode, setWriteoffMode] = useState("sync");

  useEffect(() => {
    if (serverSettings?.materialWriteoffMode) {
      setWriteoffMode(serverSettings.materialWriteoffMode);
    }
  }, [serverSettings?.materialWriteoffMode]);

  const handleSave = async () => {
    if (!canEdit) return;
    try {
      await saveToServer.mutateAsync({
        displayConfig: config,
        materialWriteoffMode: writeoffMode,
      });
      toast({ title: "Настройки подразделения сохранены" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка настроек…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Настройки планирования
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Отображение в календаре ТО, на графике и в карточке оборудования
            {subdivisionName ? ` · ${subdivisionName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {localOverridesActive && (
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              Локальные изменения
            </Badge>
          )}
          {localOverridesActive && (
            <Button size="sm" variant="ghost" onClick={resetLocalOverrides}>
              Сбросить локально
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={saveToServer.isPending}>
              Сохранить для подразделения
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Календарь «План ТО»</CardTitle>
            <CardDescription>
              Как производственные слоты отображаются в календаре ТО и задач
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
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
              <Label className="text-xs">Максимум событий в день ячейки</Label>
              <Input
                type="number"
                min={1}
                max={30}
                className="h-9 mt-1 max-w-[120px]"
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
            <div>
              <Label className="text-xs mb-2 block">Статусы слотов в календаре</Label>
              <div className="space-y-1.5">
                {PRODUCTION_SCHEDULE_STATUS_CODES.map((status) => (
                  <label key={status} className="flex items-center gap-2">
                    <Checkbox
                      checked={config.calendar.slotStatuses.includes(status)}
                      onCheckedChange={() =>
                        applyLocalOverrides({
                          calendar: {
                            ...config.calendar,
                            slotStatuses: toggleStatus(config.calendar.slotStatuses, status),
                          },
                        })
                      }
                    />
                    {PRODUCTION_SCHEDULE_STATUS_LABELS[status] ?? status}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">График планирования</CardTitle>
            <CardDescription>
              Таймлайн на вкладке «График планирования» (режим «Таймлайн»)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={config.timeline.showMaintenanceOverlay}
                onCheckedChange={(v) =>
                  applyLocalOverrides({
                    timeline: { ...config.timeline, showMaintenanceOverlay: Boolean(v) },
                  })
                }
              />
              Overlay планового ТО
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
              Overlay ремонтов и заявок
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Длительность блока ТО, ч</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  className="h-9 mt-1"
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
                <Label className="text-xs">Длительность блока ремонта, ч</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  className="h-9 mt-1"
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
            <div>
              <Label className="text-xs mb-2 block">Статусы слотов на графике</Label>
              <div className="space-y-1.5">
                {PRODUCTION_SCHEDULE_STATUS_CODES.map((status) => (
                  <label key={status} className="flex items-center gap-2">
                    <Checkbox
                      checked={config.timeline.slotStatuses.includes(status)}
                      onCheckedChange={() =>
                        applyLocalOverrides({
                          timeline: {
                            ...config.timeline,
                            slotStatuses: toggleStatus(config.timeline.slotStatuses, status),
                          },
                        })
                      }
                    />
                    {PRODUCTION_SCHEDULE_STATUS_LABELS[status] ?? status}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Карточка оборудования</CardTitle>
            <CardDescription>
              Блок «Производственный план» в карточке оборудования
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <Label className="text-xs">Горизонт планирования, дней</Label>
              <Input
                type="number"
                min={7}
                max={180}
                className="h-9 mt-1 max-w-[120px]"
                value={config.equipmentCard.horizonDays}
                onChange={(e) =>
                  applyLocalOverrides({
                    equipmentCard: {
                      ...config.equipmentCard,
                      horizonDays: Number(e.target.value) || 45,
                    },
                  })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Сколько дней вперёд показывать слоты
              </p>
            </div>
            <div>
              <Label className="text-xs">Максимум слотов в списке</Label>
              <Input
                type="number"
                min={1}
                max={50}
                className="h-9 mt-1 max-w-[120px]"
                value={config.equipmentCard.maxSlots}
                onChange={(e) =>
                  applyLocalOverrides({
                    equipmentCard: {
                      ...config.equipmentCard,
                      maxSlots: Number(e.target.value) || 8,
                    },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Материалы и списание</CardTitle>
            <CardDescription>
              Поведение при регистрации факта выпуска
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <Label className="text-xs">Режим списания материалов</Label>
              <Select
                value={writeoffMode}
                onValueChange={setWriteoffMode}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WRITEOFF_MODE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!canEdit && (
              <p className="text-xs text-muted-foreground">
                Изменение режима списания доступно при праве редактирования планирования
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Справочник изделий</CardTitle>
            <CardDescription>
              Стандартные и свои поля на вкладке «Изделия». Сохраняйте шаблоны под тип продукции.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductCatalogSettingsPanel
              catalog={config.productCatalog}
              canEdit={canEdit}
              onChange={(productCatalog) => applyLocalOverrides({ productCatalog })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Вкладки планирования</CardTitle>
            <CardDescription>
              Скрыть ненужные разделы для сборки, электроники и др.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(
              [
                ["schedule", "График и заказы (план + потребности)"],
                ["warehouse", "Внутренний склад"],
                ["tooling", "Оснастка / ПФ"],
                ["products", "Изделия"],
                ["materials", "Материалы"],
                ["conflicts", "Конфликты"],
                ["analytics", "Аналитика"],
                ["oee", "OEE"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2">
                <Checkbox
                  checked={config.planningTabs[field]}
                  onCheckedChange={(v) =>
                    applyLocalOverrides({
                      planningTabs: {
                        ...config.planningTabs,
                        [field]: Boolean(v),
                      },
                    })
                  }
                />
                {label}
              </label>
            ))}
            <p className="text-xs text-muted-foreground pt-2">
              Вкладка «Настройки» всегда доступна.
            </p>
          </CardContent>
        </Card>
      </div>

      <PlanningShiftSettings subdivisionId={subdivisionId} canEdit={canEdit} />

      <p className="text-xs text-muted-foreground">
        Локальные настройки (без сохранения) действуют только в вашем браузере. Кнопка «Сохранить
        для подразделения» применяет настройки для всех пользователей этого подразделения.
      </p>
    </div>
  );
}
