import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { maskSensitiveValue, useAccessControl } from "@/hooks/use-access-control";
import {
  useBudgetEntries,
  useBudgetSummary,
  useBudgetMutations,
  useBudgetCategories,
  useBudgetCategoryMutations,
  useSuppliers,
  useSupplierMutations,
} from "@/hooks/use-asset-management";
import { useWarehouseParts, useWarehouseCategories } from "@/hooks/use-warehouse";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { useServiceRequests } from "@/hooks/use-service-requests";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { SubdivisionPicker } from "@/components/subdivision-picker";
import {
  emptySupplierForm,
  SupplierFormFields,
  type SupplierFormValues,
} from "@/components/supplier-form-fields";
import { buildSupplierCreatePayload } from "@/lib/supplier-form-payload";
import { useTaskDialog } from "@/hooks/use-task-dialog";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { BUDGET_CATEGORIES, budgetCategoryLabel } from "@shared/asset-constants";
import { warehouseCategoryForBudget } from "@shared/warehouse-constants";
import { buildEquipmentLinkPayload } from "@/lib/contact-supplier-utils";
import {
  Wallet,
  Plus,
  Trash2,
  ChevronDown,
  Package,
  ExternalLink,
  FileEdit,
} from "lucide-react";
import type { BudgetEntry, Task } from "@shared/schema";

const formDialogClass =
  "max-w-lg w-[min(100vw-2rem,32rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden";

