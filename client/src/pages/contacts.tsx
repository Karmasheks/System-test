import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { maskSensitiveValue, useAccessControl } from "@/hooks/use-access-control";
import { useContacts, useContactMutations, useSuppliers } from "@/hooks/use-asset-management";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { SubdivisionMultiPicker } from "@/components/subdivision-multi-picker";
import { filterItemsBySubdivisionIds } from "@/lib/subdivision-filter";
import { EquipmentMultiPicker } from "@/components/equipment-multi-picker";
import {
  buildEquipmentLinkPayload,
  equipmentLabels,
  normalizeEquipmentIds,
  normalizeSubdivisionIds,
  subdivisionLabels,
} from "@/lib/contact-supplier-utils";
import { Plus, Trash2, UserCircle } from "lucide-react";
import type { Contact } from "@shared/schema";
import { matchesListSearch } from "@/lib/list-search";
import { ListSearchInput } from "@/components/list-search-input";

const formDialogClass =
  "max-w-lg w-[min(100vw-2rem,32rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6";

export default function ContactsPage() {
  const { toast } = useToast();
  const { isFieldVisible } = useAccessControl();
  const showPhones = isFieldVisible("contact_phones");
  const showEmails = isFieldVisible("contact_emails");
  const { data: contacts = [], isLoading } = useContacts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: subdivisions = [] } = useSubdivisions();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    allowAllOption,
  } = useSubdivisionFilter();
  const { allEquipment } = useEquipmentApi();
  const [searchQuery, setSearchQuery] = useState("");
  const filteredContacts = useMemo(() => {
    let list = filterItemsBySubdivisionIds(contacts, filterSubdivisionId);
    if (!searchQuery.trim()) return list;
    return list.filter((c) => {
      const supplierName = suppliers.find((s) => s.id === c.supplierId)?.name;
      return matchesListSearch(searchQuery, [
        c.name,
        c.company,
        c.position,
        c.phone,
        c.email,
        c.notes,
        supplierName,
        subdivisionLabels(normalizeSubdivisionIds(c), subdivisions),
        equipmentLabels(normalizeEquipmentIds(c), allEquipment),
      ]);
    });
  }, [contacts, filterSubdivisionId, searchQuery, suppliers, subdivisions, allEquipment]);
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
    equipmentIds: [] as string[],
    subdivisionIds: [] as number[],
  });

  const reset = () => {
    setForm({
      name: "",
      company: "",
      position: "",
      phone: "",
      email: "",
      notes: "",
      supplierId: "",
      equipmentIds: [],
      subdivisionIds: [],
    });
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
      equipmentIds: normalizeEquipmentIds(c),
      subdivisionIds: normalizeSubdivisionIds(c),
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
      toast({ title: "Укажите имя", variant: "destructive" });
      return;
    }
    const equipmentLink = buildEquipmentLinkPayload(form.equipmentIds, allEquipment);
    const payload = {
      name: form.name.trim(),
      company: form.company || null,
      position: form.position || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes.trim() || null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      subdivisionIds: form.subdivisionIds,
      ...equipmentLink,
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
      <main className="p-4 lg:p-6 w-full min-w-0">
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
          <CardHeader className="flex flex-col gap-4">
            <CardTitle>Список ({filteredContacts.length})</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <ListSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Имя, компания, телефон, email…"
                className="w-full sm:max-w-sm"
              />
              {showFilter && (
                <SubdivisionFilterSelect
                  value={filterValue}
                  onChange={setFilterValue}
                  subdivisions={availableSubdivisions}
                  showAll={allowAllOption}
                  className="w-56"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="text-gray-500">Загрузка…</p>
            ) : (
              <>
                {filterSubdivisionId != null && (
                  <p className="text-sm text-muted-foreground mb-3">
                    Показано: {filteredContacts.length} из {contacts.length}
                  </p>
                )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Компания</TableHead>
                    <TableHead>Подразделения</TableHead>
                    <TableHead>Оборудование</TableHead>
                    <TableHead>Комментарий</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.company ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-[140px]">
                        {subdivisionLabels(normalizeSubdivisionIds(c), subdivisions)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px]">
                        {equipmentLabels(normalizeEquipmentIds(c), allEquipment)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate" title={c.notes ?? undefined}>
                        {c.notes?.trim() || "—"}
                      </TableCell>
                      <TableCell>{maskSensitiveValue(showPhones, c.phone)}</TableCell>
                      <TableCell>{maskSensitiveValue(showEmails, c.email)}</TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Изм.</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={formDialogClass}>
          <DialogHeader>
            <DialogTitle>{edit ? "Редактировать контакт" : "Новый контакт"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pb-2">
            <div>
              <Label>Имя *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Компания</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <Label>Должность</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
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
              <Label>Поставщик</Label>
              <select
                className="w-full border rounded-md px-3 py-2 dark:bg-gray-800 h-10 text-sm"
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
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
              description="Контакт может относиться к нескольким подразделениям"
            />

            <EquipmentMultiPicker
              equipment={allEquipment}
              value={form.equipmentIds}
              subdivisionIds={form.subdivisionIds}
              onChange={handleEquipmentChange}
              description="Выберите оборудование, с которым связан контакт"
            />

            <div>
              <Label>Комментарий</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Заметки по контакту…"
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
