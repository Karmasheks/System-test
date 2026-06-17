import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  useProductionTooling,
  useProductionProducts,
  useProductionMutations,
} from "@/hooks/use-production-planning";
import {
  TOOLING_STATUS_LABELS,
  TOOLING_TYPE_LABELS,
} from "@/lib/production-planning-constants";
import { Plus, Wrench, PackagePlus } from "lucide-react";
import { computeShiftNormFromCycle } from "@shared/production-norm-utils";
import type { ProductionTooling } from "@shared/schema";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

type Props = {
  subdivisionId: number;
};

export function PlanningToolingTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");

  const [search, setSearch] = useState("");
  const { data: tooling = [], isLoading } = useProductionTooling(
    subdivisionId,
    search,
    false
  );
  const {
    page,
    setPage,
    pageItems: paginatedTooling,
    totalPages,
    total: toolingTotal,
    from,
    to,
  } = useListPagination(tooling, 25, `${subdivisionId}-${search}`);
  const { data: products = [] } = useProductionProducts({ subdivisionId });
  const { createTooling, updateTooling, createProductFromTooling } = useProductionMutations();

  const [productOpen, setProductOpen] = useState(false);
  const [productToolingId, setProductToolingId] = useState<number | null>(null);
  const [productForm, setProductForm] = useState({ sapCode: "", name: "", defaultShiftNorm: "" });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionTooling | null>(null);
  const [form, setForm] = useState({
    pfNumber: "",
    name: "",
    productId: "",
    toolingType: "press_form",
    status: "ok",
    cycleTimeSec: "",
    cavities: "",
    productWeightGr: "",
    shotWeightGr: "",
    storageLocation: "",
    comment: "",
  });

  const resetForm = () => {
    setForm({
      pfNumber: "",
      name: "",
      productId: "",
      toolingType: "press_form",
      status: "ok",
      cycleTimeSec: "",
      cavities: "",
      productWeightGr: "",
      shotWeightGr: "",
      storageLocation: "",
      comment: "",
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (row: ProductionTooling) => {
    setEditing(row);
    setForm({
      pfNumber: row.pfNumber,
      name: row.name,
      productId: row.productId ? String(row.productId) : "",
      toolingType: row.toolingType,
      status: row.status,
      cycleTimeSec: row.cycleTimeSec ? String(row.cycleTimeSec) : "",
      cavities: row.cavities ? String(row.cavities) : "",
      productWeightGr: row.productWeightGr ? String(row.productWeightGr) : "",
      shotWeightGr: row.shotWeightGr ? String(row.shotWeightGr) : "",
      storageLocation: row.storageLocation ?? "",
      comment: row.comment ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        subdivisionId,
        pfNumber: form.pfNumber.trim(),
        name: form.name.trim(),
        productId: form.productId ? Number(form.productId) : undefined,
        toolingType: form.toolingType,
        status: form.status,
        cycleTimeSec: form.cycleTimeSec ? Number(form.cycleTimeSec) : undefined,
        cavities: form.cavities ? Number(form.cavities) : undefined,
        productWeightGr: form.productWeightGr ? Number(form.productWeightGr) : undefined,
        shotWeightGr: form.shotWeightGr ? Number(form.shotWeightGr) : undefined,
        storageLocation: form.storageLocation || undefined,
        comment: form.comment || undefined,
      };

      if (editing) {
        await updateTooling.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Оснастка обновлена" });
      } else {
        await createTooling.mutateAsync(payload);
        toast({ title: "Оснастка добавлена" });
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

  const openCreateProduct = (row: ProductionTooling) => {
    setProductToolingId(row.id);
    const norm = computeShiftNormFromCycle(row.cycleTimeSec, row.cavities);
    setProductForm({
      sapCode: "",
      name: row.name,
      defaultShiftNorm: norm != null ? String(norm) : "",
    });
    setProductOpen(true);
  };

  const handleCreateProduct = async () => {
    if (!productToolingId) return;
    try {
      await createProductFromTooling.mutateAsync({
        toolingId: productToolingId,
        sapCode: productForm.sapCode.trim(),
        name: productForm.name.trim() || undefined,
        defaultShiftNorm: productForm.defaultShiftNorm
          ? Number(productForm.defaultShiftNorm)
          : undefined,
      });
      toast({ title: "Изделие создано и связано с ПФ" });
      setProductOpen(false);
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось создать изделие",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="space-y-1">
          <Label>Поиск ПФ / оснастки</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SL2017, пресс-форма…"
            className="w-[280px]"
          />
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить ПФ / оснастку
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№ ПФ</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Цикл, сек</TableHead>
              <TableHead>Гнёзд</TableHead>
              <TableHead>Вес изд., г</TableHead>
              <TableHead>Отливка, г</TableHead>
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
            ) : tooling.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Нет записей. Добавьте пресс-формы и оснастку по каталогу ПФ.
                </TableCell>
              </TableRow>
            ) : (
              paginatedTooling.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{row.pfNumber}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    {TOOLING_TYPE_LABELS[row.toolingType] ?? row.toolingType}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "ok" ? "outline" : "secondary"}>
                      {TOOLING_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.cycleTimeSec ?? "—"}</TableCell>
                  <TableCell>{row.cavities ?? "—"}</TableCell>
                  <TableCell>{row.productWeightGr ?? "—"}</TableCell>
                  <TableCell>{row.shotWeightGr ?? "—"}</TableCell>
                  <TableCell>
                    {canEdit && (
                      <div className="flex gap-1">
                        {!row.productId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openCreateProduct(row)}
                            title="Создать изделие"
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                          <Wrench className="h-4 w-4" />
                        </Button>
                      </div>
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
        total={toolingTotal}
        from={from}
        to={to}
        onPageChange={setPage}
        className="px-1"
      />

      <Dialog open={open} onOpenChange={setOpen} modal>
        <DialogContent className="max-w-lg" blockOutsideClose>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Редактировать оснастку" : "Новая ПФ / оснастка"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>№ ПФ</Label>
                <Input value={form.pfNumber} onChange={(e) => setForm({ ...form, pfNumber: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Тип</Label>
                <Select value={form.toolingType} onValueChange={(v) => setForm({ ...form, toolingType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TOOLING_TYPE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Наименование</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Изделие (SAP)</Label>
              <Select value={form.productId || "none"} onValueChange={(v) => setForm({ ...form, productId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Не связано" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не связано</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.sapCode} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Статус</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TOOLING_STATUS_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Место хранения</Label>
                <Input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Цикл, сек</Label>
                <Input value={form.cycleTimeSec} onChange={(e) => setForm({ ...form, cycleTimeSec: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Гнёзд, шт</Label>
                <Input value={form.cavities} onChange={(e) => setForm({ ...form, cavities: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Вес изделия, г</Label>
                <Input value={form.productWeightGr} onChange={(e) => setForm({ ...form, productWeightGr: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Вес отливки, г</Label>
                <Input value={form.shotWeightGr} onChange={(e) => setForm({ ...form, shotWeightGr: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Комментарий</Label>
              <Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={!form.pfNumber.trim() || !form.name.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productOpen} onOpenChange={setProductOpen} modal>
        <DialogContent blockOutsideClose>
          <DialogHeader>
            <DialogTitle>Создать изделие из ПФ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>SAP-код изделия</Label>
              <Input
                value={productForm.sapCode}
                onChange={(e) => setProductForm({ ...productForm, sapCode: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Наименование</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Норма 11 ч, шт</Label>
              <Input
                value={productForm.defaultShiftNorm}
                onChange={(e) =>
                  setProductForm({ ...productForm, defaultShiftNorm: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>Отмена</Button>
            <Button
              onClick={handleCreateProduct}
              disabled={!productForm.sapCode.trim() || createProductFromTooling.isPending}
            >
              Создать изделие
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
