import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useMaterialStocks,
  useProductionOrders,
  useOrderMaterialRequirements,
  useProductionMutations,
} from "@/hooks/use-production-planning";
import { MATERIAL_TYPE_LABELS } from "@/lib/production-planning-constants";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccessControl } from "@/hooks/use-access-control";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

type Props = {
  subdivisionId: number;
};

export function PlanningMaterialsTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");
  const { createMaterial } = useProductionMutations();

  const { data: stocks = [], isLoading } = useMaterialStocks(subdivisionId);
  const { data: orders = [] } = useProductionOrders({ subdivisionId });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    sapCode: "",
    name: "",
    type: "base",
    unit: "kg",
  });

  const handleAddMaterial = async () => {
    try {
      await createMaterial.mutateAsync({
        subdivisionId,
        sapCode: form.sapCode.trim(),
        name: form.name.trim(),
        type: form.type,
        unit: form.unit,
        subdivisionIds: [subdivisionId],
      });
      toast({ title: "Материал добавлен" });
      setAddOpen(false);
      setForm({ sapCode: "", name: "", type: "base", unit: "kg" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось добавить",
        variant: "destructive",
      });
    }
  };

  const activeOrders = orders.filter(
    (o) => !["completed", "cancelled"].includes(o.status)
  );
  const firstOrderId = activeOrders[0]?.id ?? null;
  const { data: requirements } = useOrderMaterialRequirements(firstOrderId);

  const shortages = stocks.filter(
    (s) => s.quantity - s.reservedQuantity < s.minStock
  );

  const {
    page: stocksPage,
    setPage: setStocksPage,
    pageItems: stockPageItems,
    totalPages: stocksTotalPages,
    total: stocksTotal,
    from: stocksFrom,
    to: stocksTo,
  } = useListPagination(stocks, 25, String(subdivisionId));

  const requirementItems = requirements?.requirements ?? [];
  const {
    page: reqPage,
    setPage: setReqPage,
    pageItems: reqPageItems,
    totalPages: reqTotalPages,
    total: reqTotal,
    from: reqFrom,
    to: reqTo,
  } = useListPagination(requirementItems, 25, String(firstOrderId));

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить материал / оснастку (склад)
          </Button>
        </div>
      )}
      {shortages.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              Предупреждения о нехватке ({shortages.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {shortages.slice(0, 5).map((s) => (
              <p key={s.id}>
                {s.materialName}: доступно {s.quantity - s.reservedQuantity}, мин. {s.minStock}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-medium mb-2">Остатки материалов</h3>
        <div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Материал</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>SAP</TableHead>
                  <TableHead>Остаток</TableHead>
                  <TableHead>Резерв</TableHead>
                  <TableHead>Мин.</TableHead>
                  <TableHead>Склад</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Загрузка…
                    </TableCell>
                  </TableRow>
                ) : stocksTotal === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Нет остатков
                    </TableCell>
                  </TableRow>
                ) : (
                  stockPageItems.map((s) => {
                  const avail = s.quantity - s.reservedQuantity;
                  const low = avail < s.minStock;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{s.materialName}</TableCell>
                      <TableCell>
                        {MATERIAL_TYPE_LABELS[s.materialType] ?? s.materialType}
                      </TableCell>
                      <TableCell>{s.sapCode}</TableCell>
                      <TableCell>
                        {low ? (
                          <Badge variant="destructive">{avail}</Badge>
                        ) : (
                          avail
                        )}
                      </TableCell>
                      <TableCell>{s.reservedQuantity}</TableCell>
                      <TableCell>{s.minStock}</TableCell>
                      <TableCell>{s.storageLocation || "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
          <ListPaginationControls
            page={stocksPage}
            totalPages={stocksTotalPages}
            total={stocksTotal}
            from={stocksFrom}
            to={stocksTo}
            onPageChange={setStocksPage}
          />
        </div>
      </div>

      {requirements && (
        <div>
          <h3 className="text-sm font-medium mb-2">
            Потребность по заказу #{requirements.orderId} (остаток: {requirements.quantity})
          </h3>
          <div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Материал</TableHead>
                    <TableHead>Нужно</TableHead>
                    <TableHead>Доступно</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reqPageItems.map((r) => (
                    <TableRow key={r.materialId}>
                      <TableCell>{r.materialName}</TableCell>
                      <TableCell>{r.required} {r.unit}</TableCell>
                      <TableCell>{r.available}</TableCell>
                      <TableCell>
                        {r.sufficient ? (
                          <Badge variant="outline">OK</Badge>
                        ) : (
                          <Badge variant="destructive">Нехватка</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ListPaginationControls
              page={reqPage}
              totalPages={reqTotalPages}
              total={reqTotal}
              from={reqFrom}
              to={reqTo}
              onPageChange={setReqPage}
            />
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый материал / оснастка</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>SAP код</Label>
              <Input value={form.sapCode} onChange={(e) => setForm({ ...form, sapCode: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Наименование</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Тип</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MATERIAL_TYPE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ед. изм.</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button>
            <Button
              onClick={handleAddMaterial}
              disabled={!form.sapCode.trim() || !form.name.trim()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
