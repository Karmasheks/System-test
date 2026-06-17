import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { AlertCircle, Download, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useWarehouseReport } from "@/hooks/use-asset-management";
import { useWarehouseParts } from "@/hooks/use-warehouse";
import { warehouseAlertLabel } from "@shared/warehouse-constants";
import {
  ReportPeriodFilter,
  getReportPeriodRange,
  type ReportPeriodPreset,
} from "@/components/reports/report-period-filter";
import {
  buildWarehouseStockReportFromParts,
  exportWarehouseReport,
  exportWarehouseStockSnapshot,
  warehouseStockStatusFromPart,
  type ReportFileFormat,
} from "@/lib/specialized-report-export";
import { formatRuDateTime } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { cn } from "@/lib/utils";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

function stockStatusLabel(status: string) {
  if (status === "zero") return "Нет на складе";
  if (status === "low") return "Ниже минимума";
  return "В норме";
}

function stockStatusVariant(status: string): "destructive" | "secondary" | "outline" {
  if (status === "zero") return "destructive";
  if (status === "low") return "secondary";
  return "outline";
}

export function WarehouseReportPanel() {
  const { toast } = useToast();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    filterLabel,
    allowAllOption,
  } = useSubdivisionFilter();
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [exporting, setExporting] = useState(false);
  const [stockExporting, setStockExporting] = useState(false);

  const period = useMemo(
    () => getReportPeriodRange(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  );

  const {
    data: parts = [],
    isLoading: partsLoading,
    isError: partsError,
    refetch: refetchParts,
    isFetching: partsFetching,
  } = useWarehouseParts({
    subdivisionId: filterSubdivisionId ?? undefined,
  });

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchReport,
    isFetching: reportFetching,
  } = useWarehouseReport(period.from, period.to, filterSubdivisionId);

  const stockReport = useMemo(
    () => buildWarehouseStockReportFromParts(parts, filterSubdivisionId),
    [parts, filterSubdivisionId]
  );

  const subdivisionExportLabel =
    filterSubdivisionId != null ? filterLabel : "Все подразделения";

  const isLoading = partsLoading || reportLoading;
  const isFetching = partsFetching || reportFetching;
  const canExportStock = !partsLoading && !partsError;
  const canExportPeriodReport = !!report && !reportError;

  const partsPag = useListPagination(parts, 25, String(filterSubdivisionId));
  const movementsPag = useListPagination(report?.movements ?? [], 25, `${period.from}|${period.to}|${filterSubdivisionId}`);
  const alertsPag = useListPagination(report?.alerts ?? [], 25, `${period.from}|${period.to}|${filterSubdivisionId}`);

  const handleRefresh = () => {
    void refetchParts();
    void refetchReport();
  };

  const handleExport = async (fileFormat: ReportFileFormat) => {
    if (!report) return;
    setExporting(true);
    try {
      await exportWarehouseReport(report, fileFormat, period.from, period.to);
      toast({ title: "Отчёт по складу выгружен" });
    } catch {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleStockExport = async (fileFormat: ReportFileFormat) => {
    if (!canExportStock) return;
    setStockExporting(true);
    try {
      await exportWarehouseStockSnapshot(stockReport, fileFormat, subdivisionExportLabel);
      toast({ title: "Остатки склада выгружены" });
    } catch {
      toast({ title: "Ошибка экспорта остатков", variant: "destructive" });
    } finally {
      setStockExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Склад запчастей
          </CardTitle>
          <CardDescription>
            Остатки, движения и алерты за период {period.label}
            {filterSubdivisionId != null ? ` · ${filterLabel}` : ""}
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
            <SubdivisionFilterSelect
              value={filterValue}
              onChange={setFilterValue}
              subdivisions={availableSubdivisions}
              showAll={allowAllOption}
              className="min-w-[220px]"
            />
            <Button variant="outline" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Обновить
            </Button>
            <Button
              variant="outline"
              disabled={!canExportPeriodReport || exporting}
              onClick={() => handleExport("excel")}
            >
              <Download className="h-4 w-4 mr-2" />
              Отчёт Excel
            </Button>
            <Button
              variant="outline"
              disabled={!canExportPeriodReport || exporting}
              onClick={() => handleExport("csv")}
            >
              Отчёт CSV
            </Button>
            <Button
              variant="outline"
              disabled={!canExportPeriodReport || exporting}
              onClick={() => handleExport("pdf")}
            >
              Отчёт PDF
            </Button>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Выгрузка остатков по всем позициям</p>
              <p className="text-xs text-muted-foreground">
                Полный список запчастей со статусами, остатками и резервом · {subdivisionExportLabel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canExportStock || stockExporting}
                onClick={() => handleStockExport("excel")}
              >
                <Download className="h-4 w-4 mr-2" />
                Остатки Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canExportStock || stockExporting}
                onClick={() => handleStockExport("csv")}
              >
                Остатки CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canExportStock || stockExporting}
                onClick={() => handleStockExport("pdf")}
              >
                Остатки PDF
              </Button>
            </div>
          </div>
          {(partsError || reportError) && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p>Не удалось загрузить часть данных склада.</p>
                <p className="text-xs mt-1 opacity-80">
                  {partsError && reportError
                    ? "Остатки и движения недоступны — нажмите «Обновить»."
                    : partsError
                      ? "Остатки недоступны — проверьте доступ к складу."
                      : "Движения за период недоступны — выгрузка остатков всё равно доступна."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Загрузка…</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Позиций на складе</CardDescription>
                <CardTitle className="text-2xl">{stockReport.summary.totalParts}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Движений за период</CardDescription>
                <CardTitle className="text-2xl">{report?.summary.movementsCount ?? "—"}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Приход / списание</CardDescription>
                <CardTitle className="text-2xl text-base">
                  {report
                    ? `+${report.summary.incomingQuantity} / −${report.summary.outgoingQuantity}`
                    : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Оценка остатков</CardDescription>
                <CardTitle className="text-2xl">
                  {stockReport.summary.estimatedStockValue.toLocaleString("ru-RU")} ₽
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Нет на складе</p>
                <p className="text-2xl font-bold text-red-600">{stockReport.summary.zeroStockCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Ниже минимума</p>
                <p className="text-2xl font-bold text-amber-600">{stockReport.summary.lowStockCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Активных алертов</p>
                <p className="text-2xl font-bold">{report?.summary.unresolvedAlerts ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Остатки</CardTitle>
              <CardDescription>
                {parts.length === 0
                  ? "Позиций не найдено для выбранного подразделения"
                  : `Показано ${parts.length} позиций`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {parts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  На складе нет позиций по текущему фильтру. Выгрузка остатков всё равно доступна —
                  файл будет содержать заголовки и сводку с нулевыми значениями.
                </p>
              ) : (
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Запчасть</TableHead>
                        <TableHead>Категория</TableHead>
                        <TableHead className="text-right">Остаток</TableHead>
                        <TableHead className="text-right">Резерв</TableHead>
                        <TableHead className="text-right">Доступно</TableHead>
                        <TableHead className="text-right">Мин.</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Подразделение</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partsPag.pageItems.map((part) => {
                      const stockStatus = warehouseStockStatusFromPart(part);
                      return (
                        <TableRow key={part.id}>
                          <TableCell className="font-medium">{part.name}</TableCell>
                          <TableCell className="text-xs">{part.categoryName ?? "—"}</TableCell>
                          <TableCell className="text-right">{part.quantity}</TableCell>
                          <TableCell className="text-right">{part.reservedQuantity ?? 0}</TableCell>
                          <TableCell className="text-right">
                            {Math.max(0, (part.quantity ?? 0) - (part.reservedQuantity ?? 0))}
                          </TableCell>
                          <TableCell className="text-right">{part.minStock}</TableCell>
                          <TableCell>
                            <Badge variant={stockStatusVariant(stockStatus)}>
                              {stockStatusLabel(stockStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{part.subdivisionName ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <ListPaginationControls
                  page={partsPag.page}
                  totalPages={partsPag.totalPages}
                  total={partsPag.total}
                  from={partsPag.from}
                  to={partsPag.to}
                  onPageChange={partsPag.setPage}
                />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Движения за период</CardTitle>
            </CardHeader>
            <CardContent>
              {reportError ? (
                <p className="text-sm text-muted-foreground py-4">
                  Движения за период не загрузились. Остатки и выгрузка позиций доступны выше.
                </p>
              ) : movementsPag.total === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Движений не было</p>
              ) : (
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Запчасть</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead className="text-right">Кол-во</TableHead>
                        <TableHead>Исполнитель</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movementsPag.pageItems.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatRuDateTime(m.createdAt)}
                        </TableCell>
                        <TableCell>{m.partName}</TableCell>
                        <TableCell>
                          <Badge variant={m.type === "in" ? "outline" : "secondary"}>
                            {m.typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{m.quantity}</TableCell>
                        <TableCell className="text-xs">{m.performedByName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ListPaginationControls
                  page={movementsPag.page}
                  totalPages={movementsPag.totalPages}
                  total={movementsPag.total}
                  from={movementsPag.from}
                  to={movementsPag.to}
                  onPageChange={movementsPag.setPage}
                />
                </div>
              )}
            </CardContent>
          </Card>

          {alertsPag.total > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Активные алерты</CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Запчасть</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead className="text-right">Остаток</TableHead>
                        <TableHead className="text-right">Мин.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alertsPag.pageItems.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.partName}</TableCell>
                        <TableCell>{warehouseAlertLabel(a.alertType)}</TableCell>
                        <TableCell className="text-right">{a.quantity}</TableCell>
                        <TableCell className="text-right">{a.minStock}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ListPaginationControls
                  page={alertsPag.page}
                  totalPages={alertsPag.totalPages}
                  total={alertsPag.total}
                  from={alertsPag.from}
                  to={alertsPag.to}
                  onPageChange={alertsPag.setPage}
                />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

