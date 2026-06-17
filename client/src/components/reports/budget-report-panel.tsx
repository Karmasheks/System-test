import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Download, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useBudgetReport } from "@/hooks/use-asset-management";
import { useEquipmentData } from "@/hooks/use-equipment-data";
import { budgetCategoryLabel } from "@shared/asset-constants";
import {
  ReportPeriodFilter,
  getReportPeriodRange,
  type ReportPeriodPreset,
} from "@/components/reports/report-period-filter";
import { exportBudgetReport, type ReportFileFormat } from "@/lib/specialized-report-export";
import { formatRuDate } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

export function BudgetReportPanel() {
  const { toast } = useToast();
  const { equipment: equipmentList } = useEquipmentData();
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [exporting, setExporting] = useState(false);

  const period = useMemo(
    () => getReportPeriodRange(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  );

  const equipmentId = equipmentFilter === "all" ? undefined : equipmentFilter;
  const { data: report, isLoading, refetch, isFetching } = useBudgetReport(
    period.from,
    period.to,
    equipmentId
  );

  const entriesPag = useListPagination(
    report?.entries ?? [],
    25,
    `${period.from}|${period.to}|${equipmentFilter}`
  );
  const byEquipmentPag = useListPagination(
    report?.byEquipment ?? [],
    25,
    `${period.from}|${period.to}|${equipmentFilter}`
  );

  const handleExport = async (format: ReportFileFormat) => {
    if (!report) return;
    setExporting(true);
    try {
      await exportBudgetReport(report, format, period.from, period.to);
      toast({ title: "Отчёт по затратам выгружен" });
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
            <Wallet className="h-5 w-5" />
            Затраты и бюджет
          </CardTitle>
          <CardDescription>
            Расходы по категориям, оборудованию и детализация записей за выбранный период
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
            <div className="min-w-[220px]">
              <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Оборудование" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всё оборудование</SelectItem>
                  {equipmentList.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Обновить
            </Button>
            <Button variant="outline" disabled={!report || exporting} onClick={() => handleExport("excel")}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" disabled={!report || exporting} onClick={() => handleExport("csv")}>
              CSV
            </Button>
            <Button variant="outline" disabled={!report || exporting} onClick={() => handleExport("pdf")}>
              PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Загрузка…</CardContent>
        </Card>
      ) : report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Всего потрачено</CardDescription>
                <CardTitle className="text-2xl">{report.total.toLocaleString("ru-RU")} ₽</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Записей</CardDescription>
                <CardTitle className="text-2xl">{report.count}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Категорий</CardDescription>
                <CardTitle className="text-2xl">{Object.keys(report.byCategory).length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Оборудования</CardDescription>
                <CardTitle className="text-2xl">{report.byEquipment.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">По категориям</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(report.byCategory).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных за период</p>
                ) : (
                  Object.entries(report.byCategory).map(([code, sum]) => (
                    <div key={code} className="flex justify-between text-sm">
                      <span>{budgetCategoryLabel(code)}</span>
                      <span className="font-medium">{sum.toLocaleString("ru-RU")} ₽</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">По оборудованию</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                {byEquipmentPag.total === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет данных</p>
                ) : (
                  byEquipmentPag.pageItems.map((row) => (
                    <div key={row.equipmentId ?? row.equipmentName} className="flex justify-between text-sm gap-2">
                      <span className="text-multiline">{row.equipmentName}</span>
                      <span className="font-medium shrink-0">{row.total.toLocaleString("ru-RU")} ₽</span>
                    </div>
                  ))
                )}
                <ListPaginationControls
                  page={byEquipmentPag.page}
                  totalPages={byEquipmentPag.totalPages}
                  total={byEquipmentPag.total}
                  from={byEquipmentPag.from}
                  to={byEquipmentPag.to}
                  onPageChange={byEquipmentPag.setPage}
                  className="pt-2"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Детализация записей</CardTitle>
              <CardDescription>{period.label}</CardDescription>
            </CardHeader>
            <CardContent>
              {entriesPag.total === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Записи за период не найдены</p>
              ) : (
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Название</TableHead>
                        <TableHead>Категория</TableHead>
                        <TableHead>Оборудование</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entriesPag.pageItems.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatRuDate(entry.expenseDate)}
                          </TableCell>
                          <TableCell>{entry.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{budgetCategoryLabel(entry.category)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{entry.equipmentName ?? "—"}</TableCell>
                          <TableCell className="text-right font-medium">
                            {entry.amount.toLocaleString("ru-RU")} ₽
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ListPaginationControls
                    page={entriesPag.page}
                    totalPages={entriesPag.totalPages}
                    total={entriesPag.total}
                    from={entriesPag.from}
                    to={entriesPag.to}
                    onPageChange={entriesPag.setPage}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
