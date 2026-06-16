import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Activity, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProductionReliabilityReport } from "@/hooks/use-asset-management";
import { useEquipmentData } from "@/hooks/use-equipment-data";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import {
  ReportPeriodFilter,
  getReportPeriodRange,
  type ReportPeriodPreset,
} from "@/components/reports/report-period-filter";
import {
  exportProductionReliabilityReport,
  type ReportFileFormat,
} from "@/lib/specialized-report-export";
import { formatRuDateTime } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { OeePercent } from "@shared/production-oee-types";

function formatPercent(value: OeePercent): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatHours(hours: number | null): string {
  if (hours == null) return "—";
  return `${hours.toFixed(2)} ч`;
}

function MetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ProductionReliabilityReportPanel() {
  const { toast } = useToast();
  const { equipment: equipmentList } = useEquipmentData();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
  } = useSubdivisionFilter();

  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [customTo, setCustomTo] = useState(() =>
    format(endOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [exporting, setExporting] = useState(false);

  const period = useMemo(
    () => getReportPeriodRange(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  );

  const equipmentId = equipmentFilter === "all" ? undefined : equipmentFilter;

  const scopedEquipment = useMemo(() => {
    if (filterSubdivisionId == null) return equipmentList;
    return equipmentList.filter((e) => {
      const rec = e as { subdivisionId?: number | null; homeSubdivisionId?: number | null };
      return (
        rec.subdivisionId === filterSubdivisionId ||
        rec.homeSubdivisionId === filterSubdivisionId
      );
    });
  }, [equipmentList, filterSubdivisionId]);

  const { data: report, isLoading, refetch, isFetching } =
    useProductionReliabilityReport(
      period.from,
      period.to,
      filterSubdivisionId,
      equipmentId
    );

  const summary = report?.summary;
  const oee = summary?.oee;

  const handleExport = async (format: ReportFileFormat) => {
    if (!report) return;
    setExporting(true);
    try {
      await exportProductionReliabilityReport(report, format, period.from, period.to);
      toast({ title: "Отчёт OEE / MTBF / MTTR выгружен" });
    } catch {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            OEE, MTBF и MTTR
          </CardTitle>
          <CardDescription>
            Эффективность производства (OEE) и показатели надёжности по заявкам на ремонт и
            производственным простоям
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReportPeriodFilter
            preset={periodPreset}
            onPresetChange={setPeriodPreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
          <div className="flex flex-wrap gap-3 items-end">
            {showFilter && (
              <div className="min-w-[220px]">
                <SubdivisionFilterSelect
                  inline
                  value={filterValue}
                  onChange={setFilterValue}
                  subdivisions={availableSubdivisions}
                />
              </div>
            )}
            <div className="min-w-[220px]">
              <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Оборудование" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все оборудование</SelectItem>
                  {scopedEquipment.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Обновить
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!report || exporting}
              onClick={() => handleExport("csv")}
            >
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!report || exporting}
              onClick={() => handleExport("excel")}
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>

          {filterSubdivisionId == null && (
            <p className="text-sm text-muted-foreground">
              Выберите подразделение для расчёта OEE. MTBF/MTTR доступны по всем доступным
              подразделениям.
            </p>
          )}

          {isLoading && (
            <p className="text-sm text-muted-foreground">Загрузка отчёта…</p>
          )}

          {summary && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard title="OEE" value={formatPercent(oee?.oee ?? null)} />
                <MetricCard
                  title="Доступность (A)"
                  value={formatPercent(oee?.availability ?? null)}
                />
                <MetricCard
                  title="Производительность (P)"
                  value={formatPercent(oee?.performance ?? null)}
                />
                <MetricCard title="Качество (Q)" value={formatPercent(oee?.quality ?? null)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="MTTR"
                  value={formatHours(summary.mttrHours)}
                  hint={`${summary.repairMinutesTotal} мин ремонта / ${summary.failureCount} отказов`}
                />
                <MetricCard
                  title="MTBF"
                  value={formatHours(summary.mtbfHours)}
                  hint={`${summary.operatingMinutes} мин работы / ${summary.failureCount} отказов`}
                />
                <MetricCard
                  title="Отказов"
                  value={String(summary.failureCount)}
                  hint={`Оборудование в отчёте: ${summary.equipmentInScope}`}
                />
                <MetricCard
                  title="Выпуск (годные)"
                  value={oee ? String(oee.produced) : "—"}
                  hint={oee ? `Брак: ${oee.defective}` : undefined}
                />
              </div>

              {report.notes.length > 0 && (
                <div className="text-sm text-muted-foreground space-y-1 border rounded-md p-3">
                  {report.notes.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {report && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">По оборудованию</CardTitle>
            </CardHeader>
            <CardContent>
              {report.byEquipment.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Оборудование</TableHead>
                      <TableHead>OEE</TableHead>
                      <TableHead>MTTR</TableHead>
                      <TableHead>MTBF</TableHead>
                      <TableHead>Отказов</TableHead>
                      <TableHead>Ремонт, мин</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byEquipment
                      .filter(
                        (row) =>
                          row.failureCount > 0 ||
                          row.oee?.oee != null ||
                          (row.oee?.produced ?? 0) > 0
                      )
                      .map((row) => (
                        <TableRow key={row.equipmentId}>
                          <TableCell>{row.equipmentName}</TableCell>
                          <TableCell className="tabular-nums">
                            {formatPercent(row.oee?.oee ?? null)}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatHours(row.mttrHours)}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatHours(row.mtbfHours)}
                          </TableCell>
                          <TableCell>{row.failureCount}</TableCell>
                          <TableCell>{row.repairMinutesTotal}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">События отказов и ремонтов</CardTitle>
            </CardHeader>
            <CardContent>
              {report.failures.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет событий в периоде</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Оборудование</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Описание</TableHead>
                      <TableHead>Ремонт, мин</TableHead>
                      <TableHead>Закрыто</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.failures.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>{formatRuDateTime(f.failureAt)}</TableCell>
                        <TableCell>{f.equipmentName}</TableCell>
                        <TableCell>
                          {f.source === "service_request" ? "Заявка" : "Простой"}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate">{f.title}</TableCell>
                        <TableCell>{f.repairMinutes}</TableCell>
                        <TableCell>
                          {f.resolvedAt ? formatRuDateTime(f.resolvedAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
