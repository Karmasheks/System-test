import { useState } from "react";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSuppliers, useSupplierMutations } from "@/hooks/use-asset-management";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { Building2, Plus, Trash2 } from "lucide-react";
import type { Supplier } from "@shared/schema";

export default function SuppliersPage() {
  const { toast } = useToast();
  const { data: suppliers = [], isLoading } = useSuppliers();
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
    equipmentId: "",
  });

  const reset = () => {
    setForm({ name: "", contactPerson: "", phone: "", email: "", address: "", website: "", notes: "", equipmentId: "" });
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
      equipmentId: s.equipmentId ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Укажите название", variant: "destructive" });
      return;
    }
    const eq = allEquipment.find((e) => e.id === form.equipmentId);
    const payload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      website: form.website || null,
      notes: form.notes || null,
      equipmentId: form.equipmentId || null,
      equipmentName: eq?.name ?? null,
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
      <main className="p-6 max-w-5xl mx-auto">
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
            <CardContent className="pt-6">
              {isLoading ? (
                <p className="text-gray-500">Загрузка…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Контакт</TableHead>
                      <TableHead>Оборудование</TableHead>
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
                        <TableCell className="text-sm">{s.equipmentName ?? "—"}</TableCell>
                        <TableCell>{s.phone ?? "—"}</TableCell>
                        <TableCell>{s.email ?? "—"}</TableCell>
                        <TableCell className="text-right space-x-2">
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
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? "Редактировать" : "Новый поставщик"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Название *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Контактное лицо</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><Label>Телефон</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Адрес</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div>
              <Label>Оборудование (актив)</Label>
              <select className="w-full border rounded-md px-3 py-2 dark:bg-gray-800" value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}>
                <option value="">—</option>
                {allEquipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <Button onClick={save}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
