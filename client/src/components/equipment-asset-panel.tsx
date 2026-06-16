import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBudgetEntries,
  useBudgetMutations,
  useContacts,
  useSuppliers,
} from "@/hooks/use-asset-management";
import { useEquipmentLinks } from "@/hooks/use-equipment-links";
import { useEquipmentActivity } from "@/hooks/use-equipment-activity";
import { useEquipmentLinkHistory } from "@/hooks/use-equipment-link-history";
import { EquipmentActivityList } from "@/components/equipment-activity-list";
import { BUDGET_CATEGORIES, budgetCategoryLabel } from "@shared/asset-constants";
import { equipmentLinkTypeLabel } from "@shared/equipment-link-constants";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Plus, Wallet, Building2, UserCircle, Link2, History } from "lucide-react";
import { format } from "date-fns";
import { mobileTabsGrid5Class, mobileTabsTriggerClass } from "@/lib/mobile-tabs";

interface Props {
  equipmentId: string;
  equipmentName: string;
  onOpenEquipment?: (equipmentId: string) => void;
  onOpenTask?: (taskId: number) => void;
  embedded?: boolean;
}

export function EquipmentAssetPanel({
  equipmentId,
  equipmentName,
  onOpenEquipment,
  onOpenTask,
  embedded = false,
}: Props) {
  const { toast } = useToast();
  const { data: expenses = [], isLoading: loadingBudget } = useBudgetEntries({ equipmentId });
  const { data: suppliers = [] } = useSuppliers({ equipmentId });
  const { data: contacts = [] } = useContacts({ equipmentId });
  const { data: links = [], isLoading: loadingLinks } = useEquipmentLinks(equipmentId);
  const { data: activity = [], isLoading: loadingActivity } = useEquipmentActivity(equipmentId);
  const { data: linkHistory = [], isLoading: loadingLinkHistory } = useEquipmentLinkHistory(equipmentId);
  const { create: createBudget } = useBudgetMutations();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    category: "parts",
    expenseDate: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const handleAddExpense = async () => {
    if (!expenseForm.title.trim() || !expenseForm.amount) {
      toast({ title: "Заполните название и сумму", variant: "destructive" });
      return;
    }
    try {
      await createBudget.mutateAsync({
        title: expenseForm.title.trim(),
        amount: Number(expenseForm.amount),
        category: expenseForm.category,
        equipmentId,
        equipmentName,
        expenseDate: expenseForm.expenseDate,
        notes: expenseForm.notes || null,
        currency: "RUB",
      });
      toast({ title: "Затрата добавлена" });
      setShowAddExpense(false);
      setExpenseForm({
        title: "",
        amount: "",
        category: "parts",
        expenseDate: format(new Date(), "yyyy-MM-dd"),
        notes: "",
      });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className={embedded ? "min-w-0 overflow-hidden" : "border-t pt-4 mt-4 min-w-0 overflow-hidden"}>
      <Tabs defaultValue="history">
        <TabsList className={mobileTabsGrid5Class}>
          <TabsTrigger value="history" className={mobileTabsTriggerClass}>
            <History className="h-3.5 w-3.5 mr-1 shrink-0" />
            История
          </TabsTrigger>
          <TabsTrigger value="links" className={mobileTabsTriggerClass}>
            <Link2 className="h-3.5 w-3.5 mr-1 shrink-0" />
            Связи
          </TabsTrigger>
          <TabsTrigger value="contacts" className={mobileTabsTriggerClass}>
            <UserCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
            Контакты
          </TabsTrigger>
          <TabsTrigger value="suppliers" className={mobileTabsTriggerClass}>
            <Building2 className="h-3.5 w-3.5 mr-1 shrink-0" />
            Поставщики
          </TabsTrigger>
          <TabsTrigger value="budget" className={mobileTabsTriggerClass}>
            <Wallet className="h-3.5 w-3.5 mr-1 shrink-0" />
            Затраты
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-3 mt-3">
          <p className="text-sm text-gray-500">
            Все действия с оборудованием: задачи, заявки, ТО, связи, переносы, ремонт в других подразделениях, статус и расположение
          </p>
          <EquipmentActivityList
            items={activity}
            isLoading={loadingActivity}
            onOpenEquipment={onOpenEquipment}
            onOpenTask={onOpenTask}
          />
        </TabsContent>

        <TabsContent value="links" className="space-y-3 mt-3">
          <Tabs defaultValue="current" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="current" className="text-xs">
                Текущие связи
              </TabsTrigger>
              <TabsTrigger value="link-history" className="text-xs">
                История связей
              </TabsTrigger>
            </TabsList>

            <TabsContent value="current" className="space-y-3 mt-3">
              <p className="text-sm text-gray-500">
                Оборудование, работающее в связке с этим активом
              </p>
              {loadingLinks ? (
                <p className="text-sm text-gray-500">Загрузка…</p>
              ) : links.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  Связи не указаны. Добавьте их при редактировании оборудования.
                </p>
              ) : (
                <ul className="space-y-2 max-h-56 overflow-y-auto">
                  {links.map((link) => (
                    <li key={link.id} className="p-2 border rounded-md text-sm">
                      <button
                        type="button"
                        className="text-left w-full hover:bg-accent/50 rounded p-1 -m-1 transition-colors"
                        onClick={() => onOpenEquipment?.(link.otherEquipmentId)}
                      >
                        <p className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                          {link.otherEquipmentName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {link.otherEquipmentId} · {link.otherEquipmentType}
                        </p>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          {equipmentLinkTypeLabel(link.linkType)}
                        </Badge>
                        {link.note && (
                          <p className="text-xs text-muted-foreground mt-1">{link.note}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="link-history" className="space-y-3 mt-3">
              <p className="text-sm text-gray-500">
                Добавление, удаление и изменение связей с другим оборудованием
              </p>
              <EquipmentActivityList
                items={linkHistory}
                isLoading={loadingLinkHistory}
                emptyText="История связей пока пуста"
                maxHeightClass="max-h-56"
                onOpenEquipment={onOpenEquipment}
                onOpenTask={onOpenTask}
                showCategory={false}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-3 mt-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Контакты, привязанные к активу</p>
            <Link href="/contacts">
              <Button size="sm" variant="ghost">
                <ExternalLink className="h-3 w-3 mr-1" />Все
              </Button>
            </Link>
          </div>
          {contacts.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              Нет контактов с привязкой к этому оборудованию
            </p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {contacts.map((c) => (
                <li key={c.id} className="text-sm p-2 border rounded-md">
                  <p className="font-medium">{c.name}</p>
                  {c.company && <p className="text-gray-500">{c.company}</p>}
                  {c.phone && <p className="text-gray-500">{c.phone}</p>}
                  {c.email && <p className="text-gray-500">{c.email}</p>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-3 mt-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Поставщики, привязанные к активу</p>
            <Link href="/suppliers">
              <Button size="sm" variant="ghost">
                <ExternalLink className="h-3 w-3 mr-1" />Все
              </Button>
            </Link>
          </div>
          {suppliers.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              Нет поставщиков с привязкой к этому оборудованию
            </p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {suppliers.map((s) => (
                <li key={s.id} className="text-sm p-2 border rounded-md">
                  <p className="font-medium">{s.name}</p>
                  {s.contactPerson && <p className="text-gray-500">{s.contactPerson}</p>}
                  {s.phone && <p className="text-gray-500">{s.phone}</p>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="budget" className="space-y-3 mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-gray-500">Итого по этому оборудованию</p>
              <p className="text-xl font-bold">{total.toLocaleString("ru")} ₽</p>
              <p className="text-xs text-gray-400">{expenses.length} записей</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddExpense(!showAddExpense)}>
                <Plus className="h-3 w-3 mr-1" />
                Добавить
              </Button>
              <Link href="/budget">
                <Button size="sm" variant="ghost">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Все затраты
                </Button>
              </Link>
            </div>
          </div>

          {showAddExpense && (
            <div className="grid gap-2 p-3 border rounded-md bg-gray-50 dark:bg-gray-800/50">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">Название</Label>
                  <Input
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                    placeholder="Запчасть, расходник..."
                  />
                </div>
                <div>
                  <Label className="text-xs">Сумма ₽</Label>
                  <Input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Категория</Label>
                  <Select
                    value={expenseForm.category}
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUDGET_CATEGORIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Дата</Label>
                  <Input
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleAddExpense} disabled={createBudget.isPending}>
                Сохранить затрату
              </Button>
            </div>
          )}

          {loadingBudget ? (
            <p className="text-sm text-gray-500">Загрузка…</p>
          ) : expenses.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              Нет затрат с привязкой к этому оборудованию
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Дата</TableHead>
                    <TableHead className="text-xs">Название</TableHead>
                    <TableHead className="text-xs">Кат.</TableHead>
                    <TableHead className="text-xs text-right">Сумма</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs py-2">{e.expenseDate}</TableCell>
                      <TableCell className="text-xs py-2">{e.title}</TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {budgetCategoryLabel(e.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right font-medium">
                        {e.amount.toLocaleString("ru")} ₽
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
