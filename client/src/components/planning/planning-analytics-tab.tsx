import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ProductionAnalytics } from "@/hooks/use-production-planning";

import { PRODUCTION_ORDER_STATUS_LABELS } from "@/lib/production-planning-constants";



type Props = {

  analytics: ProductionAnalytics | undefined;

};



export function PlanningAnalyticsTab({ analytics }: Props) {

  const planFact = analytics?.planFact ?? [];

  const equipmentLoad = analytics?.equipmentLoad ?? [];

  const downtimes = analytics?.downtimes ?? [];

  const atRisk = analytics?.atRiskOrders ?? [];

  const maintenance = analytics?.maintenanceImpact ?? [];

  const toirSummary = analytics?.toirSummary;

  const toirOverlay = analytics?.toirOverlay ?? [];



  const downtimeByReason = downtimes.reduce<Record<string, number>>((acc, d) => {

    const key = d.reasonType ?? "other";

    acc[key] = (acc[key] ?? 0) + d.durationMinutes;

    return acc;

  }, {});



  const totalPlanned = planFact.reduce((s, r) => s + r.planned, 0);

  const totalFact = planFact.reduce((s, r) => s + r.fact, 0);

  const oeePrep = {

    availabilityNote: toirSummary

      ? `Доступность (оценка): ${toirSummary.availabilityPercent ?? "—"}% с учётом ТОиР overlay`

      : "Доступность: учёт простоев и ТО (подготовка к OEE)",

    performanceNote: `Выполнение плана: ${totalPlanned > 0 ? Math.round((totalFact / totalPlanned) * 100) : 0}%`,

    qualityNote: `Брак: ${analytics?.summary.totalDefective ?? 0} из ${analytics?.summary.totalProduced ?? 0} выпущенных`,

  };



  const repairOverlay = toirOverlay.filter((b) => b.kind === "repair");

  return (

    <div className="grid gap-4 lg:grid-cols-2">

      <Card>

        <CardHeader>

          <CardTitle className="text-base">План / факт</CardTitle>

        </CardHeader>

        <CardContent className="text-sm space-y-1 max-h-64 overflow-y-auto">

          {planFact.map((r) => (

            <div key={r.orderId} className="flex justify-between border-b border-border/40 py-1">

              <span>{r.orderNumber}</span>

              <span>{r.fact} / {r.planned}</span>

            </div>

          ))}

        </CardContent>

      </Card>



      <Card>

        <CardHeader>

          <CardTitle className="text-base">Загрузка оборудования</CardTitle>

        </CardHeader>

        <CardContent className="text-sm space-y-1 max-h-64 overflow-y-auto">

          {equipmentLoad.map((e) => (

            <div key={e.equipmentId} className="flex justify-between border-b border-border/40 py-1">

              <span>{e.equipmentId}</span>

              <span>{Math.round(e.plannedMinutes)} мин · {e.slotCount} слотов</span>

            </div>

          ))}

        </CardContent>

      </Card>



      <Card>

        <CardHeader>

          <CardTitle className="text-base">Простои по причинам (мин)</CardTitle>

        </CardHeader>

        <CardContent className="text-sm space-y-1">

          {Object.entries(downtimeByReason).map(([k, v]) => (

            <p key={k}>{k}: {v}</p>

          ))}

          {Object.keys(downtimeByReason).length === 0 && (

            <p className="text-muted-foreground">Нет данных</p>

          )}

        </CardContent>

      </Card>



      <Card>

        <CardHeader>

          <CardTitle className="text-base">Просроченные заказы</CardTitle>

        </CardHeader>

        <CardContent className="text-sm space-y-1">

          {atRisk.map((o) => (

            <p key={o.id}>

              {o.orderNumber} — {PRODUCTION_ORDER_STATUS_LABELS[o.status] ?? o.status}

            </p>

          ))}

          {atRisk.length === 0 && <p className="text-muted-foreground">Нет</p>}

        </CardContent>

      </Card>



      <Card>

        <CardHeader>

          <CardTitle className="text-base">Влияние ТОиР на план</CardTitle>

        </CardHeader>

        <CardContent className="text-sm space-y-2">

          {toirSummary ? (

            <>

              <p>ТО (overlay): {toirSummary.maintenanceOverlayMinutes} мин</p>

              <p>Ремонты (overlay): {toirSummary.repairOverlayMinutes} мин</p>

              <p>Простои ТОиР: {toirSummary.downtimeMinutesToir} мин</p>

              <p>Слотов с конфликтом: {toirSummary.slotsWithConflict}</p>

              <p>Заказов затронуто: {toirSummary.ordersAffected}</p>

            </>

          ) : (

            <p className="text-muted-foreground">Нет сводки за период</p>

          )}

          <div className="max-h-32 overflow-y-auto space-y-1 pt-2 border-t border-border/40">

            {maintenance.map((m) => (

              <p key={m.id} className="text-muted-foreground">

                {m.equipmentName}: {m.maintenanceType} ({m.status})

              </p>

            ))}

            {repairOverlay.slice(0, 6).map((r) => (

              <p key={r.id} className="text-muted-foreground">{r.title}</p>

            ))}

            {maintenance.length === 0 && repairOverlay.length === 0 && (

              <p className="text-muted-foreground">Нет плановых ТО и ремонтов в периоде</p>

            )}

          </div>

        </CardContent>

      </Card>



      <Card>

        <CardHeader>

          <CardTitle className="text-base">OEE (сводка)</CardTitle>

        </CardHeader>

        <CardContent className="text-sm space-y-2 text-muted-foreground">

          <p>{oeePrep.availabilityNote}</p>

          <p>{oeePrep.performanceNote}</p>

          <p>{oeePrep.qualityNote}</p>

          {toirSummary && (

            <p>

              Плановое время производства: {toirSummary.plannedProductionMinutes} мин

            </p>

          )}

          <p className="pt-2 border-t border-border/40">

            Детальный расчёт A / P / Q и OEE — вкладка «OEE».

          </p>

        </CardContent>

      </Card>

    </div>

  );

}


