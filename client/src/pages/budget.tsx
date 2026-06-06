import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { maskSensitiveValue, useAccessControl } from "@/hooks/use-access-control";
import { useBudgetEntries, useBudgetSummary, useBudgetMutations, useSuppliers } from "@/hooks/use-asset-management";
import { useWarehouseParts, useWarehouseCategories } from "@/hooks/use-warehouse";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { BUDGET_CATEGORIES, budgetCategoryLabel } from "@shared/asset-constants";
import { warehouseCategoryForBudget } from "@shared/warehouse-constants";
import { Wallet, Plus, Trash2, ChevronDown, Package } from "lucide-react";
import type { BudgetEntry } from "@shared/schema";
export default function BudgetPage() {
  const { toast } = useToast();
  const { isFieldVisible } = useAccessControl();
  const showAmounts = isFieldVisible("budget_amounts");
  const now = new Date();
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));

  const filters = {
    equipmentId: equipmentFilter !== "all" ? equipmentFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    from,
    to,
  };

  const { data: entries = [], isLoading } = useBudgetEntries(filters);
  const { data: summary } = useBudgetSummary(equipmentFilter !== "all" ? equipmentFilter : undefined);
  const { create, update, remove } = useBudgetMutations();
  const { allEquipment } = useEquipmentApi();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouseParts = [] } = useWarehouseParts();
  const { data: warehouseCategories = [] } = useWarehouseCategories();

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<BudgetEntry | null>(null);
  const [linkMode, setLinkMode] = useState<"equipment" | "warehouse">("equipment");
  const [warehouseOpen, setWarehouseOpen] = useState(true);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "parts",
    equipmentId: "",
    warehousePartId: "",
    warehouseCategoryId: "",
    storageLocation: "",
    warehouseInitialQuantity: "1",
    supplierId: "",
    expenseDate: format(now, "yyyy-MM-dd"),
    notes: "",
    serviceRequestId: "",
    taskId: "",
  });

  const filteredWarehouseParts = useMemo(() => {
    if (!form.warehouseCategoryId) return warehouseParts;
    return warehouseParts.filter((p) => String(p.categoryId) === form.warehouseCategoryId);
  }, [warehouseParts, form.warehouseCategoryId]);

  const selectedWarehouseCategory = warehouseCategories.find(
    (c) => String(c.id) === form.warehouseCategoryId
  );

  useEffect(() => {
    if (linkMode !== "warehouse" || warehouseCategories.length === 0) return;
    const name = warehouseCategoryForBudget(form.category);
    const cat = warehouseCategories.find((c) => c.name === name);
    if (cat && String(cat.id) !== form.warehouseCategoryId) {
      setForm((f) => ({ ...f, warehouseCategoryId: String(cat.id), warehousePartId: "" }));
    }
  }, [linkMode, form.category, warehouseCategories, form.warehouseCategoryId]);

  const reset = () => {
    setEdit(null);
    setLinkMode("equipment");
    setWarehouseOpen(true);
    setForm({
      title: "",
      amount: "",
      category: "parts",
      equipmentId: "",
      warehousePartId: "",
      warehouseCategoryId: "",
      storageLocation: "",
      warehouseInitialQuantity: "1",
      supplierId: "",
      expenseDate: format(now, "yyyy-MM-dd"),
      notes: "",
      serviceRequestId: "",
      taskId: "",
    });
  };

  const openEdit = (e: BudgetEntry) => {
    setEdit(e);
    const mode = e.storageLocation || e.warehousePartId ? "warehouse" : "equipment";
    setLinkMode(mode);
    setWarehouseOpen(true);
    const linkedPart = e.warehousePartId
      ? warehouseParts.find((p) => p.id === e.warehousePartId)
      : undefined;
    setForm({
      title: e.title,
      amount: String(e.amount),
      category: e.category,
      equipmentId: e.equipmentId ?? "",
      warehousePartId: e.warehousePartId ? String(e.warehousePartId) : "",
      warehouseCategoryId: linkedPart?.categoryId ? String(linkedPart.categoryId) : "",
      storageLocation: e.storageLocation ?? linkedPart?.storageLocation ?? "",
      warehouseInitialQuantity: "1",
      supplierId: e.supplierId ? String(e.supplierId) : "",
      expenseDate: e.expenseDate,
      notes: e.notes ?? "",
      serviceRequestId: e.serviceRequestId ? String(e.serviceRequestId) : "",
      taskId: e.taskId ? String(e.taskId) : "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.amount) {
      toast({ title: "Заполните название и сумму", variant: "destructive" });
      return;
    }
    const eq = allEquipment.find((e) => e.id === form.equipmentId);
    const part = warehouseParts.find((p) => String(p.id) === form.warehousePartId);
    const qty = form.warehouseInitialQuantity.trim()
      ? Number(form.warehouseInitialQuantity)
      : 1;
    if (linkMode === "warehouse" && !Number.isFinite(qty)) {
      toast({ title: "Некорректное количество для склада", variant: "destructive" });
      return;
    }

    if (linkMode === "warehouse" && !form.warehouseCategoryId) {
      toast({ title: "Выберите категорию запчасти на складе", variant: "destructive" });
      return;
    }

    const payload = {
      title: form.title.trim(),
      amount: Number(form.amount),
      category: form.category,
      equipmentId: linkMode === "equipment" ? (form.equipmentId || null) : null,
      equipmentName: linkMode === "equipment" ? (eq?.name ?? null) : null,
      warehousePartId: linkMode === "warehouse" && form.warehousePartId ? Number(form.warehousePartId) : null,
      storageLocation: linkMode === "warehouse" ? (form.storageLocation || part?.storageLocation || null) : null,
      linkToWarehouse: linkMode === "warehouse",
      warehouseInitialQuantity: linkMode === "warehouse" ? qty : undefined,
      warehouseCategoryId:
        linkMode === "warehouse" && form.warehouseCategoryId
          ? Number(form.warehouseCategoryId)
          : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      expenseDate: form.expenseDate,
      notes: form.notes || null,
      serviceRequestId: form.serviceRequestId ? Number(form.serviceRequestId) : null,
      taskId: form.taskId ? Number(form.taskId) : null,
      currency: "RUB",
    };
    try {
      if (edit) await update.mutateAsync({ id: edit.id, ...payload });
      else await create.mutateAsync(payload);
      const catLabel = selectedWarehouseCategory?.name ?? warehouseCategoryForBudget(form.category);
      toast({
        title: "Сохранено",
        description:
          linkMode === "warehouse"
            ? form.warehousePartId
              ? `Приход оформлен на складе (${catLabel})`
              : `Запчасть «${form.title.trim()}» добавлена на склад в категории «${catLabel}»`
            : undefined,
      });
      setOpen(false);
      reset();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Helmet><title>Затраты (Бюджет) — StarLine</title></Helmet>
      <main className="p-6 max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap justify-between gap-4">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-green-600" />
              <div>
                <h1 className="text-2xl font-bold">Затраты (Бюджет)</h1>
                <p className="text-sm text-gray-500">Все закупки и затраты с привязкой к оборудованию</p>
              </div>
            </div>
            <Button onClick={() => { reset(); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Добавить расход
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-gray-500">Итого за период</p><p className="text-2xl font-bold">{maskSensitiveValue(showAmounts, entries.reduce((s, e) => s + e.amount, 0).toLocaleString("ru") + " ₽")}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-gray-500">Записей</p><p className="text-2xl font-bold">{entries.length}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-gray-500">Всего по активу</p><p className="text-2xl font-bold">{maskSensitiveValue(showAmounts, (summary?.total ?? 0).toLocaleString("ru") + " ₽")}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Фильтры</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-4">
              <div>
                <Label>Оборудование</Label>
                <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {allEquipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Категория</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {BUDGET_CATEGORIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>С</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>По</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Расходы</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <p>Загрузка…</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Название</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Привязка</TableHead>
                      <TableHead>Сумма</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.expenseDate}</TableCell>
                        <TableCell>{e.title}</TableCell>
                        <TableCell><Badge variant="outline">{budgetCategoryLabel(e.category)}</Badge></TableCell>
                        <TableCell>
                          {e.equipmentName ??
                            (e.warehousePartId
                              ? `Склад: ${warehouseParts.find((p) => p.id === e.warehousePartId)?.name ?? e.storageLocation ?? "—"}`
                              : e.storageLocation
                                ? `Склад: ${e.storageLocation}`
                                : "—")}
                        </TableCell>
                        <TableCell>{maskSensitiveValue(showAmounts, e.amount.toLocaleString("ru") + " ₽")}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(e)}>Изм.</Button>
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit ? "Редактировать расход" : "Новый расход"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Название *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Сумма (₽) *</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div>
              <Label>Категория</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUDGET_CATEGORIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Привязка затрат</Label>
              <Select value={linkMode} onValueChange={(v) => setLinkMode(v as "equipment" | "warehouse")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equipment">К оборудованию</SelectItem>
                  <SelectItem value="warehouse">К складу (без оборудования)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {linkMode === "equipment" ? (
            <div>
              <Label>Оборудование (актив)</Label>
              <Select value={form.equipmentId || "none"} onValueChange={(v) => setForm({ ...form, equipmentId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {allEquipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            ) : (
            <Collapsible open={warehouseOpen} onOpenChange={setWarehouseOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Склад — категория и запчасть
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${warehouseOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3 rounded-lg border p-3 bg-muted/30">
                <div>
                  <Label>Категория на складе *</Label>
                  <Select
                    value={form.warehouseCategoryId || "none"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        warehouseCategoryId: v === "none" ? "" : v,
                        warehousePartId: "",
                      })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                    <SelectContent>
                      {warehouseCategories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    По умолчанию подставляется из категории затрат. Можно изменить.
                  </p>
                </div>

                <div>
                  <Label>Запчасть</Label>
                  <Select
                    value={form.warehousePartId || "new"}
                    onValueChange={(v) =>
                      setForm({ ...form, warehousePartId: v === "new" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Создать новую или выбрать" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">
                        + Создать новую: «{form.title.trim() || "название расхода"}»
                      </SelectItem>
                      {filteredWarehouseParts.length === 0 ? (
                        <SelectItem value="__empty" disabled>
                          В этой категории пока нет запчастей
                        </SelectItem>
                      ) : (
                        filteredWarehouseParts.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} (остаток: {p.quantity ?? 0})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Количество на склад</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.warehouseInitialQuantity}
                    onChange={(e) => setForm({ ...form, warehouseInitialQuantity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Место хранения</Label>
                  <Input
                    value={form.storageLocation}
                    onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                    placeholder="Стеллаж, зона..."
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
            )}
            <div>
              <Label>Поставщик</Label>
              <Select value={form.supplierId || "none"} onValueChange={(v) => setForm({ ...form, supplierId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Дата</Label><Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
            <div><Label>Заявка №</Label><Input value={form.serviceRequestId} onChange={(e) => setForm({ ...form, serviceRequestId: e.target.value })} placeholder="опционально" /></div>
            <div><Label>Задача №</Label><Input value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })} placeholder="опционально" /></div>
            <div><Label>Примечание</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <Button onClick={save}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
