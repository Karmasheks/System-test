import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useProductionProducts,
  useProductionTooling,
  useProductionMutations,
  type ProductWithSubs,
} from "@/hooks/use-production-planning";
import { Plus, Pencil, Package } from "lucide-react";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

type Props = {
  subdivisionId: number;
};

export function PlanningProductsTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");

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

  const { createProduct, updateProduct, updateTooling } = useProductionMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithSubs | null>(null);
  const [form, setForm] = useState({
    sapCode: "",
    name: "",
    toolingId: "",
    productWeight: "",
    sprueWeight: "",
  });

  const resetForm = () => {
    setForm({ sapCode: "", name: "", toolingId: "", productWeight: "", sprueWeight: "" });
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
    });
    setOpen(true);
  };

  const handleSaveProduct = async () => {
    try {
      const selectedTooling = tooling.find((t) => String(t.id) === form.toolingId);
      const cavities = selectedTooling?.cavities ?? editing?.cavities ?? 1;
      const productWeight = form.productWeight ? Number(form.productWeight) : undefined;
      const sprueWeight = form.sprueWeight ? Number(form.sprueWeight) : undefined;
      const shotWeight =
        productWeight != null && sprueWeight != null
          ? productWeight * cavities + sprueWeight
          : undefined;

      const payload = {
        subdivisionId,
        sapCode: form.sapCode.trim(),
        name: form.name.trim(),
        pfNumber: selectedTooling?.pfNumber ?? undefined,
        cycleTimeSec: selectedTooling?.cycleTimeSec ?? undefined,
        cavities: selectedTooling?.cavities ?? undefined,
        productWeight,
        sprueWeight,
        shotWeight,
        isActive: true,
        subdivisionIds: [subdivisionId],
      };

      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, ...payload });
        if (selectedTooling) {
          const linkIds = new Set(selectedTooling.products.map((t) => t.id));
          linkIds.add(editing.id);
          await updateTooling.mutateAsync({
            id: selectedTooling.id,
            productIds: [...linkIds],
          });
        }
        toast({ title: "Изделие обновлено" });
      } else {
        const created = await createProduct.mutateAsync(payload);
        if (selectedTooling && created?.id) {
          const linkIds = new Set(selectedTooling.products.map((t) => t.id));
          linkIds.add(created.id);
          await updateTooling.mutateAsync({
            id: selectedTooling.id,
            productIds: [...linkIds],
          });
        }
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
                <TableHead>SAP</TableHead>
                <TableHead>Наименование</TableHead>
                <TableHead>ПФ / оснастка</TableHead>
                <TableHead>Вес изд., г</TableHead>
                <TableHead>Литник, г</TableHead>
                <TableHead>Норма 11ч</TableHead>
                <TableHead>Цикл</TableHead>
                <TableHead>Гнёзд</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : productsTotal === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Нет изделий. Создайте изделие или привяжите через оснастку/ПФ.
                  </TableCell>
                </TableRow>
              ) : (
                productPageItems.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.sapCode}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="font-mono">{p.pfNumber ?? "—"}</TableCell>
                    <TableCell>{p.productWeight ?? "—"}</TableCell>
                    <TableCell>
                      {p.sprueWeight ??
                        (p.shotWeight != null && p.productWeight != null
                          ? Math.max(
                              0,
                              p.shotWeight - p.productWeight * (p.cavities ?? 1)
                            )
                          : "—")}
                    </TableCell>
                    <TableCell>
                      {p.defaultShiftNorm?.toLocaleString("ru-RU") ?? "—"}
                    </TableCell>
                    <TableCell>{p.cycleTimeSec ?? "—"}</TableCell>
                    <TableCell>{p.cavities ?? "—"}</TableCell>
                    <TableCell>
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
        <DialogContent className="max-w-md">
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
            <div className="space-y-1">
              <Label>ПФ / оснастка</Label>
              <Select
                value={form.toolingId || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, toolingId: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не привязано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не привязано</SelectItem>
                  {tooling.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.pfNumber} — {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Цикл, гнёзда и нормы задаются в карточке ПФ / оснастки по изделиям.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Вес изделия, г</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.productWeight}
                  onChange={(e) => setForm({ ...form, productWeight: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Вес литника, г</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.sprueWeight}
                  onChange={(e) => setForm({ ...form, sprueWeight: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  На одну отливку; вес отливки = изделие × гнёзда + литник
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={handleSaveProduct}
              disabled={!form.sapCode.trim() || !form.name.trim()}
            >
              {editing ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
