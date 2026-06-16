import { useMemo, useState } from "react";
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
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import {
  useProductionProducts,
  useProductionMaterials,
  useProductBom,
  useProductEquipment,
  useProductionMutations,
  type ProductWithSubs,
} from "@/hooks/use-production-planning";
import { computeShiftNormFromCycle } from "@shared/production-norm-utils";
import { Plus, Pencil, Trash2, Package } from "lucide-react";

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
  const { data: materials = [] } = useProductionMaterials({ subdivisionId, activeOnly: true });
  const { allEquipment } = useEquipmentApi();
  const equipment = useMemo(
    () =>
      allEquipment.filter(
        (e) =>
          e.status !== "decommissioned" &&
          ((e as { subdivisionId?: number }).subdivisionId === subdivisionId ||
            (e as { homeSubdivisionId?: number }).homeSubdivisionId === subdivisionId)
      ),
    [allEquipment, subdivisionId]
  );

  const {
    createProduct,
    updateProduct,
    addBomLine,
    removeBomLine,
    upsertProductEquipment,
  } = useProductionMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithSubs | null>(null);
  const [form, setForm] = useState({
    sapCode: "",
    name: "",
    pfNumber: "",
    cycleTimeSec: "",
    cavities: "",
    defaultShiftNorm: "",
    productWeight: "",
    shotWeight: "",
  });

  const [bomForm, setBomForm] = useState({
    materialId: "",
    quantityPerUnit: "",
    usageType: "per_unit",
  });

  const [eqForm, setEqForm] = useState({
    equipmentId: "",
    shiftNormOverride: "",
    cycleTimeSecOverride: "",
    setupTimeMin: "",
  });

  const editProductId = editing?.id ?? null;
  const { data: bomLines = [], refetch: refetchBom } = useProductBom(editProductId, subdivisionId);
  const { data: eqLinks = [], refetch: refetchEq } = useProductEquipment(
    editProductId,
    subdivisionId
  );

  const resetForm = () => {
    setForm({
      sapCode: "",
      name: "",
      pfNumber: "",
      cycleTimeSec: "",
      cavities: "",
      defaultShiftNorm: "",
      productWeight: "",
      shotWeight: "",
    });
    setBomForm({ materialId: "", quantityPerUnit: "", usageType: "per_unit" });
    setEqForm({ equipmentId: "", shiftNormOverride: "", cycleTimeSecOverride: "", setupTimeMin: "" });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (p: ProductWithSubs) => {
    setEditing(p);
    setForm({
      sapCode: p.sapCode,
      name: p.name,
      pfNumber: p.pfNumber ?? "",
      cycleTimeSec: p.cycleTimeSec ? String(p.cycleTimeSec) : "",
      cavities: p.cavities ? String(p.cavities) : "",
      defaultShiftNorm: p.defaultShiftNorm ? String(p.defaultShiftNorm) : "",
      productWeight: p.productWeight ? String(p.productWeight) : "",
      shotWeight: p.shotWeight ? String(p.shotWeight) : "",
    });
    setOpen(true);
  };

  const calcNormPreview = () => {
    const cycle = form.cycleTimeSec ? Number(form.cycleTimeSec) : null;
    const cavities = form.cavities ? Number(form.cavities) : null;
    return computeShiftNormFromCycle(cycle, cavities);
  };

  const handleSaveProduct = async () => {
    try {
      const payload = {
        subdivisionId,
        sapCode: form.sapCode.trim(),
        name: form.name.trim(),
        pfNumber: form.pfNumber.trim() || undefined,
        cycleTimeSec: form.cycleTimeSec ? Number(form.cycleTimeSec) : undefined,
        cavities: form.cavities ? Number(form.cavities) : undefined,
        defaultShiftNorm: form.defaultShiftNorm
          ? Number(form.defaultShiftNorm)
          : calcNormPreview() ?? undefined,
        productWeight: form.productWeight ? Number(form.productWeight) : undefined,
        shotWeight: form.shotWeight ? Number(form.shotWeight) : undefined,
        isActive: true,
        subdivisionIds: [subdivisionId],
      };

      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Изделие обновлено" });
      } else {
        await createProduct.mutateAsync(payload);
        toast({ title: "Изделие создано" });
        setOpen(false);
        resetForm();
      }
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  const handleAddBom = async () => {
    if (!editing) return;
    try {
      await addBomLine.mutateAsync({
        productId: editing.id,
        materialId: Number(bomForm.materialId),
        subdivisionId,
        usageType: bomForm.usageType,
        quantityPerUnit: Number(bomForm.quantityPerUnit),
        isRequired: true,
      });
      setBomForm({ materialId: "", quantityPerUnit: "", usageType: "per_unit" });
      refetchBom();
      toast({ title: "Материал добавлен в BOM" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Ошибка",
      });
    }
  };

  const handleAddEquipment = async () => {
    if (!editing || !eqForm.equipmentId) return;
    try {
      await upsertProductEquipment.mutateAsync({
        productId: editing.id,
        equipmentId: eqForm.equipmentId,
        subdivisionId,
        shiftNormOverride: eqForm.shiftNormOverride
          ? Number(eqForm.shiftNormOverride)
          : undefined,
        cycleTimeSecOverride: eqForm.cycleTimeSecOverride
          ? Number(eqForm.cycleTimeSecOverride)
          : undefined,
        setupTimeMin: eqForm.setupTimeMin ? Number(eqForm.setupTimeMin) : undefined,
        priority: 0,
        isActive: true,
      });
      setEqForm({
        equipmentId: "",
        shiftNormOverride: "",
        cycleTimeSecOverride: "",
        setupTimeMin: "",
      });
      refetchEq();
      toast({ title: "Норма на оборудовании сохранена" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Ошибка",
      });
    }
  };

  const normPreview = calcNormPreview();

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SAP</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>№ ПФ</TableHead>
              <TableHead>Норма 11ч</TableHead>
              <TableHead>Цикл</TableHead>
              <TableHead>Гнёзд</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Нет изделий. Создайте изделие или из оснастки ПФ.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.sapCode}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="font-mono">{p.pfNumber ?? "—"}</TableCell>
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

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) resetForm();
          setOpen(v);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {editing ? "Карточка изделия" : "Новое изделие"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>SAP-код</Label>
                <Input
                  value={form.sapCode}
                  onChange={(e) => setForm({ ...form, sapCode: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>№ ПФ</Label>
                <Input
                  value={form.pfNumber}
                  onChange={(e) => setForm({ ...form, pfNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Наименование</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Цикл, сек</Label>
                <Input
                  value={form.cycleTimeSec}
                  onChange={(e) => setForm({ ...form, cycleTimeSec: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Гнёзд</Label>
                <Input
                  value={form.cavities}
                  onChange={(e) => setForm({ ...form, cavities: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Норма 11 ч, шт</Label>
                <Input
                  value={form.defaultShiftNorm}
                  onChange={(e) => setForm({ ...form, defaultShiftNorm: e.target.value })}
                  placeholder={
                    normPreview != null ? String(normPreview) : "из цикла × гнёзда"
                  }
                />
              </div>
            </div>
            {normPreview != null && !form.defaultShiftNorm && (
              <p className="text-xs text-muted-foreground">
                Расчётная норма: {normPreview.toLocaleString("ru-RU")} шт/смена
              </p>
            )}

            {editing && (
              <>
                <div className="border-t pt-4 space-y-2">
                  <h4 className="text-sm font-medium">Материалы (BOM)</h4>
                  <div className="flex flex-wrap gap-2 items-end">
                    <Select
                      value={bomForm.materialId}
                      onValueChange={(v) => setBomForm({ ...bomForm, materialId: v })}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Материал" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.sapCode} — {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-[100px]"
                      placeholder="Норма"
                      value={bomForm.quantityPerUnit}
                      onChange={(e) =>
                        setBomForm({ ...bomForm, quantityPerUnit: e.target.value })
                      }
                    />
                    <Button size="sm" onClick={handleAddBom} disabled={!bomForm.materialId}>
                      Добавить
                    </Button>
                  </div>
                  {bomLines.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {bomLines.map((line) => (
                        <li key={line.bom.id} className="flex items-center gap-2">
                          <span>
                            {line.material.sapCode} — {line.material.name}:{" "}
                            {line.bom.quantityPerUnit} {line.material.unit}
                          </span>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={async () => {
                                await removeBomLine.mutateAsync(line.bom.id);
                                refetchBom();
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-t pt-4 space-y-2">
                  <h4 className="text-sm font-medium">Нормы на оборудовании</h4>
                  <div className="flex flex-wrap gap-2 items-end">
                    <Select
                      value={eqForm.equipmentId}
                      onValueChange={(v) => setEqForm({ ...eqForm, equipmentId: v })}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Оборудование" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipment.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-[100px]"
                      placeholder="Норма 11ч"
                      value={eqForm.shiftNormOverride}
                      onChange={(e) =>
                        setEqForm({ ...eqForm, shiftNormOverride: e.target.value })
                      }
                    />
                    <Input
                      className="w-[90px]"
                      placeholder="Цикл"
                      value={eqForm.cycleTimeSecOverride}
                      onChange={(e) =>
                        setEqForm({ ...eqForm, cycleTimeSecOverride: e.target.value })
                      }
                    />
                    <Button size="sm" onClick={handleAddEquipment} disabled={!eqForm.equipmentId}>
                      Сохранить
                    </Button>
                  </div>
                  {eqLinks.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Оборудование</TableHead>
                          <TableHead>Норма</TableHead>
                          <TableHead>Цикл</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eqLinks.map((link) => (
                          <TableRow key={link.id}>
                            <TableCell>
                              {equipment.find((e) => e.id === link.equipmentId)?.name ??
                                link.equipmentId}
                            </TableCell>
                            <TableCell>
                              {link.shiftNormOverride?.toLocaleString("ru-RU") ?? "—"}
                            </TableCell>
                            <TableCell>{link.cycleTimeSecOverride ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </>
            )}
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
