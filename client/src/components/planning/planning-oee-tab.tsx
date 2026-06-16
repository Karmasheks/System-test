import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { useProductionOee } from "@/hooks/use-production-oee";
import type { OeePercent } from "@shared/production-oee-types";

type Props = {
  subdivisionId: number;
};

function formatPercent(value: OeePercent): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function OeeMetricCard({ title, value }: { title: string; value: OeePercent }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{formatPercent(value)}</p>
      </CardContent>
    </Card>
  );
}

export function PlanningOeeTab({ subdivisionId }: Props) {
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const [from, setFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(monthEnd.toISOString().slice(0, 10));
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");

  const fromIso = new Date(from).toISOString();
  const toIso = new Date(`${to}T23:59:59`).toISOString();
  const equipmentId =
    equipmentFilter === "all" ? undefined : equipmentFilter;

  const { data, isLoading, isError } = useProductionOee(
    subdivisionId,
    fromIso,
    toIso,
    equipmentId
  );

  const { allEquipment } = useEquipmentApi();
  const equipment = useMemo(
    () =>
      allEquipment.filter(
        (e) =>
          e.status !== "decommissioned" &&
          (e.subdivisionId === subdivisionId || e.homeSubdivisionId === subdivisionId)
      ),
    [allEquipment, subdivisionId]
  );

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="oee-from">С</Label>
          <Input
            id="oee-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="oee-to">По</Label>
          <Input
            id="oee-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label>Оборудование</Label>
          <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Все" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все оборудование</SelectItem>
              {equipment.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Загрузка OEE…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">Не удалось загрузить OEE</p>
      )}

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OeeMetricCard title="Доступность (A)" value={summary.availability} />
            <OeeMetricCard title="Производительность (P)" value={summary.performance} />
            <OeeMetricCard title="Качество (Q)" value={summary.quality} />
            <OeeMetricCard title="OEE" value={summary.oee} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Базовые показатели</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <p>Плановое время: {summary.plannedMinutes} мин</p>
              <p>Простои: {summary.downtimeMinutes} мин</p>
              <p>Операционное время: {summary.operatingMinutes} мин</p>
              <p>Выпущено (годные): {summary.produced}</p>
              <p>Брак: {summary.defective}</p>
              <p>
                Норма: {summary.normQuantity ?? "—"}
                {summary.varianceQuantity != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    (Δ {summary.varianceQuantity}
                    {summary.variancePercent != null
                      ? `, ${summary.variancePercent}%`
                      : ""}
                    )
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          {data.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Примечания</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {data.notes.map((note, i) => (
                  <p key={i}>{note}</p>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">По заказам</CardTitle>
              </CardHeader>
              <CardContent>
                {data.byOrder.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="pb-2 pr-3">Заказ</th>
                          <th className="pb-2 pr-3">A</th>
                          <th className="pb-2 pr-3">P</th>
                          <th className="pb-2 pr-3">Q</th>
                          <th className="pb-2">OEE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byOrder.map((row) => (
                          <tr key={row.orderId} className="border-b border-border/50">
                            <td className="py-2 pr-3">
                              <div>{row.orderNumber}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.productName}
                              </div>
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {formatPercent(row.availability)}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {formatPercent(row.performance)}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {formatPercent(row.quality)}
                            </td>
                            <td className="py-2 tabular-nums font-medium">
                              {formatPercent(row.oee)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">По оборудованию</CardTitle>
              </CardHeader>
              <CardContent>
                {data.byEquipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="pb-2 pr-3">Оборудование</th>
                          <th className="pb-2 pr-3">A</th>
                          <th className="pb-2 pr-3">P</th>
                          <th className="pb-2 pr-3">Q</th>
                          <th className="pb-2">OEE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byEquipment.map((row) => (
                          <tr
                            key={row.equipmentId}
                            className="border-b border-border/50"
                          >
                            <td className="py-2 pr-3">{row.equipmentName}</td>
                            <td className="py-2 pr-3 tabular-nums">
                              {formatPercent(row.availability)}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {formatPercent(row.performance)}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {formatPercent(row.quality)}
                            </td>
                            <td className="py-2 tabular-nums font-medium">
                              {formatPercent(row.oee)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
