import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useInternalWarehouseSummary } from "@/hooks/use-production-planning";
import { MATERIAL_TYPE_LABELS } from "@/lib/production-planning-constants";
import { formatRuDateTime } from "@/lib/export-utils";
import { Package, AlertTriangle, Boxes } from "lucide-react";
import { PRODUCTION_ORDER_STATUS_LABELS } from "@/lib/production-planning-constants";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

type Props = {
  subdivisionId: number;
};

export function PlanningWarehouseTab({ subdivisionId }: Props) {
  const { data, isLoading } = useInternalWarehouseSummary(subdivisionId);

  const summary = data?.summary;

  const finishedProducts = data?.finishedProducts ?? [];
  const finishedByOrder = data?.finishedByOrder ?? [];
  const stocks = data?.stocks ?? [];
  const requirements = data?.requirements ?? [];
  const movements = data?.movements ?? [];

  const fpPag = useListPagination(finishedProducts, 25, String(subdivisionId));
  const orderPag = useListPagination(finishedByOrder, 25, String(subdivisionId));
  const stocksPag = useListPagination(stocks, 25, String(subdivisionId));
  const reqPag = useListPagination(requirements, 25, String(subdivisionId));
  const movPag = useListPagination(movements, 25, String(subdivisionId));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Позиций на складе</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary?.stockItems ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Готовые изделия, шт</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-green-700 dark:text-green-400">
            {summary?.finishedQuantityTotal ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Нехватка</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-orange-600">
            {summary?.shortages ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">План сырья (кг)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {summary?.plannedMaterialKg ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Активных заказов</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary?.activeOrders ?? 0}</CardContent>
        </Card>
      </div>

      {summary && summary.shortages > 0 && (
        <Card className="border-orange-200 bg-orange-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Внимание: позиции ниже минимума
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Boxes className="h-4 w-4" />
            Готовые изделия (склад ГП)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Сводка по выпущенным изделиям: факт выпуска по заказам, остаток заказа и брак
            (как в плане производства).
          </p>
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Изделие</TableHead>
                  <TableHead>SAP</TableHead>
                  <TableHead>№ ПФ</TableHead>
                  <TableHead>На складе, шт</TableHead>
                  <TableHead>Остаток заказа, шт</TableHead>
                  <TableHead>Брак, шт</TableHead>
                  <TableHead>Заказов</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fpPag.total === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Нет данных о готовых изделиях
                    </TableCell>
                  </TableRow>
                ) : (
                  fpPag.pageItems.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.sapCode}</TableCell>
                    <TableCell className="font-mono">{p.pfNumber ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {p.quantityOnHand}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.quantityOrderRemainder}</TableCell>
                    <TableCell>
                      {p.quantityDefective > 0 ? (
                        <Badge variant="destructive">{p.quantityDefective}</Badge>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell>{p.orderCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ListPaginationControls
            page={fpPag.page}
            totalPages={fpPag.totalPages}
            total={fpPag.total}
            from={fpPag.from}
            to={fpPag.to}
            onPageChange={fpPag.setPage}
          />
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">По заказам</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Заказ</TableHead>
                  <TableHead>Изделие</TableHead>
                  <TableHead>План, шт</TableHead>
                  <TableHead>Факт выпуск, шт</TableHead>
                  <TableHead>Остаток, шт</TableHead>
                  <TableHead>Брак</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderPag.total === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Нет заказов с выпуском или остатком
                    </TableCell>
                  </TableRow>
                ) : (
                  orderPag.pageItems.map((row) => (
                    <TableRow key={row.orderId}>
                      <TableCell>{row.orderNumber}</TableCell>
                      <TableCell>
                        <div>{row.productName}</div>
                        <div className="text-xs text-muted-foreground">{row.sapCode}</div>
                      </TableCell>
                      <TableCell>{row.targetQuantity}</TableCell>
                      <TableCell>{row.completedQuantity}</TableCell>
                      <TableCell>
                        {row.remainderQuantity > 0 ? row.remainderQuantity : 0}
                      </TableCell>
                      <TableCell>{row.defectiveQuantity}</TableCell>
                      <TableCell>
                        {PRODUCTION_ORDER_STATUS_LABELS[row.status] ?? row.status}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <ListPaginationControls
              page={orderPag.page}
              totalPages={orderPag.totalPages}
              total={orderPag.total}
              from={orderPag.from}
              to={orderPag.to}
              onPageChange={orderPag.setPage}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Сырьё и материалы (остатки)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Материал</TableHead>
                    <TableHead>SAP</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Остаток</TableHead>
                    <TableHead>Резерв</TableHead>
                    <TableHead>Мин.</TableHead>
                    <TableHead>Склад</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stocksPag.pageItems.map((s) => {
                  const avail = s.quantity - s.reservedQuantity;
                  const low = avail < s.minStock;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{s.materialName}</TableCell>
                      <TableCell>{s.sapCode}</TableCell>
                      <TableCell>
                        {MATERIAL_TYPE_LABELS[s.materialType] ?? s.materialType}
                      </TableCell>
                      <TableCell>
                        {low ? <Badge variant="destructive">{avail}</Badge> : avail}
                      </TableCell>
                      <TableCell>{s.reservedQuantity}</TableCell>
                      <TableCell>{s.minStock}</TableCell>
                      <TableCell>{s.storageLocation || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ListPaginationControls
              page={stocksPag.page}
              totalPages={stocksPag.totalPages}
              total={stocksPag.total}
              from={stocksPag.from}
              to={stocksPag.to}
              onPageChange={stocksPag.setPage}
            />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Потребность по активным заказам</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Материал</TableHead>
                  <TableHead>SAP</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Нужно</TableHead>
                  <TableHead>Доступно</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqPag.pageItems.map((r) => (
                <TableRow key={r.materialId}>
                  <TableCell>{r.materialName}</TableCell>
                  <TableCell>{r.sapCode}</TableCell>
                  <TableCell>
                    {MATERIAL_TYPE_LABELS[r.materialType] ?? r.materialType}
                  </TableCell>
                  <TableCell>{r.required} {r.unit}</TableCell>
                  <TableCell>
                    {r.available >= r.required ? (
                      <Badge variant="outline">OK</Badge>
                    ) : (
                      <Badge variant="destructive">{r.available}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPaginationControls
            page={reqPag.page}
            totalPages={reqPag.totalPages}
            total={reqPag.total}
            from={reqPag.from}
            to={reqPag.to}
            onPageChange={reqPag.setPage}
          />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Движения материалов</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                <TableHead>Материал</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Кол-во</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movPag.pageItems.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{formatRuDateTime(m.createdAt)}</TableCell>
                  <TableCell>{m.materialName}</TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell>{m.quantity} {m.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPaginationControls
            page={movPag.page}
            totalPages={movPag.totalPages}
            total={movPag.total}
            from={movPag.from}
            to={movPag.to}
            onPageChange={movPag.setPage}
          />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
