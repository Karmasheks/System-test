import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEquipmentProductionSummary } from "@/hooks/use-production-planning";
import { SCHEDULE_CONFLICT_LABELS } from "@/lib/production-planning-constants";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ExternalLink, Factory } from "lucide-react";

type Props = {
  equipmentId: string;
};

export function EquipmentProductionPlanPanel({ equipmentId }: Props) {
  const { data, isLoading, isError } = useEquipmentProductionSummary(equipmentId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Производственный план
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Загрузка…</CardContent>
      </Card>
    );
  }

  if (isError || !data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Производственный план
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8" asChild>
            <Link href="/planning">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Планирование
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">Доступность:</span>
          {data.availableForPlanning ? (
            <Badge variant="outline" className="border-emerald-500 text-emerald-700">
              Доступно
            </Badge>
          ) : (
            <Badge variant="destructive">Недоступно для планирования</Badge>
          )}
        </div>

        {!data.availableForPlanning && data.unavailableReasons.length > 0 && (
          <ul className="text-muted-foreground space-y-1 list-disc pl-4">
            {data.unavailableReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        {data.schedule.length > 0 ? (
          <div className="space-y-2">
            <p className="font-medium text-foreground">Ближайшие слоты</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {data.schedule.slice(0, 8).map((slot) => (
                <div
                  key={slot.id}
                  className="flex flex-col gap-0.5 border-b border-border/50 pb-2 last:border-0"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{slot.orderNumber}</span>
                    <span className="text-muted-foreground shrink-0">
                      {SCHEDULE_CONFLICT_LABELS[slot.conflictStatus] ?? slot.conflictStatus}
                    </span>
                  </div>
                  <span className="text-muted-foreground">{slot.productName}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(slot.startTime), "d MMM HH:mm", { locale: ru })} —{" "}
                    {format(new Date(slot.endTime), "HH:mm", { locale: ru })}
                    · {slot.plannedQuantity} шт
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Нет запланированных производственных слотов</p>
        )}

        {data.openConflicts.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium">Активные конфликты ({data.openConflicts.length})</p>
            {data.openConflicts.slice(0, 3).map((c) => (
              <p key={c.id} className="text-xs text-muted-foreground">{c.message}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
