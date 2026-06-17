import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { mobileTabsGrid3Class, mobileTabsTriggerClass } from "@/lib/mobile-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { maskSensitiveValue, useAccessControl } from "@/hooks/use-access-control";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { SubdivisionsPanel } from "@/components/admin/subdivisions-panel";
import { SubdivisionTransferPanel } from "@/components/admin/subdivision-transfer-panel";
import { SubdivisionPicker } from "@/components/subdivision-picker";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import {
  useWarehouseCategories,
  useWarehouseParts,
  useWarehouseMovements,
  useWarehouseComments,
  useWarehouseMutations,
  useWarehouseActivity,
  usePartReservations,
} from "@/hooks/use-warehouse";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LinkedWorkItem } from "@shared/warehouse-linked-work";
import { useTaskDialog, type TaskRecord } from "@/hooks/use-task-dialog";
import {
  filterMovements,
  WarehouseMovementItem,
} from "@/components/warehouse-movement-item";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";
import {
  Package,
  Plus,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ArrowDownCircle,
  ArrowUpCircle,
  MessageSquare,
  History,
} from "lucide-react";
import type { WarehousePart } from "@shared/schema";
import { CommentThreadList } from "@/components/comment-thread-list";
import { CommentComposer } from "@/components/comment-composer";

function LinkedWorkChip({
  item,
  onOpenTask,
  onNavigate,
}: {
  item: LinkedWorkItem;
  onOpenTask: (taskId: number) => void;
  onNavigate: (href: string) => void;
}) {
  const className =
    "inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";

  if (item.type === "task") {
    return (
      <button type="button" className={className} onClick={() => onOpenTask(item.id)}>
        Задача: {item.title}
      </button>
    );
  }

  const href =
    item.type === "service_request"
      ? `/service-requests/${item.id}`
      : `/schedule`;

  return (
    <button type="button" className={className} onClick={() => onNavigate(href)}>
      {item.type === "service_request" ? "Заявка" : "ТО"}: {item.title}
    </button>
  );
}