export default function BudgetPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { isFieldVisible } = useAccessControl();
  const showAmounts = isFieldVisible("budget_amounts");
  const { openEdit: openTaskDialog } = useTaskDialog();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
  } = useSubdivisionFilter();
  const { data: subdivisions = [] } = useSubdivisions();

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
    subdivisionId: filterSubdivisionId ?? undefined,
  };

  const { data: entries = [], isLoading } = useBudgetEntries(filters);
  const { data: summary } = useBudgetSummary(equipmentFilter !== "all" ? equipmentFilter : undefined);
  const { create, update, remove } = useBudgetMutations();
  const { create: createBudgetCategory } = useBudgetCategoryMutations();
  const { create: createSupplier } = useSupplierMutations();
  const { data: budgetCustomCategories = [] } = useBudgetCategories();
  const { allEquipment } = useEquipmentApi();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouseParts = [] } = useWarehouseParts();
  const { data: warehouseCategories = [] } = useWarehouseCategories();
  const { data: serviceRequests = [] } = useServiceRequests();
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tasks");
      return res.json();
    },
  });

  const [open, setOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<BudgetEntry | null>(null);
  const [edit, setEdit] = useState<BudgetEntry | null>(null);
  const [linkMode, setLinkMode] = useState<"equipment" | "warehouse">("equipment");
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState<SupplierFormValues>(emptySupplierForm());
  const [formNewCategory, setFormNewCategory] = useState("");
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "parts",
    subdivisionId: "",
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
    externalLink: "",
    approvalLink: "",
  });

  const builtInCategoryCodes = useMemo(
    () => new Set<string>(BUDGET_CATEGORIES.map((c) => c.code)),
    []
  );

  const customCategoriesForSelect = useMemo(() => {
    const builtInLabels = new Set(BUDGET_CATEGORIES.map((c) => c.label.toLowerCase()));
    return budgetCustomCategories.filter(
      (c) => !builtInCategoryCodes.has(c.name) && !builtInLabels.has(c.name.toLowerCase())
    );
  }, [budgetCustomCategories, builtInCategoryCodes]);

  const orphanFormCategory =
    form.category &&
    form.category !== "__new__" &&
    !builtInCategoryCodes.has(form.category) &&
    !customCategoriesForSelect.some((c) => c.name === form.category)
      ? form.category
      : null;

  const isPartsCategory = form.category === "parts";
  const showWarehouseSection = isPartsCategory || linkMode === "warehouse";

  const filteredWarehouseParts = useMemo(() => {
    let list = warehouseParts;
    if (form.warehouseCategoryId) {
      list = list.filter((p) => String(p.categoryId) === form.warehouseCategoryId);
    }
    if (form.subdivisionId) {
      const subId = Number(form.subdivisionId);
      list = list.filter((p) => !p.subdivisionId || p.subdivisionId === subId);
    }
    return list;
  }, [warehouseParts, form.warehouseCategoryId, form.subdivisionId]);

  const filteredTasks = useMemo(() => {
    if (!form.subdivisionId) return tasks;
    const subId = Number(form.subdivisionId);
    return tasks.filter((t) => !t.subdivisionId || t.subdivisionId === subId);
  }, [tasks, form.subdivisionId]);

  const filteredServiceRequests = useMemo(() => {
    if (!form.subdivisionId) return serviceRequests;
    const subId = Number(form.subdivisionId);
    return serviceRequests.filter((sr) => !sr.subdivisionId || sr.subdivisionId === subId);
  }, [serviceRequests, form.subdivisionId]);

  const selectedWarehouseCategory = warehouseCategories.find(
    (c) => String(c.id) === form.warehouseCategoryId
  );

  const subdivisionName = useCallback(
    (id: number | null | undefined) =>
      subdivisions.find((s) => s.id === id)?.name ?? null,
    [subdivisions]
  );

  useEffect(() => {
    if (!showWarehouseSection || warehouseCategories.length === 0) return;
    const name = warehouseCategoryForBudget(form.category);
    const cat = warehouseCategories.find((c) => c.name === name);
    if (cat && String(cat.id) !== form.warehouseCategoryId) {
      setForm((f) => ({ ...f, warehouseCategoryId: String(cat.id), warehousePartId: "" }));
    }
  }, [showWarehouseSection, form.category, warehouseCategories, form.warehouseCategoryId]);

  useEffect(() => {
    if (isPartsCategory) {
      setLinkMode("warehouse");
    }
  }, [isPartsCategory]);

  useEffect(() => {
    if (!form.equipmentId) return;
    const eq = allEquipment.find((e) => e.id === form.equipmentId);
    if (eq?.subdivisionId && !form.subdivisionId) {
      setForm((f) => ({ ...f, subdivisionId: String(eq.subdivisionId) }));
    }
  }, [form.equipmentId, allEquipment, form.subdivisionId]);

  useEffect(() => {
    if (isLoading || entries.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const entryId = Number(params.get("entry"));
    if (!Number.isFinite(entryId) || entryId <= 0) return;
    const entry = entries.find((e) => e.id === entryId);
    if (entry) setDetailEntry(entry);
  }, [isLoading, entries]);

  const reset = () => {
    setEdit(null);
    setLinkMode("equipment");
    setWarehouseOpen(false);
    setFormNewCategory("");
    setShowNewSupplierForm(false);
    setNewSupplier(emptySupplierForm());
    setForm({
      title: "",
      amount: "",
      category: "parts",
      subdivisionId: filterSubdivisionId ? String(filterSubdivisionId) : "",
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
      externalLink: "",
      approvalLink: "",
    });
  };

  const openEdit = (e: BudgetEntry) => {
    setEdit(e);
    const mode = e.storageLocation || e.warehousePartId || e.category === "parts" ? "warehouse" : "equipment";
    setLinkMode(mode);
    setWarehouseOpen(Boolean(e.warehousePartId || e.storageLocation));
    const linkedPart = e.warehousePartId
      ? warehouseParts.find((p) => p.id === e.warehousePartId)
      : undefined;
    setForm({
      title: e.title,
      amount: String(e.amount),
      category: e.category,
      subdivisionId: e.subdivisionId ? String(e.subdivisionId) : "",
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
      externalLink: e.externalLink ?? "",
      approvalLink: e.approvalLink ?? "",
    });
    setOpen(true);
  };

  const toggleNewSupplierForm = () => {
    if (showNewSupplierForm) {
      setShowNewSupplierForm(false);
      setNewSupplier(emptySupplierForm());
      return;
    }
    setNewSupplier({
      ...emptySupplierForm(),
      subdivisionIds: form.subdivisionId ? [Number(form.subdivisionId)] : [],
      equipmentIds: form.equipmentId ? [form.equipmentId] : [],
    });
    setShowNewSupplierForm(true);
  };

  const saveSupplierInline = async () => {
    if (!newSupplier.name.trim()) {
      toast({ title: "Укажите название поставщика", variant: "destructive" });
      return;
    }
    try {
      const payload = buildSupplierCreatePayload(newSupplier, allEquipment);
      if (!payload.subdivisionIds.length && form.subdivisionId) {
        payload.subdivisionIds = [Number(form.subdivisionId)];
      }
      if (!payload.equipmentIds.length && form.equipmentId) {
        const link = buildEquipmentLinkPayload([form.equipmentId], allEquipment);
        Object.assign(payload, link);
      }
      const created = await createSupplier.mutateAsync(payload);
      setForm((f) => ({ ...f, supplierId: String(created.id) }));
      setShowNewSupplierForm(false);
      setNewSupplier(emptySupplierForm());
      toast({ title: "Поставщик добавлен", description: "Выбран в этой затрате" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка";
      toast({ title: "Не удалось создать поставщика", description: message, variant: "destructive" });
    }
  };

  const save = async () => {
    if (!form.title.trim() || !form.amount) {
      toast({ title: "Заполните название и сумму", variant: "destructive" });
      return;
    }
    const eq = allEquipment.find((e) => e.id === form.equipmentId);
    const part = warehouseParts.find((p) => String(p.id) === form.warehousePartId);
    const qty = form.warehouseInitialQuantity.trim() ? Number(form.warehouseInitialQuantity) : 1;
    const linkWarehouse = showWarehouseSection;

    if (linkWarehouse && !Number.isFinite(qty)) {
      toast({ title: "Некорректное количество для склада", variant: "destructive" });
      return;
    }
    if (linkWarehouse && !form.warehouseCategoryId) {
      toast({ title: "Выберите категорию запчасти на складе", variant: "destructive" });
      return;
    }

    let category = form.category;
    if (category === "__new__") {
      if (!formNewCategory.trim()) {
        toast({ title: "Укажите название новой категории", variant: "destructive" });
        return;
      }
      try {
        const created = await createBudgetCategory.mutateAsync(formNewCategory.trim());
        category = created.name;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Ошибка";
        toast({ title: "Не удалось создать категорию", description: message, variant: "destructive" });
        return;
      }
    }

    const subId = form.subdivisionId ? Number(form.subdivisionId) : null;
    const payload = {
      title: form.title.trim(),
      amount: Number(form.amount),
      category,
      subdivisionId: subId,
      subdivisionName: subId ? subdivisionName(subId) : null,
      equipmentId: form.equipmentId || null,
      equipmentName: eq?.name ?? null,
      warehousePartId: linkWarehouse && form.warehousePartId ? Number(form.warehousePartId) : null,
      storageLocation: linkWarehouse ? (form.storageLocation || part?.storageLocation || null) : null,
      linkToWarehouse: linkWarehouse,
      warehouseInitialQuantity: linkWarehouse ? qty : undefined,
      warehouseCategoryId: linkWarehouse && form.warehouseCategoryId ? Number(form.warehouseCategoryId) : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      expenseDate: form.expenseDate,
      notes: form.notes || null,
      serviceRequestId: form.serviceRequestId ? Number(form.serviceRequestId) : null,
      taskId: form.taskId ? Number(form.taskId) : null,
      externalLink: form.externalLink.trim() || null,
      approvalLink: form.approvalLink.trim() || null,
      currency: "RUB",
    };

    try {
      if (edit) await update.mutateAsync({ id: edit.id, ...payload });
      else await create.mutateAsync(payload);
      const catLabel = selectedWarehouseCategory?.name ?? warehouseCategoryForBudget(category);
      toast({
        title: "Сохранено",
        description:
          linkWarehouse
            ? form.warehousePartId
              ? `Приход оформлен на складе (${catLabel})`
              : `Запчасть «${form.title.trim()}» добавлена на склад в категории «${catLabel}»`
            : undefined,
      });
      setOpen(false);
      setDetailEntry(null);
      reset();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка";
      toast({ title: "Ошибка", description: message, variant: "destructive" });
    }
  };

  const openTaskById = async (taskId: number) => {
    try {
      const res = await apiRequest("GET", `/api/tasks/${taskId}`);
      const task = await res.json();
      openTaskDialog(task);
    } catch {
      toast({ title: "Не удалось открыть задачу", variant: "destructive" });
    }
  };

  const supplierName = (id: number | null | undefined) =>
    suppliers.find((s) => s.id === id)?.name ?? null;

  const bindingLabel = (e: BudgetEntry) => {
    const parts: string[] = [];
    if (e.equipmentName) parts.push(e.equipmentName);
    if (e.warehousePartId) {
      const wp = warehouseParts.find((p) => p.id === e.warehousePartId);
      parts.push(`Склад: ${wp?.name ?? e.storageLocation ?? "—"}`);
    } else if (e.storageLocation) {
      parts.push(`Склад: ${e.storageLocation}`);
    }
    if (e.subdivisionName) parts.push(e.subdivisionName);
    return parts.length ? parts.join(" · ") : "—";
  };

  const renderFormFields = () => (
    <div className="grid gap-3">
      <div>
        <Label>Название *</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <Label>Сумма (₽) *</Label>
        <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <div>
        <Label>Категория</Label>
        <Select
          value={form.category}
          onValueChange={(v) => {
            setForm({ ...form, category: v });
            if (v !== "__new__") setFormNewCategory("");
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {BUDGET_CATEGORIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
            {customCategoriesForSelect.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
            {orphanFormCategory && (
              <SelectItem value={orphanFormCategory}>{orphanFormCategory}</SelectItem>
            )}
            <SelectItem value="__new__">+ Новая категория…</SelectItem>
          </SelectContent>
        </Select>
        {form.category === "__new__" && (
          <Input
            className="mt-2"
            placeholder="Название категории"
            value={formNewCategory}
            onChange={(e) => setFormNewCategory(e.target.value)}
          />
        )}
      </div>

      <SubdivisionPicker
        value={form.subdivisionId}
        onChange={(subdivisionId) => setForm({ ...form, subdivisionId })}
        allowEmpty
        allowedIds={availableSubdivisions.map((s) => s.id)}
      />

      <div>
        <Label>Оборудование (актив)</Label>
        <Select
          value={form.equipmentId || "none"}
          onValueChange={(v) => setForm({ ...form, equipmentId: v === "none" ? "" : v })}
        >
          <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {allEquipment.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isPartsCategory && (
        <div>
          <Label>Привязка затрат</Label>
          <Select value={linkMode} onValueChange={(v) => setLinkMode(v as "equipment" | "warehouse")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="equipment">Только оборудование</SelectItem>
              <SelectItem value="warehouse">К складу (без оборудования)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showWarehouseSection && (
        <Collapsible open={warehouseOpen} onOpenChange={setWarehouseOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                {isPartsCategory ? "Склад — запчасть добавится автоматически" : "Склад — категория и запчасть"}
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", warehouseOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3 rounded-lg border p-3 bg-muted/30">
            <div>
              <Label>Категория на складе *</Label>
              <Select
                value={form.warehouseCategoryId || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, warehouseCategoryId: v === "none" ? "" : v, warehousePartId: "" })
                }
              >
                <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                <SelectContent>
                  {warehouseCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Запчасть</Label>
              <Select
                value={form.warehousePartId || "new"}
                onValueChange={(v) => setForm({ ...form, warehousePartId: v === "new" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Создать новую или выбрать" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">+ Создать новую: «{form.title.trim() || "название расхода"}»</SelectItem>
                  {filteredWarehouseParts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} (остаток: {p.quantity ?? 0})
                    </SelectItem>
                  ))}
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
        <div className="flex items-center justify-between gap-2 mb-1">
          <Label>Поставщик</Label>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={toggleNewSupplierForm}
          >
            <Plus className="h-3 w-3 mr-1" />
            {showNewSupplierForm ? "Скрыть форму" : "Новый поставщик"}
          </Button>
        </div>
        <Select value={form.supplierId || "none"} onValueChange={(v) => setForm({ ...form, supplierId: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showNewSupplierForm && (
          <div className="mt-3 rounded-lg border p-3 bg-muted/30 space-y-3">
            <p className="text-xs text-muted-foreground">
              Полная карточка поставщика — как на странице «Поставщики». После сохранения он будет выбран в этой
              затрате, остальные поля затраты не сбросятся.
            </p>
            <SupplierFormFields
              value={newSupplier}
              onChange={setNewSupplier}
              equipment={allEquipment}
            />
            <div className="flex gap-2 pt-1">
              <Button type="button" size="sm" onClick={saveSupplierInline} disabled={createSupplier.isPending}>
                Добавить поставщика
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={toggleNewSupplierForm}>
                Отмена
              </Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <Label>Дата</Label>
        <Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
      </div>

      <div>
        <Label>Заявка на обслуживание</Label>
        <Select
          value={form.serviceRequestId || "none"}
          onValueChange={(v) => setForm({ ...form, serviceRequestId: v === "none" ? "" : v })}
        >
          <SelectTrigger><SelectValue placeholder="Не выбрана" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {filteredServiceRequests.map((sr) => (
              <SelectItem key={sr.id} value={String(sr.id)}>
                #{sr.id} — {sr.equipmentName}: {sr.problemDescription.slice(0, 60)}
                {sr.problemDescription.length > 60 ? "…" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Задача</Label>
        <Select value={form.taskId || "none"} onValueChange={(v) => setForm({ ...form, taskId: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Не выбрана" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {filteredTasks.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                #{t.id} — {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Ссылка на товар в магазине</Label>
        <Input
          type="url"
          value={form.externalLink}
          onChange={(e) => setForm({ ...form, externalLink: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div>
        <Label>Ссылка на согласование / закупку</Label>
        <Input
          type="url"
          value={form.approvalLink}
          onChange={(e) => setForm({ ...form, approvalLink: e.target.value })}
          placeholder="https://..."
        />
      </div>

      <div>
        <Label>Примечание</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
      </div>

      <Button onClick={save}>Сохранить</Button>
    </div>
  );

  return (
    <>
      <Helmet><title>Затраты (Бюджет) — StarLine</title></Helmet>
      <main className="p-4 lg:p-6 w-full min-w-0 space-y-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wallet className="h-8 w-8 text-green-600" />
            <div>
              <h1 className="text-2xl font-bold">Затраты (Бюджет)</h1>
              <p className="text-sm text-gray-500">Закупки и затраты с привязкой к оборудованию, складу и задачам</p>
            </div>
          </div>
          <Button onClick={() => { reset(); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Добавить расход
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Итого за период</p>
              <p className="text-2xl font-bold">
                {maskSensitiveValue(showAmounts, entries.reduce((s, e) => s + e.amount, 0).toLocaleString("ru") + " ₽")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Записей</p>
              <p className="text-2xl font-bold">{entries.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Всего по активу</p>
              <p className="text-2xl font-bold">
                {maskSensitiveValue(showAmounts, (summary?.total ?? 0).toLocaleString("ru") + " ₽")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Фильтры</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-5 gap-4">
            {showFilter && (
              <SubdivisionFilterSelect
                value={filterValue}
                onChange={setFilterValue}
                subdivisions={availableSubdivisions}
              />
            )}
            <div>
              <Label>Оборудование</Label>
              <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  {allEquipment.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Категория</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  {BUDGET_CATEGORIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                  {customCategoriesForSelect.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
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
            {isLoading ? (
              <p>Загрузка…</p>
            ) : entries.length === 0 ? (
              <p className="text-muted-foreground">Расходов не найдено</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Привязка</TableHead>
                    <TableHead>Поставщик</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => setDetailEntry(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setDetailEntry(e);
                        }
                      }}
                    >
                      <TableCell>{e.expenseDate}</TableCell>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{budgetCategoryLabel(e.category)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{bindingLabel(e)}</TableCell>
                      <TableCell>{supplierName(e.supplierId) ?? "—"}</TableCell>
                      <TableCell>{maskSensitiveValue(showAmounts, e.amount.toLocaleString("ru") + " ₽")}</TableCell>
                      <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                            <FileEdit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
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
        <DialogContent className={formDialogClass}>
          <DialogHeader>
            <DialogTitle>{edit ? "Редактировать расход" : "Новый расход"}</DialogTitle>
          </DialogHeader>
          {renderFormFields()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailEntry} onOpenChange={(o) => !o && setDetailEntry(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detailEntry && (
            <>
              <DialogHeader>
                <DialogTitle>{detailEntry.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{budgetCategoryLabel(detailEntry.category)}</Badge>
                  <Badge variant="secondary">{detailEntry.expenseDate}</Badge>
                </div>
                <p>
                  <span className="text-muted-foreground">Сумма: </span>
                  <span className="font-semibold">
                    {maskSensitiveValue(showAmounts, detailEntry.amount.toLocaleString("ru") + " ₽")}
                  </span>
                </p>
                {detailEntry.subdivisionName && (
                  <p><span className="text-muted-foreground">Подразделение: </span>{detailEntry.subdivisionName}</p>
                )}
                {detailEntry.equipmentName && (
                  <p><span className="text-muted-foreground">Оборудование: </span>{detailEntry.equipmentName}</p>
                )}
                {detailEntry.warehousePartId && (
                  <p>
                    <span className="text-muted-foreground">Склад: </span>
                    {warehouseParts.find((p) => p.id === detailEntry.warehousePartId)?.name ?? detailEntry.storageLocation ?? "—"}
                  </p>
                )}
                {supplierName(detailEntry.supplierId) && (
                  <p><span className="text-muted-foreground">Поставщик: </span>{supplierName(detailEntry.supplierId)}</p>
                )}
                {detailEntry.serviceRequestId && (
                  <p>
                    <span className="text-muted-foreground">Заявка: </span>
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => navigate(`/service-requests/${detailEntry.serviceRequestId}`)}
                    >
                      #{detailEntry.serviceRequestId}
                    </button>
                  </p>
                )}
                {detailEntry.taskId && (
                  <p>
                    <span className="text-muted-foreground">Задача: </span>
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => openTaskById(detailEntry.taskId!)}
                    >
                      #{detailEntry.taskId}
                    </button>
                  </p>
                )}
                {detailEntry.externalLink && (
                  <p>
                    <span className="text-muted-foreground">Товар: </span>
                    <a
                      href={detailEntry.externalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      Открыть <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                )}
                {detailEntry.approvalLink && (
                  <p>
                    <span className="text-muted-foreground">Согласование: </span>
                    <a
                      href={detailEntry.approvalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      Открыть <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                )}
                {detailEntry.notes && (
                  <p><span className="text-muted-foreground">Примечание: </span>{detailEntry.notes}</p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setDetailEntry(null)}>Закрыть</Button>
                <Button onClick={() => { openEdit(detailEntry); setDetailEntry(null); }}>
                  <FileEdit className="h-4 w-4 mr-2" />
                  Редактировать
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}
