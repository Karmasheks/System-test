import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAccessControl } from "@/hooks/use-access-control";
import { useProductionDisplayConfig } from "@/hooks/use-production-display-config";
import {
  useProductionProducts,
  useProductionTooling,
  useProductionMutations,
  type ProductWithSubs,
} from "@/hooks/use-production-planning";
import { cn } from "@/lib/utils";
import { Plus, Package } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { formatCavitiesDisplay } from "@shared/cavities-utils";
import type {
  ProductCatalogCustomField,
  ProductCatalogDisplayConfig,
} from "@shared/production-display-config";
import {
  getFormCustomFields,
  getTableCustomFields,
} from "@shared/production-display-config";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";
import { ToolingPfPicker } from "@/components/planning/tooling-pf-picker";

type Props = {
  subdivisionId: number;
};

function ProductMetricLines({
  lines,
}: {
  lines: Array<{ label: string; value: ReactNode }>;
}) {
  if (lines.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className="space-y-1 text-xs whitespace-normal">
      {lines.map((line) => (
        <div key={line.label} className="leading-snug">
          <span className="text-muted-foreground">{line.label}: </span>
          {line.value}
        </div>
      ))}
    </div>
  );
}

function useProductCatalogColumns(catalog: ProductCatalogDisplayConfig) {
  return useMemo(() => {
    const tableCustomFields = getTableCustomFields(catalog);
    const showWeights = catalog.showProductWeight || catalog.showSprueWeight;
    const showNorms =
      catalog.showShiftNorm || catalog.showCycleTime || catalog.showCavities;
    const columns = [{ id: "sap", label: "SAP / наименование" }];
    if (catalog.showPfTooling) columns.push({ id: "pf", label: "ПФ / оснастка" });
    if (showWeights) columns.push({ id: "weights", label: "Вес и литник" });
    if (showNorms) columns.push({ id: "norms", label: "Нормы и цикл" });
    for (const field of tableCustomFields) {
      columns.push({
        id: `custom_${field.id}`,
        label: field.unit ? `${field.label}, ${field.unit}` : field.label,
      });
    }
    return { columns, showWeights, showNorms, tableCustomFields };
  }, [catalog]);
}

