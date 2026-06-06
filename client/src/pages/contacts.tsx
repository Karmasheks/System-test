import { useState } from "react";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { maskSensitiveValue, useAccessControl } from "@/hooks/use-access-control";
import { useContacts, useContactMutations, useSuppliers } from "@/hooks/use-asset-management";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { Plus, Trash2, UserCircle } from "lucide-react";
import type { Contact } from "@shared/schema";

export default function ContactsPage() {
  const { toast } = useToast();
  const { isFieldVisible } = useAccessControl();
  const showPhones = isFieldVisible("contact_phones");
  const showEmails = isFieldVisible("contact_emails");
  const { data: contacts = [], isLoading } = useContacts();
  const { data: suppliers = [] } = useSuppliers();
  const { allEquipment } = useEquipmentApi();
  const { create, update, remove } = useContactMutations();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Contact | null>(null);
  const [form, setForm] = useState({
    name: "",
    company: "",
    position: "",
    phone: "",
    email: "",
    notes: "",
    supplierId: "",
    equipmentId: "",
  });

  const reset = () => {
    setForm({ name: "", company: "", position: "", phone: "", email: "", notes: "", supplierId: "", equipmentId: "" });
    setEdit(null);
  };

  const openEdit = (c: Contact) => {
    setEdit(c);
    setForm({
      name: c.name,
      company: c.company ?? "",
      position: c.position ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
      supplierId: c.supplierId ? String(c.supplierId) : "",
      equipmentId: c.equipmentId ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Укажите имя", variant: "destructive" });
      return;
    }
    const eq = allEquipment.find((e) => e.id === form.equipmentId);
    const payload = {
      name: form.name.trim(),
      company: form.company || null,
      position: form.position || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      equipmentId: form.equipmentId || null,
      equipmentName: eq?.name ?? null,
    };
    try {
      if (edit) await update.mutateAsync({ id: edit.id, ...payload });
      else await create.mutateAsync(payload);
      toast({ title: edit ? "Контакт обновлён" : "Контакт добавлен" });
      setOpen(false);
      reset();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Helmet><title>Контакты — StarLine</title></Helmet>
      <main className="p-6 max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <UserCircle className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold">Контакты</h1>
            </div>
            <Button onClick={() => { reset(); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Добавить
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Список ({contacts.length})</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-gray-500">Загрузка…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Имя</TableHead>
                      <TableHead>Компания</TableHead>
                      <TableHead>Оборудование</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.company ?? "—"}</TableCell>
                        <TableCell className="text-sm">{c.equipmentName ?? "—"}</TableCell>
                        <TableCell>{maskSensitiveValue(showPhones, c.phone)}</TableCell>
                        <TableCell>{maskSensitiveValue(showEmails, c.email)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Изм.</Button>
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)}>
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
          <DialogHeader><DialogTitle>{edit ? "Редактировать" : "Новый контакт"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Имя *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Компания</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><Label>Должность</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            <div><Label>Телефон</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <Label>Поставщик</Label>
              <select className="w-full border rounded-md px-3 py-2 dark:bg-gray-800" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
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
