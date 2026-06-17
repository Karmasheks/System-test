import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSuppliers, useSupplierMutations } from "@/hooks/use-asset-management";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { filterItemsBySubdivisionIds } from "@/lib/subdivision-filter";
import {
  equipmentLabels,
  normalizeEquipmentIds,
  normalizeSubdivisionIds,
  subdivisionLabels,
} from "@/lib/contact-supplier-utils";
import { buildSupplierCreatePayload } from "@/lib/supplier-form-payload";
import {
  emptySupplierForm,
  SupplierFormFields,
  type SupplierFormValues,
} from "@/components/supplier-form-fields";
import { Building2, Plus, Trash2 } from "lucide-react";
import type { Supplier } from "@shared/schema";
import { matchesListSearch } from "@/lib/list-search";
import { ListSearchInput } from "@/components/list-search-input";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

const formDialogClass =
  "max-w-lg w-[min(100vw-2rem,32rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6";

export default function SuppliersPage() {
  const { toast } = useToast();
  const { data: suppliers = [], isLoading } = useSuppliers();
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
  const filteredSuppliers = useMemo(() => {
    let list = filterItemsBySubdivisionIds(suppliers, filterSubdivisionId);
    if (!searchQuery.trim()) return list;
    return list.filter((s) =>
      matchesListSearch(searchQuery, [
        s.name,
        s.contactPerson,
        s.position,
        s.phone,
        s.email,
        s.address,
        s.website,
        s.notes,
        subdivisionLabels(normalizeSubdivisionIds(s), subdivisions),
        equipmentLabels(normalizeEquipmentIds(s), allEquipment),
      ])
    );
  }, [suppliers, filterSubdivisionId, searchQuery, subdivisions, allEquipment]);

  const listFilterKey = `${filterValue}-${searchQuery}`;
  const {
    page,
    setPage,
    pageItems: paginatedSuppliers,
    totalPages,
    total: filteredTotal,
    from,
    to,
  } = useListPagination(filteredSuppliers, 25, listFilterKey);

  const { create, update, remove } = useSupplierMutations();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormValues>(emptySupplierForm());

  const reset = () => {
    setForm(emptySupplierForm());
    setEdit(null);
  };

  const openEdit = (s: Supplier) => {
    setEdit(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      position: s.position ?? "",
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

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Укажите название", variant: "destructive" });
      return;
    }
    const payload = buildSupplierCreatePayload(form, allEquipment);
    try {
      if (edit) await update.mutateAsync({ id: edit.id, ...payload });
      else await create.mutateAsync(payload);
      toast({ title: "Сохранено" });
      setOpen(false);
      reset();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Ошибка";
      toast({ title: "Ошибка", description: message, variant: "destructive" });
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
          <CardHeader className="flex flex-col gap-4">
            <CardTitle>Список ({filteredTotal})</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <ListSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Название, контакт, телефон, email…"
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
                    Показано: {filteredTotal} из {suppliers.length}
                    {totalPages > 1 && ` · страница ${page} из ${totalPages}`}
                  </p>
                )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Контакт</TableHead>
                    <TableHead>Должность</TableHead>
                    <TableHead>Подразделения</TableHead>
                    <TableHead>Оборудование</TableHead>
                    <TableHead>Комментарий</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSuppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.contactPerson ?? "—"}</TableCell>
                      <TableCell>{s.position ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-[140px]">
                        {subdivisionLabels(normalizeSubdivisionIds(s), subdivisions)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px]">
                        {equipmentLabels(normalizeEquipmentIds(s), allEquipment)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] text-multiline" title={s.notes ?? undefined}>
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
              <ListPaginationControls
                page={page}
                totalPages={totalPages}
                total={filteredTotal}
                from={from}
                to={to}
                onPageChange={setPage}
              />
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={open} onOpenChange={setOpen} modal>
        <DialogContent className={formDialogClass} blockOutsideClose>
          <DialogHeader>
            <DialogTitle>{edit ? "Редактировать поставщика" : "Новый поставщик"}</DialogTitle>
          </DialogHeader>
          <SupplierFormFields value={form} onChange={setForm} equipment={allEquipment} />
          <Button onClick={save} className="mt-1">Сохранить</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
