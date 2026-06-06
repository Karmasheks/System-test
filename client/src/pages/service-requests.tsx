import { useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, ClipboardList, Download, CalendarDays } from "lucide-react";
import { equipmentOptionLabel } from "@/lib/equipment-label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import {
  useServiceRequests,
  useServiceRequestMeta,
  useCreateServiceRequest,
  usePlanning,
  useAssignees,
  useTransitionServiceRequest,
  downloadMonthlyReport,
} from "@/hooks/use-service-requests";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { useBudgetEntries, useBudgetMutations } from "@/hooks/use-asset-management";
import { STATUS_LABELS, type ServiceRequestStatus } from "@shared/service-request-constants";
import { serviceRequestStatusColors } from "@/lib/badge-colors";
import { format } from "date-fns";
import { getIsoWeek } from "@shared/iso-week";
import { ru } from "date-fns/locale";

const statusColors: Partial<Record<ServiceRequestStatus, string>> = serviceRequestStatusColors;

export default function ServiceRequestsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [planWeek, setPlanWeek] = useState(() => getIsoWeek(new Date()));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    equipmentId: "",
    requestType: "repair",
    problemDescription: "",
    urgency: "3",
    budgetEntryId: "",
  });

  const { data: requests = [], isLoading } = useServiceRequests(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const { data: meta } = useServiceRequestMeta();
  const { allEquipment } = useEquipmentApi();
  const createMutation = useCreateServiceRequest();
  const { data: planning } = usePlanning(planWeek);
  const { data: assignees = [] } = useAssignees();
  const reschedule = useTransitionServiceRequest();
  const [rescheduleDraft, setRescheduleDraft] = useState<
    Record<number, { week: string; assigneeId: string }>
  >({});
  const { data: budgetForEquipment = [] } = useBudgetEntries(
    form.equipmentId ? { equipmentId: form.equipmentId } : undefined,
    { enabled: !!form.equipmentId }
  );

  const typeLabel = (code: string) =>
    meta?.types?.find((t: { code: string; label: string }) => t.code === code)?.label ?? code;

  const activeEquipment = allEquipment.filter((e) => e.status !== "decommissioned");

  const handlePlanningReschedule = async (request: {
    id: number;
    assigneeId?: number | null;
    assigneeName?: string | null;
    plannedWeek?: string | null;
  }) => {
    const draft = rescheduleDraft[request.id];
    const week = draft?.week || request.plannedWeek || planWeek;
    const assigneeIdStr = draft?.assigneeId || String(request.assigneeId ?? "");
    const assignee = assignees.find((a) => String(a.id) === assigneeIdStr);
    if (!assignee) {
      toast({ title: "Выберите исполнителя", variant: "destructive" });
      return;
    }
    if (!week) {
      toast({ title: "Укажите неделю", variant: "destructive" });
      return;
    }
    try {
      await reschedule.mutateAsync({
        id: request.id,
        toStatus: "assigned",
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        plannedWeek: week,
      });
      toast({ title: "План обновлён" });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    try {
      const created = await createMutation.mutateAsync({
        equipmentId: form.equipmentId,
        requestType: form.requestType,
        problemDescription: form.problemDescription,
        urgency: Number(form.urgency),
        ...(form.budgetEntryId ? { budgetEntryId: Number(form.budgetEntryId) } : {}),
      });
      toast({ title: "Заявка создана", description: `№${created.id}` });
      setOpen(false);
      setLocation(`/service-requests/${created.id}`);
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Helmet>
        <title>Сервисные заявки — StarLine</title>
      </Helmet>
      <main className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Сервисные заявки</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {(user?.role === "admin" || user?.role === "manager") && (
                <Link href="/service-requests/templates">
                  <Button variant="outline">Шаблоны ТО</Button>
                </Link>
              )}
              {user?.role === "admin" && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const d = new Date();
                      await downloadMonthlyReport(d.getFullYear(), d.getMonth() + 1);
                    } catch (e: any) {
                      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Отчёт CSV
                </Button>
              )}
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Новая заявка
              </Button>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Создание заявки</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Оборудование *</Label>
                    <Select
                      value={form.equipmentId}
                      onValueChange={(v) => setForm((f) => ({ ...f, equipmentId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите оборудование" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeEquipment.map((eq) => (
                          <SelectItem key={eq.id} value={eq.id}>
                            {equipmentOptionLabel(eq)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Тип заявки *</Label>
                    <Select
                      value={form.requestType}
                      onValueChange={(v) => setForm((f) => ({ ...f, requestType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meta?.types?.map((t: { code: string; label: string }) => (
                          <SelectItem key={t.code} value={t.code}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Срочность (1–5) *</Label>
                    <Select
                      value={form.urgency}
                      onValueChange={(v) => setForm((f) => ({ ...f, urgency: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meta?.urgencyLevels?.map((u: { level: number; label: string }) => (
                          <SelectItem key={u.level} value={String(u.level)}>
                            {u.level} — {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.equipmentId && (
                    <div>
                      <Label>Бюджет (расход по активу)</Label>
                      <Select
                        value={form.budgetEntryId || "none"}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, budgetEntryId: v === "none" ? "" : v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Не привязан" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— не привязан —</SelectItem>
                          {budgetForEquipment.map((b: { id: number; title: string; amount: number }) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.title} ({b.amount.toLocaleString("ru")} ₽)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Описание проблемы *</Label>
                    <Textarea
                      rows={4}
                      value={form.problemDescription}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, problemDescription: e.target.value }))
                      }
                      placeholder="Опишите неисправность или задачу..."
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={createMutation.isPending || !form.equipmentId}
                  >
                    Создать
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="list" className="space-y-4">
            <TabsList>
              <TabsTrigger value="list">Список</TabsTrigger>
              <TabsTrigger value="planning">
                <CalendarDays className="h-4 w-4 mr-1 inline" />
                Планирование
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list">
          <Card className="mb-4">
            <CardContent className="pt-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Список ({requests.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Загрузка...</p>
              ) : requests.length === 0 ? (
                <p className="text-muted-foreground">Заявок нет</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">№</th>
                        <th className="py-2 pr-4">Оборудование</th>
                        <th className="py-2 pr-4">Тип</th>
                        <th className="py-2 pr-4">Статус</th>
                        <th className="py-2 pr-4">Исполнитель</th>
                        <th className="py-2 pr-4">Создана</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => setLocation(`/service-requests/${r.id}`)}
                        >
                          <td className="py-3 pr-4">
                            <span className="text-blue-600 font-medium">#{r.id}</span>
                          </td>
                          <td className="py-3 pr-4">{r.equipmentName}</td>
                          <td className="py-3 pr-4">{typeLabel(r.requestType)}</td>
                          <td className="py-3 pr-4">
                            <Badge
                              className={
                                statusColors[r.status as ServiceRequestStatus] ?? ""
                              }
                            >
                              {STATUS_LABELS[r.status as ServiceRequestStatus] ?? r.status}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4">{r.assigneeName ?? "—"}</td>
                          <td className="py-3 pr-4">
                            {format(new Date(r.createdAt), "d MMM yyyy", { locale: ru })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="planning">
              <Card className="mb-4">
                <CardContent className="pt-4 flex gap-2 items-end">
                  <div>
                    <Label>Неделя (ISO)</Label>
                    <Input
                      className="w-40"
                      placeholder="2026-W22"
                      value={planWeek}
                      onChange={(e) => setPlanWeek(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
              {planning?.workload?.length > 0 && (
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle>Загрузка инженеров ({planning.week})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-3">
                      {planning.workload.map((w: { name: string; plannedHours: number; count: number }) => (
                        <div key={w.name} className="border rounded p-3">
                          <p className="font-medium">{w.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {w.count} заявок · {w.plannedHours} ч план
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Заявки по неделе</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(planning?.requests ?? []).map(
                    (r: {
                      id: number;
                      equipmentName: string;
                      assigneeId?: number | null;
                      assigneeName?: string | null;
                      plannedWeek?: string | null;
                      status: string;
                    }) => (
                      <div key={r.id} className="border rounded-md p-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <Link href={`/service-requests/${r.id}`} className="text-blue-600 font-medium">
                            #{r.id} {r.equipmentName}
                          </Link>
                          <span>{STATUS_LABELS[r.status as ServiceRequestStatus] ?? r.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-end">
                          <div>
                            <Label className="text-xs">Неделя</Label>
                            <Input
                              className="w-32 h-8"
                              value={rescheduleDraft[r.id]?.week ?? r.plannedWeek ?? ""}
                              onChange={(e) =>
                                setRescheduleDraft((prev) => ({
                                  ...prev,
                                  [r.id]: {
                                    week: e.target.value,
                                    assigneeId:
                                      prev[r.id]?.assigneeId ?? String(r.assigneeId ?? ""),
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Исполнитель</Label>
                            <Select
                              value={
                                rescheduleDraft[r.id]?.assigneeId ?? String(r.assigneeId ?? "")
                              }
                              onValueChange={(v) =>
                                setRescheduleDraft((prev) => ({
                                  ...prev,
                                  [r.id]: {
                                    week: prev[r.id]?.week ?? r.plannedWeek ?? "",
                                    assigneeId: v,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="w-40 h-8">
                                <SelectValue placeholder="Исполнитель" />
                              </SelectTrigger>
                              <SelectContent>
                                {assignees.map((a) => (
                                  <SelectItem key={a.id} value={String(a.id)}>
                                    {a.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reschedule.isPending}
                            onClick={() => handlePlanningReschedule(r)}
                          >
                            Сохранить
                          </Button>
                        </div>
                      </div>
                    )
                  )}
                  {(planning?.requests ?? []).length === 0 && (
                    <p className="text-muted-foreground">Нет запланированных заявок</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>

    </>
  );
}