function formatCustomFieldValue(
  field: ProductCatalogCustomField,
  raw: string | number | null | undefined
): ReactNode {
  if (raw == null || raw === "") return "—";
  if (field.fieldType === "number") {
    return (
      <span className="tabular-nums">
        {typeof raw === "number" ? raw.toLocaleString("ru-RU") : raw}
        {field.unit ? ` ${field.unit}` : ""}
      </span>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{String(raw)}</span>;
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: ProductCatalogCustomField;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = field.unit ? `${field.label}, ${field.unit}` : field.label;
  if (field.fieldType === "textarea") {
    return (
      <div className="space-y-1">
        <Label>
          {label}
          {field.required ? " *" : ""}
        </Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {field.required ? " *" : ""}
      </Label>
      <Input
        type={field.fieldType === "number" ? "number" : "text"}
        step={field.fieldType === "number" ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.required ? "Обязательно" : "Необязательно"}
      />
    </div>
  );
}

export function PlanningProductsTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");
  const { config, isLoading: settingsLoading } = useProductionDisplayConfig(subdivisionId);
  const catalog = config.productCatalog;
  const { columns, showWeights, showNorms, tableCustomFields } = useProductCatalogColumns(catalog);
  const formCustomFields = useMemo(() => getFormCustomFields(catalog), [catalog]);

  const [search, setSearch] = useState("");
  const { data: products = [], isLoading } = useProductionProducts({
    subdivisionId,
    search: search.trim() || undefined,
    activeOnly: false,
  });
  const { data: tooling = [] } = useProductionTooling(subdivisionId);

  const {
    page,
    setPage,
    pageItems: productPageItems,
    totalPages,
    total: productsTotal,
    from,
    to,
  } = useListPagination(products, 25, `${subdivisionId}-${search}`);

  const { createProduct, updateProduct } = useProductionMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithSubs | null>(null);
  const [form, setForm] = useState({
    sapCode: "",
    name: "",
    toolingId: "",
    productWeight: "",
    sprueWeight: "",
    customAttributes: {} as Record<string, string>,
  });

  const resetForm = () => {
    setForm({
      sapCode: "",
      name: "",
      toolingId: "",
      productWeight: "",
      sprueWeight: "",
      customAttributes: {},
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (p: ProductWithSubs) => {
    setEditing(p);
    const linked = tooling.find((t) => t.pfNumber === p.pfNumber);
    const cavities = p.cavities ?? linked?.cavities ?? 1;
    let sprueWeight = p.sprueWeight;
    if (sprueWeight == null && p.shotWeight != null && p.productWeight != null) {
      sprueWeight = Math.max(0, p.shotWeight - p.productWeight * cavities);
    }
    setForm({
      sapCode: p.sapCode,
      name: p.name,
      toolingId: linked ? String(linked.id) : "",
      productWeight: p.productWeight != null ? String(p.productWeight) : "",
      sprueWeight: sprueWeight != null ? String(sprueWeight) : "",
      customAttributes: Object.fromEntries(
        formCustomFields.map((f) => {
          const raw = p.customAttributes?.[f.id];
          return [f.id, raw != null ? String(raw) : ""];
        })
      ),
    });
    setOpen(true);
  };

  const handleSaveProduct = async () => {
    try {
      for (const field of formCustomFields) {
        if (field.required && !form.customAttributes[field.id]?.trim()) {
          toast({
            title: `Заполните поле «${field.label}»`,
            variant: "destructive",
          });
          return;
        }
      }

      const selectedTooling = tooling.find((t) => String(t.id) === form.toolingId);
      const cavities = selectedTooling?.cavities ?? editing?.cavities ?? 1;
      const productWeight =
        catalog.showProductWeight && form.productWeight
          ? Number(form.productWeight)
          : undefined;
      const sprueWeight =
        catalog.showSprueWeight && form.sprueWeight ? Number(form.sprueWeight) : undefined;
      const shotWeight =
        productWeight != null && sprueWeight != null
          ? productWeight * cavities + sprueWeight
          : undefined;

      const customAttributes: Record<string, string | number | null> = {
        ...(editing?.customAttributes ?? {}),
      };
      for (const field of formCustomFields) {
        const raw = form.customAttributes[field.id]?.trim() ?? "";
        if (!raw) {
          delete customAttributes[field.id];
          continue;
        }
        customAttributes[field.id] =
          field.fieldType === "number" ? Number(raw) : raw;
      }

      const payload = {
        subdivisionId,
        sapCode: form.sapCode.trim(),
        name: form.name.trim(),
        pfNumber: catalog.showPfTooling ? selectedTooling?.pfNumber ?? undefined : undefined,
        cycleTimeSec:
          catalog.showCycleTime ? selectedTooling?.cycleTimeSec ?? undefined : undefined,
        cavities: catalog.showCavities ? selectedTooling?.cavities ?? undefined : undefined,
        productWeight,
        sprueWeight,
        shotWeight,
        customAttributes: Object.keys(customAttributes).length > 0 ? customAttributes : {},
        isActive: true,
        subdivisionIds: [subdivisionId],
      };

      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Изделие обновлено" });
      } else {
        await createProduct.mutateAsync(payload);
        toast({ title: "Изделие создано" });
      }
      setOpen(false);
      resetForm();
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  const colSpan = columns.length;
  const loading = isLoading || settingsLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="space-y-1">
          <Label>Поиск изделия / SAP</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SAP, название…"
            className="w-[280px]"
          />
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Новое изделие
          </Button>
        )}
      </div>

      <div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.id} className="min-w-[140px]">
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : productsTotal === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                    Нет изделий. Создайте изделие или привяжите через оснастку/ПФ.
                  </TableCell>
                </TableRow>
              ) : (
                productPageItems.map((p) => {
                  const linked = tooling.find((t) => t.pfNumber === p.pfNumber);
                  const sprue =
                    p.sprueWeight ??
                    (p.shotWeight != null && p.productWeight != null
                      ? Math.max(0, p.shotWeight - p.productWeight * (p.cavities ?? 1))
                      : null);

                  const weightLines = [];
                  if (catalog.showProductWeight) {
                    weightLines.push({
                      label: "Вес изд.",
                      value: (
                        <span className="tabular-nums">{p.productWeight ?? "—"} г</span>
                      ),
                    });
                  }
                  if (catalog.showSprueWeight) {
                    weightLines.push({
                      label: "Литник",
                      value: <span className="tabular-nums">{sprue ?? "—"} г</span>,
                    });
                  }

                  const normLines = [];
                  if (catalog.showShiftNorm) {
                    normLines.push({
                      label: "Норма 11 ч",
                      value: (
                        <span className="tabular-nums">
                          {p.defaultShiftNorm?.toLocaleString("ru-RU") ?? "—"}
                        </span>
                      ),
                    });
                  }
                  if (catalog.showCycleTime) {
                    normLines.push({
                      label: "Цикл",
                      value: (
                        <span className="tabular-nums">
                          {p.cycleTimeSec ?? linked?.cycleTimeSec ?? "—"} сек
                        </span>
                      ),
                    });
                  }
                  if (catalog.showCavities) {
                    normLines.push({
                      label: "Гнёзда",
                      value: (
                        <span className="tabular-nums">
                          {linked
                            ? formatCavitiesDisplay(linked)
                            : p.cavities ?? "—"}
                        </span>
                      ),
                    });
                  }

                  return (
                    <TableRow
                      key={p.id}
                      className={cn(
                        canEdit && "cursor-pointer hover:bg-muted/50",
                        "align-top"
                      )}
                      onClick={() => canEdit && openEdit(p)}
                    >
                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1 py-0.5 max-w-[240px]">
                          <div className="font-mono text-sm font-semibold tracking-wide text-foreground tabular-nums">
                            {p.sapCode}
                          </div>
                          <div
                            className="text-sm text-muted-foreground leading-snug line-clamp-3"
                            title={p.name}
                          >
                            {p.name?.trim() || "Без названия"}
                          </div>
                        </div>
                      </TableCell>
                      {catalog.showPfTooling && (
                        <TableCell className="align-top whitespace-normal">
                          {linked || p.pfNumber ? (
                            <div className="space-y-1 text-xs max-w-[220px]">
                              <div className="font-mono text-blue-700 dark:text-blue-300">
                                {p.pfNumber ?? linked?.pfNumber ?? "—"}
                              </div>
                              {linked && (
                                <div
                                  className="text-sm leading-snug line-clamp-2"
                                  title={linked.name}
                                >
                                  {linked.name}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Не привязано</span>
                          )}
                        </TableCell>
                      )}
                      {showWeights && (
                        <TableCell className="align-top">
                          <ProductMetricLines lines={weightLines} />
                        </TableCell>
                      )}
                      {showNorms && (
                        <TableCell className="align-top">
                          <ProductMetricLines lines={normLines} />
                        </TableCell>
                      )}
                      {tableCustomFields.map((field) => (
                        <TableCell key={field.id} className="align-top text-xs">
                          {formatCustomFieldValue(field, p.customAttributes?.[field.id])}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <ListPaginationControls
          page={page}
          totalPages={totalPages}
          total={productsTotal}
          from={from}
          to={to}
          onPageChange={setPage}
        />
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) resetForm();
          setOpen(v);
        }}
      >
        <DialogContent className="max-w-lg max-h-[min(90vh,720px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editing ? "Карточка изделия" : "Новое изделие"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>SAP-код</Label>
              <Input
                value={form.sapCode}
                onChange={(e) => setForm({ ...form, sapCode: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Наименование</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            {catalog.showPfTooling && (
              <div className="space-y-1">
                <Label>ПФ / оснастка</Label>
                <ToolingPfPicker
                  tooling={tooling}
                  value={form.toolingId}
                  onChange={(toolingId) => setForm({ ...form, toolingId })}
                />
                <p className="text-xs text-muted-foreground">
                  Необязательно. Цикл и гнёзда — в карточке ПФ при включённых полях.
                </p>
              </div>
            )}
            {(catalog.showProductWeight || catalog.showSprueWeight) && (
              <div
                className={cn(
                  "grid gap-3",
                  catalog.showProductWeight && catalog.showSprueWeight
                    ? "grid-cols-2"
                    : "grid-cols-1"
                )}
              >
                {catalog.showProductWeight && (
                  <div className="space-y-1">
                    <Label>Вес изделия, г</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.productWeight}
                      onChange={(e) => setForm({ ...form, productWeight: e.target.value })}
                      placeholder="Необязательно"
                    />
                  </div>
                )}
                {catalog.showSprueWeight && (
                  <div className="space-y-1">
                    <Label>Вес литника, г</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.sprueWeight}
                      onChange={(e) => setForm({ ...form, sprueWeight: e.target.value })}
                      placeholder="Необязательно"
                    />
                    <p className="text-xs text-muted-foreground">
                      На одну отливку; необязательно
                    </p>
                  </div>
                )}
              </div>
            )}
            {formCustomFields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={form.customAttributes[field.id] ?? ""}
                onChange={(value) =>
                  setForm({
                    ...form,
                    customAttributes: { ...form.customAttributes, [field.id]: value },
                  })
                }
              />
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={handleSaveProduct}
              disabled={
                !form.sapCode.trim() ||
                !form.name.trim() ||
                formCustomFields.some(
                  (f) => f.required && !form.customAttributes[f.id]?.trim()
                )
              }
            >
              {editing ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
