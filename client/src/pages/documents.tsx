import { useState } from "react";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  useDocuments,
  useDocumentCategories,
  useDocumentMutations,
} from "@/hooks/use-asset-management";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { DEFAULT_DOCUMENT_CATEGORIES, documentCategoryLabel } from "@shared/asset-constants";
import { FileText, Plus, Trash2, ExternalLink } from "lucide-react";
import type { Document } from "@shared/schema";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

export default function DocumentsPage() {
  const { toast } = useToast();
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { data: docs = [], isLoading } = useDocuments({
    equipmentId: equipmentFilter !== "all" ? equipmentFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });
  const { data: customCategories = [] } = useDocumentCategories();
  const { create, update, remove, addCategory } = useDocumentMutations();
  const { allEquipment } = useEquipmentApi();

  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [edit, setEdit] = useState<Document | null>(null);
  const [form, setForm] = useState({
    title: "",
    category: "instruction",
    equipmentId: "",
    fileUrl: "",
    description: "",
  });

  const allCategories = [
    ...DEFAULT_DOCUMENT_CATEGORIES.map((c) => ({ code: c.code, label: c.label })),
    ...customCategories
      .filter((c) => !DEFAULT_DOCUMENT_CATEGORIES.some((d) => d.code === c.name))
      .map((c) => ({ code: c.name, label: c.name })),
  ];

  const docsFilterKey = `${equipmentFilter}-${categoryFilter}`;
  const {
    page,
    setPage,
    pageItems: paginatedDocs,
    totalPages,
    total: docsTotal,
    from,
    to,
  } = useListPagination(docs, 25, docsFilterKey);

  const reset = () => {
    setEdit(null);
    setForm({ title: "", category: "instruction", equipmentId: "", fileUrl: "", description: "" });
  };

  const openEdit = (d: Document) => {
    setEdit(d);
    setForm({
      title: d.title,
      category: d.category,
      equipmentId: d.equipmentId ?? "",
      fileUrl: d.fileUrl,
      description: d.description ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.fileUrl.trim()) {
      toast({ title: "Укажите название и ссылку", variant: "destructive" });
      return;
    }
    const eq = allEquipment.find((e) => e.id === form.equipmentId);
    const payload = {
      title: form.title.trim(),
      category: form.category,
      equipmentId: form.equipmentId || null,
      equipmentName: eq?.name ?? null,
      fileUrl: form.fileUrl.trim(),
      description: form.description || null,
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

  const saveCategory = async () => {
    if (!newCat.trim()) return;
    try {
      await addCategory.mutateAsync(newCat.trim());
      setForm({ ...form, category: newCat.trim() });
      setCatOpen(false);
      setNewCat("");
      toast({ title: "Категория добавлена" });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Helmet><title>Документы — StarLine</title></Helmet>
      <main className="p-4 lg:p-6 w-full min-w-0 space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold">Документы</h1>
            </div>
            <Button onClick={() => { reset(); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Добавить
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6 grid md:grid-cols-2 gap-4">
              <div>
                <Label>Оборудование</Label>
                <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {allEquipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Категория</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {allCategories.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Список ({docsTotal})</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <p>Загрузка…</p> : (
                <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Оборудование</TableHead>
                      <TableHead>Ссылка</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDocs.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell>{documentCategoryLabel(d.category, customCategories)}</TableCell>
                        <TableCell>{d.equipmentName ?? "—"}</TableCell>
                        <TableCell>
                          <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />Открыть
                          </a>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(d)}>Изм.</Button>
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(d.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ListPaginationControls
                  page={page}
                  totalPages={totalPages}
                  total={docsTotal}
                  from={from}
                  to={to}
                  onPageChange={setPage}
                />
                </div>
              )}
            </CardContent>
          </Card>
        </main>

      <Dialog open={open} onOpenChange={setOpen} modal>
        <DialogContent blockOutsideClose>
          <DialogHeader><DialogTitle>{edit ? "Редактировать" : "Новый документ"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Название *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>Категория</Label>
              <div className="flex gap-2">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setCatOpen(true)} title="Новая категория">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Оборудование (актив)</Label>
              <Select value={form.equipmentId || "none"} onValueChange={(v) => setForm({ ...form, equipmentId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {allEquipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Ссылка на документ *</Label><Input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://..." /></div>
            <div><Label>Описание</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <Button onClick={save}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новая категория</DialogTitle></DialogHeader>
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Название" />
          <Button className="mt-3" onClick={saveCategory}>Добавить</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
