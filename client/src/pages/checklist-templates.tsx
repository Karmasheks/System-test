import { useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useAuth } from "@/hooks/use-auth";
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
  useServiceRequestMeta,
} from "@/hooks/use-service-requests";
import { TO_REQUEST_TYPES } from "@shared/service-request-constants";
import { ArrowLeft, ListChecks, Plus, Trash2 } from "lucide-react";
import type { ChecklistTemplate } from "@shared/schema";

export default function ChecklistTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useChecklistTemplates();
  const { data: meta } = useServiceRequestMeta();
  const createMutation = useCreateChecklistTemplate();
  const deleteMutation = useDeleteChecklistTemplate();

  const [form, setForm] = useState({
    requestType: "to_3m",
    equipmentType: "",
    equipmentModel: "",
    category: "",
    itemText: "",
    measurementUnit: "",
    measurementNorm: "",
    sortOrder: "0",
  });

  const canManage = user?.role === "admin" || user?.role === "manager";
  const toTypes = meta?.types?.filter((t: { code: string }) =>
    (TO_REQUEST_TYPES as readonly string[]).includes(t.code)
  ) ?? [];

  const typeLabel = (code: string) =>
    meta?.types?.find((t: { code: string; label: string }) => t.code === code)?.label ?? code;

  const handleCreate = async () => {
    if (!form.category.trim() || !form.itemText.trim()) {
      toast({ title: "Заполните категорию и текст пункта", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        requestType: form.requestType,
        equipmentType: form.equipmentType || undefined,
        equipmentModel: form.equipmentModel || undefined,
        category: form.category.trim(),
        itemText: form.itemText.trim(),
        measurementUnit: form.measurementUnit || undefined,
        measurementNorm: form.measurementNorm || undefined,
        sortOrder: Number(form.sortOrder) || 0,
      });
      toast({ title: "Пункт добавлен" });
      setForm((f) => ({ ...f, category: "", itemText: "", measurementUnit: "", measurementNorm: "" }));
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Пункт удалён" });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  if (!canManage) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600">Доступ только для admin / manager</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Шаблоны чек-листов ТО — StarLine</title>
      </Helmet>
      <main className="p-4 lg:p-6 w-full min-w-0">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/service-requests">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <ListChecks className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Шаблоны чек-листов ТО
              </h1>
              <p className="text-sm text-gray-500">
                Пункты автоматически копируются в заявки типа ТО при открытии карточки
              </p>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Новый пункт
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>Тип заявки</Label>
                <Select
                  value={form.requestType}
                  onValueChange={(v) => setForm((f) => ({ ...f, requestType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {toTypes.map((t: { code: string; label: string }) => (
                      <SelectItem key={t.code} value={t.code}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Тип оборудования (опц.)</Label>
                <Input
                  value={form.equipmentType}
                  onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))}
                  placeholder="напр. compressor"
                />
              </div>
              <div>
                <Label>Модель (опц.)</Label>
                <Input
                  value={form.equipmentModel}
                  onChange={(e) => setForm((f) => ({ ...f, equipmentModel: e.target.value }))}
                />
              </div>
              <div>
                <Label>Категория</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Текст пункта</Label>
                <Input
                  value={form.itemText}
                  onChange={(e) => setForm((f) => ({ ...f, itemText: e.target.value }))}
                />
              </div>
              <div>
                <Label>Ед. изм.</Label>
                <Input
                  value={form.measurementUnit}
                  onChange={(e) => setForm((f) => ({ ...f, measurementUnit: e.target.value }))}
                />
              </div>
              <div>
                <Label>Норма</Label>
                <Input
                  value={form.measurementNorm}
                  onChange={(e) => setForm((f) => ({ ...f, measurementNorm: e.target.value }))}
                />
              </div>
              <div>
                <Label>Порядок</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  Добавить
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Список ({templates.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-gray-500">Загрузка…</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Тип</TableHead>
                      <TableHead>Оборудование</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Пункт</TableHead>
                      <TableHead>Норма</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(templates as ChecklistTemplate[]).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{typeLabel(t.requestType)}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {[t.equipmentType, t.equipmentModel].filter(Boolean).join(" / ") || "—"}
                        </TableCell>
                        <TableCell>{t.category}</TableCell>
                        <TableCell>{t.itemText}</TableCell>
                        <TableCell className="text-sm">
                          {t.measurementNorm
                            ? `${t.measurementNorm}${t.measurementUnit ? ` ${t.measurementUnit}` : ""}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(t.id)}
                            disabled={deleteMutation.isPending}
                          >
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
    </>
  );
}
