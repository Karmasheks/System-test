import { useState } from "react";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSuppliers, useSupplierMutations } from "@/hooks/use-asset-management";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { SubdivisionMultiPicker } from "@/components/subdivision-multi-picker";
import { EquipmentMultiPicker } from "@/components/equipment-multi-picker";
import {
  buildEquipmentLinkPayload,
  equipmentLabels,
  normalizeEquipmentIds,
  normalizeSubdivisionIds,
  subdivisionLabels,
} from "@/lib/contact-supplier-utils";
import { Building2, Plus, Trash2 } from "lucide-react";
import type { Supplier } from "@shared/schema";

const formDialogClass =
  "max-w-lg w-[min(100vw-2rem,32rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6";

export default function SuppliersPage() {
  const { toast } = useToast();
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { data: subdivisions = [] } = useSubdivisions();
  const { create, update, remove } = useSupplierMutations();
  const { allEquipment } = useEquipmentApi();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    notes: "",
    equipmentIds: [] as string[],
    subdivisionIds: [] as number[],
  });

  const reset = () => {
    setForm({
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      website: "",
      notes: "",
      equipmentIds: [],
      subdivisionIds: [],
    });
    setEdit(null);
  };

  const openEdit = (s: Supplier) => {
    setEdit(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      website: s.website ?? "",
      notes: s.notes ?? "",
      equipmentIds: normalizeEquipmentIds(s),
      subdivisionIds: normalizeSubdivisionIds(s),
    });
    setOpen(true);
  };

  const handleEquipmentChange = (equipmentIds: string[]) => {
    const subdivisionSet = new Set(form.subdivisionIds);
    for (const id of equipmentIds) {
      const eq = allEquipment.find((e) => e.id === id);
      if (eq?.subdivisionId) subdivisionSet.add(eq.subdivisionId);
    }
    setForm((prev) => ({
      ...prev,
      equipmentIds,
      subdivisionIds: Array.from(subdivisionSet).sort((a, b) => a - b),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Укажите название", variant: "destructive" });
      return;
    }
    const equipmentLink = buildEquipmentLinkPayload(form.equipmentIds, allEquipment);
    const payload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      website: form.website || null,
      notes: form.notes.trim() || null,
      subdivisionIds: form.subdivisionIds,
      ...equipmentLink,
    };
    try {
      if (edit) await update.mutateAsync({ id: edit.id, ...payload });
      else await create.mutateAsync(payload);
      toast({ title: "Сохранено" });
      setOpen(false);
      reset();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Helmet><title>Поставщики — StarLine</title></Helmet>
      <main className="p-4 lg:p-6 w-full min-w-0">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold">Поставщики</h1>
          </div>
          <Button onClick={() => { reset(); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Добавить
          </Button>
        </div>
        <Card>
          <CardHeader><CardTitle>Список ({suppliers.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="text-gray-500">Загрузка…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Контакт</TableHead>
                    <TableHead>Подразделения</TableHead>
                    <TableHead>Оборудование</TableHead>
                    <TableHead>Комментарий</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.contactPerson ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-[140px]">
                        {subdivisionLabels(normalizeSubdivisionIds(s), subdivisions)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px]">
                        {equipmentLabels(normalizeEquipmentIds(s), allEquipment)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate" title={s.notes ?? undefined}>
                        {s.notes?.trim() || "—"}
                      </TableCell>
                      <TableCell>{s.phone ?? "—"}</TableCell>
                      <TableCell>{s.email ?? "—"}</TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Изм.</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
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
            <DialogTitle>{edit ? "Редактировать поставщика" : "Новый поставщик"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pb-2">
            <div>
              <Label>Название *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Контактное лицо</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Адрес</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Сайт</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>

            <SubdivisionMultiPicker
              value={form.subdivisionIds}
              onChange={(subdivisionIds) => {
                const subSet = new Set(subdivisionIds);
                const equipmentIds =
                  subdivisionIds.length === 0
                    ? form.equipmentIds
                    : form.equipmentIds.filter((id) => {
                        const eq = allEquipment.find((e) => e.id === id);
                        return eq?.subdivisionId != null && subSet.has(eq.subdivisionId);
                      });
                setForm({ ...form, subdivisionIds, equipmentIds });
              }}
              description="Поставщик может обслуживать несколько подразделений"
            />

            <EquipmentMultiPicker
              equipment={allEquipment}
              value={form.equipmentIds}
              subdivisionIds={form.subdivisionIds}
              onChange={handleEquipmentChange}
              description="Оборудование, для которого актуален поставщик"
            />

            <div>
              <Label>Комментарий</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Заметки по поставщику…"
                rows={3}
                className="resize-y min-h-[72px]"
              />
            </div>

            <Button onClick={save} className="mt-1">Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