function PartStockBadge({
  part,
  onOpenTask,
  onNavigate,
}: {
  part: WarehousePart;
  onOpenTask: (taskId: number) => void;
  onNavigate: (href: string) => void;
}) {
  const qty = part.quantity ?? 0;
  const reserved = part.reservedQuantity ?? 0;
  const min = part.minStock ?? 0;
  const { data: reservations = [] } = usePartReservations(reserved > 0 ? part.id : null);

  if (qty <= 0) {
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
        <XCircle className="w-3 h-3 mr-1" />
        Нет на складе
      </Badge>
    );
  }
  if (min > 0 && qty <= min) {
    return (
      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Ниже минимума
      </Badge>
    );
  }

  return (
    <div className="space-y-1">
      <Badge variant="outline">{qty} шт.</Badge>
      {reserved > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="block w-fit">
              <Badge className="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/60">
                зарезерв. {reserved}
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <p className="text-sm font-medium mb-2">Активные резервы</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {reservations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Загрузка резервов…</p>
              ) : (
                reservations.map((reservation) => (
                  <div key={reservation.id} className="rounded border p-2 text-xs">
                    <p className="font-medium">{reservation.quantity} шт.</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {reservation.linkedWork.map((item) => (
                        <LinkedWorkChip
                          key={`${item.type}-${item.id}`}
                          item={item}
                          onOpenTask={onOpenTask}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

const emptyForm = {
  name: "",
  sapNumber: "",
  inventoryNumber: "",
  categoryId: "",
  subdivisionId: "",
  equipmentId: "",
  storageLocation: "",
  initialQuantity: "",
  minStock: "",
  unitCost: "",
  externalLink: "",
  notes: "",
};

function parseOptionalNumber(value: string, fallback: number | null = null): number | null {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function WarehousePage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { openEdit } = useTaskDialog();
  const { isFieldVisible, isSystemAdmin } = useAccessControl();
  const systemAdmin = isSystemAdmin();
  const showCosts = isFieldVisible("warehouse_costs");
  const showSap = isFieldVisible("warehouse_sap");
  const { allEquipment } = useEquipmentApi();
  const { data: categories = [] } = useWarehouseCategories();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    allowAllOption,
  } = useSubdivisionFilter();
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const { data: parts = [], isLoading } = useWarehouseParts({
    categoryId: categoryFilter !== "all" ? Number(categoryFilter) : undefined,
    subdivisionId: filterSubdivisionId ?? undefined,
    search: search || undefined,
    lowStock: lowStockOnly,
  });
  const partsFilterKey = `${filterValue}-${categoryFilter}-${search}-${lowStockOnly}`;
  const {
    page: partsPage,
    setPage: setPartsPage,
    pageItems: paginatedParts,
    totalPages: partsTotalPages,
    total: partsTotal,
    from: partsFrom,
    to: partsTo,
  } = useListPagination(parts, 25, partsFilterKey);
  const { data: activity = [] } = useWarehouseActivity(30);
  const { data: tasks = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tasks");
      return res.json();
    },
  });
  const {
    createPart,
    updatePart,
    addMovement,
    addComment,
    updateComment,
    deleteComment,
    createCategory,
  } = useWarehouseMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<WarehousePart | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [detailPart, setDetailPart] = useState<WarehousePart | null>(null);
  const { data: movements = [] } = useWarehouseMovements(detailPart?.id ?? null);
  const { data: comments = [] } = useWarehouseComments(detailPart?.id ?? null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveForm, setMoveForm] = useState({
    type: "out" as "in" | "out",
    quantity: "",
    equipmentId: "",
    taskId: "",
    destination: "",
    comment: "",
  });
  const [commentText, setCommentText] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [formNewCategory, setFormNewCategory] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "reserve" | "out">("all");
  const [detailMovementFilter, setDetailMovementFilter] = useState<"all" | "reserve" | "out">("all");

  const openTaskById = useCallback(
    async (taskId: number) => {
      try {
        const res = await apiRequest("GET", `/api/tasks/${taskId}`);
        if (!res.ok) {
          throw new Error("Задача не найдена");
        }
        const task = (await res.json()) as TaskRecord;
        openEdit(task);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Не удалось открыть задачу";
        toast({ title: "Ошибка", description: message, variant: "destructive" });
      }
    },
    [openEdit, toast]
  );

  const navigateTo = useCallback(
    (href: string) => {
      setLocation(href);
    },
    [setLocation]
  );

  const filteredMovements = filterMovements(movements, detailMovementFilter);
  const filteredActivity = filterMovements(activity, activityFilter);

  const renderMovementList = (
    items: typeof movements | typeof activity,
    options?: { showPartName?: boolean; emptyText?: string }
  ) => {
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground">{options?.emptyText ?? "Записей пока нет"}</p>;
    }
    return items.map((m) => (
      <WarehouseMovementItem
        key={m.id}
        movement={m}
        showPartName={options?.showPartName}
        onOpenTask={openTaskById}
        onNavigate={navigateTo}
      />
    ));
  };

  const resetForm = () => {
    setEdit(null);
    setForm(emptyForm);
    setFormNewCategory("");
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditPart = (part: WarehousePart) => {
    setEdit(part);
    setForm({
      name: part.name,
      sapNumber: part.sapNumber ?? "",
      inventoryNumber: part.inventoryNumber ?? "",
      categoryId: part.categoryId ? String(part.categoryId) : "",
      subdivisionId: part.subdivisionId ? String(part.subdivisionId) : "",
      equipmentId: part.equipmentId ?? "",
      storageLocation: part.storageLocation ?? "",
      initialQuantity: "",
      minStock: part.minStock != null ? String(part.minStock) : "",
      unitCost: part.unitCost != null ? String(part.unitCost) : "",
      externalLink: part.externalLink ?? "",
      notes: part.notes ?? "",
    });
    setFormOpen(true);
  };

  const savePart = async () => {
    if (!form.name.trim()) {
      toast({ title: "Укажите название запчасти", variant: "destructive" });
      return;
    }
    let categoryId = form.categoryId && form.categoryId !== "__new__" ? Number(form.categoryId) : null;
    let categoryName: string | null = null;

    if (form.categoryId === "__new__") {
      if (!formNewCategory.trim()) {
        toast({ title: "Укажите название новой категории", variant: "destructive" });
        return;
      }
      try {
        const created = await createCategory.mutateAsync(formNewCategory.trim());
        categoryId = created.id;
        categoryName = created.name;
      } catch {
        toast({ title: "Не удалось создать категорию", variant: "destructive" });
        return;
      }
    } else if (categoryId) {
      categoryName = categories.find((c) => c.id === categoryId)?.name ?? null;
    }

    const eq = allEquipment.find((e) => e.id === form.equipmentId);
    const minStock = parseOptionalNumber(form.minStock, 0) ?? 0;
    const unitCost = parseOptionalNumber(form.unitCost, null);
    const initialQty = parseOptionalNumber(form.initialQuantity, 0) ?? 0;

    if (form.minStock.trim() && parseOptionalNumber(form.minStock, null) === null) {
      toast({ title: "Некорректный минимальный остаток", variant: "destructive" });
      return;
    }
    if (form.unitCost.trim() && unitCost === null) {
      toast({ title: "Некорректная стоимость", variant: "destructive" });
      return;
    }
    if (!edit && form.initialQuantity.trim() && parseOptionalNumber(form.initialQuantity, null) === null) {
      toast({ title: "Некорректное начальное количество", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name.trim(),
      sapNumber: form.sapNumber || null,
      inventoryNumber: form.inventoryNumber || null,
      categoryId,
      categoryName,
      subdivisionId: form.subdivisionId ? Number(form.subdivisionId) : null,
      equipmentId: form.equipmentId || null,
      equipmentName: eq?.name ?? null,
      storageLocation: form.storageLocation || null,
      minStock,
      unitCost,
      externalLink: form.externalLink || null,
      notes: form.notes || null,
      ...(!edit ? { initialQuantity: initialQty } : {}),
    };

    try {
      if (edit) {
        await updatePart.mutateAsync({ id: edit.id, ...payload });
        toast({ title: "Запчасть обновлена" });
      } else {
        await createPart.mutateAsync(payload);
        toast({ title: "Запчасть добавлена на склад" });
      }
      setFormOpen(false);
      resetForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Ошибка сохранения";
      toast({ title: "Ошибка сохранения", description: message, variant: "destructive" });
    }
  };

  const submitMovement = async () => {
    if (!detailPart || !moveForm.quantity) {
      toast({ title: "Укажите количество", variant: "destructive" });
      return;
    }
    const eq = allEquipment.find((e) => e.id === moveForm.equipmentId);
    const selectedTask = tasks.find((t) => String(t.id) === moveForm.taskId);
    try {
      await addMovement.mutateAsync({
        partId: detailPart.id,
        type: moveForm.type,
        quantity: Number(moveForm.quantity),
        equipmentId: moveForm.equipmentId || undefined,
        equipmentName: eq?.name,
        taskId: moveForm.taskId ? Number(moveForm.taskId) : undefined,
        taskTitle: selectedTask?.title,
        destination: moveForm.destination || undefined,
        comment: moveForm.comment || undefined,
      });
      toast({ title: moveForm.type === "in" ? "Приход оформлен" : "Списание оформлено" });
      setMoveOpen(false);
      setMoveForm({ type: "out", quantity: "", equipmentId: "", taskId: "", destination: "", comment: "" });
      setDetailPart((p) => (p ? { ...p, quantity: p.quantity } : null));
    } catch (e: any) {
      toast({ title: e.message ?? "Ошибка операции", variant: "destructive" });
    }
  };

  const submitComment = async () => {
    if (!detailPart || !commentText.trim()) return;
    await addComment.mutateAsync({ partId: detailPart.id, body: commentText.trim() });
    setCommentText("");
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await createCategory.mutateAsync(newCategory.trim());
      setNewCategory("");
      toast({ title: "Категория добавлена" });
    } catch {
      toast({ title: "Не удалось добавить категорию", variant: "destructive" });
    }
  };

  return (
    <>
      <Helmet>
        <title>Склад — StarLine</title>
      </Helmet>
      <div className="p-4 lg:p-6 w-full min-w-0">
        <div className="w-full min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="w-8 h-8" />
                Склад запчастей
              </h1>
              <p className="text-muted-foreground mt-1">Учёт остатков, списаний и закупок</p>
            </div>
            <div className="flex gap-2">
              <SubdivisionsPanel />
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Добавить запчасть
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-4 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <Label>Поиск</Label>
                <Input
                  placeholder="Название, SAP, инв. номер..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {showFilter && (
                <SubdivisionFilterSelect
                  value={filterValue}
                  onChange={setFilterValue}
                  subdivisions={availableSubdivisions}
                  showAll={allowAllOption}
                  className="w-48"
                />
              )}
              <div className="w-48">
                <Label>Категория</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все категории</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant={lowStockOnly ? "default" : "outline"}
                onClick={() => setLowStockOnly(!lowStockOnly)}
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                Только низкий остаток
              </Button>
              <div className="flex gap-2 items-end">
                <Input
                  placeholder="Новая категория"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-40"
                />
                <Button variant="outline" size="sm" onClick={addCategory}>
                  +
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Позиции ({partsTotal})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Загрузка...</p>
              ) : parts.length === 0 ? (
                <p className="text-muted-foreground">Запчастей не найдено</p>
              ) : (
                <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>SAP</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Подразделение</TableHead>
                      <TableHead>Место</TableHead>
                      <TableHead>Остаток</TableHead>
                      <TableHead>Мин.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedParts.map((part) => (
                      <TableRow
                        key={part.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer",
                          (part.quantity ?? 0) <= 0
                            ? "bg-red-50/50 dark:bg-red-950/20"
                            : (part.minStock ?? 0) > 0 && (part.quantity ?? 0) <= (part.minStock ?? 0)
                              ? "bg-amber-50/50 dark:bg-amber-950/20"
                              : ""
                        )}
                        onClick={() => setDetailPart(part)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetailPart(part);
                          }
                        }}
                      >
                        <TableCell className="font-medium">{part.name}</TableCell>
                        <TableCell>{maskSensitiveValue(showSap, part.sapNumber)}</TableCell>
                        <TableCell>{part.categoryName ?? "—"}</TableCell>
                        <TableCell>{part.subdivisionName ?? "—"}</TableCell>
                        <TableCell>{part.storageLocation ?? part.equipmentName ?? "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <PartStockBadge
                            part={part}
                            onOpenTask={openTaskById}
                            onNavigate={navigateTo}
                          />
                        </TableCell>
                        <TableCell>{part.minStock ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ListPaginationControls
                  page={partsPage}
                  totalPages={partsTotalPages}
                  total={partsTotal}
                  from={partsFrom}
                  to={partsTo}
                  onPageChange={setPartsPage}
                />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Журнал движений (резервы и списания)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              <Tabs value={activityFilter} onValueChange={(v) => setActivityFilter(v as typeof activityFilter)}>
                <TabsList className={cn(mobileTabsGrid3Class, "mb-2")}>
                  <TabsTrigger value="all" className={mobileTabsTriggerClass}>Все</TabsTrigger>
                  <TabsTrigger value="reserve" className={mobileTabsTriggerClass}>Резерв</TabsTrigger>
                  <TabsTrigger value="out" className={mobileTabsTriggerClass}>Списание</TabsTrigger>
                </TabsList>
              </Tabs>
              {renderMovementList(filteredActivity, {
                showPartName: true,
                emptyText:
                  activityFilter === "reserve"
                    ? "Резервов пока нет"
                    : activityFilter === "out"
                      ? "Списаний пока нет"
                      : "Записей пока нет",
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen} modal>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" blockOutsideClose>
          <DialogHeader>
            <DialogTitle>{edit ? "Редактировать запчасть" : "Новая запчасть"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Название *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Номер SAP</Label>
                <Input value={form.sapNumber} onChange={(e) => setForm({ ...form, sapNumber: e.target.value })} />
              </div>
              <div>
                <Label>Инв. номер</Label>
                <Input
                  value={form.inventoryNumber}
                  onChange={(e) => setForm({ ...form, inventoryNumber: e.target.value })}
                />
              </div>
            </div>
            <SubdivisionPicker
              value={form.subdivisionId}
              onChange={(id) => setForm({ ...form, subdivisionId: id })}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Категория</Label>
                <Select
                  value={form.categoryId || "none"}
                  onValueChange={(v) => {
                    setForm({ ...form, categoryId: v === "none" ? "" : v });
                    if (v !== "__new__") setFormNewCategory("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без категории</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Новая категория…</SelectItem>
                  </SelectContent>
                </Select>
                {form.categoryId === "__new__" && (
                  <Input
                    placeholder="Название категории"
                    value={formNewCategory}
                    onChange={(e) => setFormNewCategory(e.target.value)}
                  />
                )}
              </div>
              <div>
                <Label>Место хранения</Label>
                <Input
                  value={form.storageLocation}
                  onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                  placeholder="Стеллаж A-12"
                />
              </div>
            </div>
            <div>
              <Label>Связанное оборудование (опционально)</Label>
              <Select value={form.equipmentId || "none"} onValueChange={(v) => setForm({ ...form, equipmentId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не привязано</SelectItem>
                  {allEquipment.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>{eq.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!edit && (
              <div>
                <Label>Начальное количество</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.initialQuantity}
                  onChange={(e) => setForm({ ...form, initialQuantity: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Мин. остаток</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                />
              </div>
              <div>
                <Label>Стоимость (₽)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unitCost}
                  onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Внешняя ссылка (Jira и др.)</Label>
              <Input
                value={form.externalLink}
                onChange={(e) => setForm({ ...form, externalLink: e.target.value })}
                placeholder="https://jira.example.com/..."
              />
            </div>
            <div>
              <Label>Примечание</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Отмена</Button>
              <Button onClick={savePart}>{edit ? "Сохранить" : "Добавить"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailPart} onOpenChange={(o) => !o && setDetailPart(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailPart && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {detailPart.name}
                  <PartStockBadge
                    part={detailPart}
                    onOpenTask={openTaskById}
                    onNavigate={navigateTo}
                  />
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Создал: {detailPart.createdByName ?? "—"} ·{" "}
                  {detailPart.createdAt
                    ? format(new Date(detailPart.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })
                    : "—"}
                </p>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                <div>SAP: {maskSensitiveValue(showSap, detailPart.sapNumber)}</div>
                <div>Инв. №: {detailPart.inventoryNumber ?? "—"}</div>
                <div>Категория: {detailPart.categoryName ?? "—"}</div>
                <div>Подразделение: {detailPart.subdivisionName ?? "—"}</div>
                <div>Место: {detailPart.storageLocation ?? "—"}</div>
                <div>Оборудование: {detailPart.equipmentName ?? "—"}</div>
                <div>Стоимость: {maskSensitiveValue(showCosts, detailPart.unitCost != null ? `${detailPart.unitCost} ₽` : null)}</div>
                {detailPart.externalLink && (
                  <div className="col-span-2">
                    <a
                      href={detailPart.externalLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ссылка на закупку
                    </a>
                  </div>
                )}
              </div>

              {systemAdmin && (
                <SubdivisionTransferPanel
                  entityType="warehouse_part"
                  entityId={detailPart.id}
                  entityLabel={detailPart.name}
                  currentSubdivisionId={detailPart.subdivisionId}
                  onSuccess={() => setDetailPart(null)}
                />
              )}

              <div className="flex gap-2 mb-4">
                <Button size="sm" onClick={() => { setMoveForm({ ...moveForm, type: "in" }); setMoveOpen(true); }}>
                  <ArrowDownCircle className="w-4 h-4 mr-1" />
                  Приход
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setMoveForm({ ...moveForm, type: "out" }); setMoveOpen(true); }}>
                  <ArrowUpCircle className="w-4 h-4 mr-1" />
                  Списание
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEditPart(detailPart)}>
                  Изменить
                </Button>
              </div>

              <Tabs defaultValue="movements">
                <TabsList>
                  <TabsTrigger value="movements">
                    <History className="w-4 h-4 mr-1" />
                    Движения
                  </TabsTrigger>
                  <TabsTrigger value="comments">
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Комментарии
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="movements" className="space-y-2">
                  <Tabs
                    value={detailMovementFilter}
                    onValueChange={(v) => setDetailMovementFilter(v as typeof detailMovementFilter)}
                  >
                    <TabsList className={cn(mobileTabsGrid3Class)}>
                      <TabsTrigger value="all" className={mobileTabsTriggerClass}>Все</TabsTrigger>
                      <TabsTrigger value="reserve" className={mobileTabsTriggerClass}>Резерв</TabsTrigger>
                      <TabsTrigger value="out" className={mobileTabsTriggerClass}>Списание</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {renderMovementList(filteredMovements, {
                      emptyText:
                        detailMovementFilter === "reserve"
                          ? "Резервов по этой запчасти пока нет"
                          : detailMovementFilter === "out"
                            ? "Списаний по этой запчасти пока нет"
                            : "Движений пока нет",
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="comments" className="space-y-3">
                  <CommentThreadList
                    comments={comments}
                    emptyText="Комментариев пока нет"
                    maxHeightClass="max-h-48"
                    multilineEdit={false}
                    onUpdate={async (commentId, body) => {
                      if (!detailPart) return;
                      await updateComment.mutateAsync({
                        partId: detailPart.id,
                        commentId,
                        body,
                      });
                    }}
                    onDelete={async (commentId) => {
                      if (!detailPart) return;
                      await deleteComment.mutateAsync({
                        partId: detailPart.id,
                        commentId,
                      });
                    }}
                  />
                  <CommentComposer
                    variant="simple"
                    text={commentText}
                    onTextChange={setCommentText}
                    isPending={addComment.isPending}
                    placeholder="Написать комментарий…"
                    submitLabel="Отправить комментарий"
                    onSubmit={submitComment}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Movement dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moveForm.type === "in" ? "Приход на склад" : "Списание со склада"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Количество *</Label>
              <Input
                type="number"
                min="0.01"
                step="1"
                value={moveForm.quantity}
                onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })}
              />
            </div>
            {moveForm.type === "out" && (
              <>
                <div>
                  <Label>Оборудование (куда списано)</Label>
                  <Select
                    value={moveForm.equipmentId || "none"}
                    onValueChange={(v) => setMoveForm({ ...moveForm, equipmentId: v === "none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не указано</SelectItem>
                      {allEquipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>{eq.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Задача (если списание по задаче)</Label>
                  <Select
                    value={moveForm.taskId || "none"}
                    onValueChange={(v) => setMoveForm({ ...moveForm, taskId: v === "none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Не выбрана" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не указана</SelectItem>
                      {tasks.map((task) => (
                        <SelectItem key={task.id} value={String(task.id)}>
                          #{task.id} — {task.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Куда / зачем</Label>
                  <Input
                    value={moveForm.destination}
                    onChange={(e) => setMoveForm({ ...moveForm, destination: e.target.value })}
                    placeholder="Ремонт насоса, заявка #123..."
                  />
                </div>
              </>
            )}
            <div>
              <Label>Комментарий</Label>
              <Textarea
                value={moveForm.comment}
                onChange={(e) => setMoveForm({ ...moveForm, comment: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveOpen(false)}>Отмена</Button>
              <Button onClick={submitMovement}>Подтвердить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
