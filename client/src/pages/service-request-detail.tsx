import { useEffect, useMemo, useState } from "react";
import { PageHelmet } from "@/components/page-helmet";
import { Link, useRoute, useLocation } from "wouter";
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
import { ArrowLeft, X, Plus, ExternalLink, MessageSquare, Link2, ListTodo } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadCommentAttachment } from "@/lib/upload-attachment";
import { useAuth } from "@/hooks/use-auth";
import {
  useServiceRequestDetail,
  useAssignees,
  useTransitionServiceRequest,
  useAddTimeEntry,
  useAddRequestComment,
  useAddRequestPart,
  useAddCoexecutor,
  useRemoveCoexecutor,
  useServiceRequestMeta,
  useUpdateServiceRequestDetails,
  useCreateServiceRequestSubtask,
  useAddRequestLink,
  useRemoveRequestLink,
} from "@/hooks/use-service-requests";
import { useBudgetEntries, useBudgetMutations } from "@/hooks/use-asset-management";
import { useWarehouseCategories, useWarehouseParts } from "@/hooks/use-warehouse";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import { budgetCategoryLabel } from "@shared/asset-constants";
import {
  STATUS_LABELS,
  isToRequestType,
  type ServiceRequestStatus,
} from "@shared/service-request-constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequestChecklistPanel } from "@/components/service-requests/request-checklist-panel";
import {
  ServiceRequestWorkflowPanel,
  PART_STATUS_LABELS,
} from "@/components/service-requests/service-request-workflow-panel";
import { ServiceRequestStatusBar } from "@/components/service-requests/service-request-status-bar";
import { ServiceRequestWorkProgressBar } from "@/components/service-requests/service-request-work-progress";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export default function ServiceRequestDetailPage() {
  const [, params] = useRoute("/service-requests/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();
  const { user } = useAuth();
  const { data, isLoading, refetch } = useServiceRequestDetail(id);
  const { data: assignees = [] } = useAssignees();
  const transition = useTransitionServiceRequest();
  const addTime = useAddTimeEntry();
  const addComment = useAddRequestComment();
  const addPart = useAddRequestPart();
  const updateDetails = useUpdateServiceRequestDetails();
  const createSubtask = useCreateServiceRequestSubtask();
  const addLink = useAddRequestLink();
  const removeLink = useRemoveRequestLink();
  const addCoexecutor = useAddCoexecutor();
  const removeCoexecutor = useRemoveCoexecutor();
  const { data: meta } = useServiceRequestMeta();
  const { allEquipment: equipmentList = [] } = useEquipmentApi();
  const equipmentOptions = useMemo(
    () =>
      equipmentList
        .filter((eq) => eq.status !== "decommissioned")
        .map((eq) => ({ id: eq.id, name: eq.name })),
    [equipmentList]
  );
  const { data: budgetForEquipment = [] } = useBudgetEntries(
    data?.request?.equipmentId ? { equipmentId: data.request.equipmentId } : undefined,
    { enabled: !!data?.request?.equipmentId }
  );
  const { data: budgetAll = [] } = useBudgetEntries();
  const budgetOptions = useMemo(() => {
    const map = new Map<number, (typeof budgetForEquipment)[number]>();
    for (const row of [...budgetForEquipment, ...budgetAll]) {
      map.set(row.id, row);
    }
    return Array.from(map.values());
  }, [budgetForEquipment, budgetAll]);
  const { linkToRequest, create: createBudget } = useBudgetMutations();
  const [budgetLinkId, setBudgetLinkId] = useState("");
  const [newBudgetTitle, setNewBudgetTitle] = useState("");
  const [newBudgetAmount, setNewBudgetAmount] = useState("");

  const [hours, setHours] = useState("");
  const [timeComment, setTimeComment] = useState("");
  const [partCategoryId, setPartCategoryId] = useState("");
  const [partSearch, setPartSearch] = useState("");
  const [selectedWarehousePartId, setSelectedWarehousePartId] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [commentText, setCommentText] = useState("");
  const [commentAttachmentName, setCommentAttachmentName] = useState("");
  const [commentAttachmentUrl, setCommentAttachmentUrl] = useState("");
  const [commentAttachmentFile, setCommentAttachmentFile] = useState<File | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const { data: partCategories = [] } = useWarehouseCategories();
  const { data: warehouseParts = [] } = useWarehouseParts({
    categoryId: partCategoryId ? Number(partCategoryId) : undefined,
    search: partSearch || undefined,
    equipmentId: data?.request?.equipmentId,
  });

  useEffect(() => {
    if (data?.request?.budgetEntryId) {
      setBudgetLinkId(String(data.request.budgetEntryId));
    }
  }, [data?.request?.budgetEntryId, data?.request?.id]);

  if (!id || isLoading || !data) {
    return (
      <>
        <PageHelmet title="Заявка — StarLine" />
        <div className="min-h-screen flex items-center justify-center">
          <p>Загрузка заявки...</p>
        </div>
      </>
    );
  }

  const {
    request,
    equipment: eqInfo,
    timeEntries,
    history,
    comments,
    totalHours,
    parts = [],
    coexecutors = [],
    hoursByUser = [],
    equipmentHistory = [],
    checklist = [],
    links = [],
    linkedTasks = [],
    workProgress = null,
  } = data;
  const typeLabel =
    meta?.types?.find((t: { code: string; label: string }) => t.code === request.requestType)?.label ??
    request.requestType;
  const status = request.status as ServiceRequestStatus;
  const isTo = isToRequestType(request.requestType);
  const checklistReadOnly = !["assigned", "in_progress", "returned", "waiting_parts"].includes(status);
  const canEditParts = !["closed", "cancelled", "duplicate", "not_needed"].includes(status);
  const mainLinkedTask =
    linkedTasks.find((t: { parentTaskId?: number | null }) => t.parentTaskId == null) ??
    linkedTasks[0] ??
    null;

  const runTransition = async (body: Record<string, unknown>) => {
    await transition.mutateAsync({ id: request.id, ...body });
    refetch();
  };

  const handleTransition = async (
    body: Record<string, unknown>,
    options?: { successTitle?: string }
  ) => {
    try {
      await runTransition(body);
      toast({ title: options?.successTitle ?? "Статус обновлён" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось изменить статус",
        variant: "destructive",
      });
      throw e;
    }
  };

  const handleAddTime = async () => {
    try {
      await addTime.mutateAsync({
        id: request.id,
        hours: Number(hours),
        workDate: new Date().toISOString().slice(0, 10),
        comment: timeComment || undefined,
      });
      setHours("");
      setTimeComment("");
      toast({ title: "Время добавлено" });
      refetch();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <PageHelmet title={`Заявка #${request.id} — StarLine`} />
      <main className="p-4 lg:p-6 w-full min-w-0">
          <Link href="/service-requests">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              К списку
            </Button>
          </Link>

          <div className="mb-6 space-y-4">
            <div>
              <h1 className="text-2xl font-bold">Заявка #{request.id}</h1>
              <p className="text-muted-foreground">{request.equipmentName}</p>
              {mainLinkedTask && (
                <Link href={`/tasks?task=${mainLinkedTask.id}`}>
                  <Button
                    variant="link"
                    className="h-auto p-0 mt-1 text-sm font-normal text-blue-600"
                  >
                    <ListTodo className="h-4 w-4 mr-1.5 shrink-0" />
                    Задача #{mainLinkedTask.id}: {mainLinkedTask.title}
                    <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
                  </Button>
                </Link>
              )}
            </div>
            <ServiceRequestStatusBar
              request={request}
              user={user ?? null}
              partsCount={parts.length}
              onTransition={handleTransition}
              isPending={transition.isPending}
            />
            {workProgress && (
              <div className="rounded-lg border p-3 bg-muted/20 max-w-xl">
                <ServiceRequestWorkProgressBar progress={workProgress} compact />
              </div>
            )}
          </div>

          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Основное</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Тип:</span> {typeLabel}
                </p>
                <p>
                  <span className="text-muted-foreground">Срочность:</span> {request.urgency}/5
                </p>
                <p>
                  <span className="text-muted-foreground">Приоритет:</span> {request.priority}
                </p>
                <p>
                  <span className="text-muted-foreground">Заявитель:</span> {request.requesterName}
                </p>
                <p>
                  <span className="text-muted-foreground">Исполнитель:</span>{" "}
                  {request.assigneeName ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">План:</span>{" "}
                  {request.plannedDate
                    ? format(new Date(request.plannedDate), "dd.MM.yyyy", { locale: ru })
                    : "—"}
                  {request.plannedWeek ? ` · ${request.plannedWeek}` : ""}
                </p>
                {mainLinkedTask && (
                  <p className="sm:col-span-2 lg:col-span-3">
                    <span className="text-muted-foreground">Исходная задача:</span>{" "}
                    <Link
                      href={`/tasks?task=${mainLinkedTask.id}`}
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      #{mainLinkedTask.id} {mainLinkedTask.title}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </p>
                )}
              </div>
              <p className="mt-3 text-sm border-t pt-3">{request.problemDescription}</p>
              {eqInfo && (
                <div className="mt-3 grid gap-1 sm:grid-cols-2 text-sm border-t pt-3">
                  {eqInfo.model && <p>Модель: {eqInfo.model}</p>}
                  {eqInfo.serialNumber && <p>С/Н: {eqInfo.serialNumber}</p>}
                  {eqInfo.inventoryNumber && <p>Инв. №: {eqInfo.inventoryNumber}</p>}
                  {eqInfo.location && <p>Место: {eqInfo.location}</p>}
                  {eqInfo.confluenceUrl && (
                    <a
                      href={eqInfo.confluenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline sm:col-span-2"
                    >
                      Инструкция Confluence
                    </a>
                  )}
                </div>
              )}
              {request.completionComment && (
                <p className="mt-3 text-sm border-t pt-3">
                  <span className="font-medium">Итог работ:</span> {request.completionComment}
                </p>
              )}
            </CardContent>
          </Card>

          <ServiceRequestWorkflowPanel
            request={request}
            user={user ?? null}
            assignees={assignees}
            equipmentOptions={equipmentOptions}
            requestTypes={meta?.types ?? []}
            coexecutors={coexecutors}
            linkedTasks={linkedTasks}
            workProgress={workProgress}
            onTransition={handleTransition}
            onUpdateDetails={async (body) => {
              await updateDetails.mutateAsync({ id: request.id, ...body });
              refetch();
            }}
            onCreateSubtask={async (body) => {
              await createSubtask.mutateAsync({ id: request.id, ...body });
              refetch();
            }}
            onAddCoexecutor={async (userId, userName) => {
              await addCoexecutor.mutateAsync({ id: request.id, userId, userName });
              refetch();
            }}
            onRemoveCoexecutor={async (coId) => {
              await removeCoexecutor.mutateAsync({ id: request.id, coId });
              refetch();
            }}
            onOpenTask={(taskId) => setLocation(`/tasks?task=${taskId}`)}
            isPending={transition.isPending}
            isDetailsPending={updateDetails.isPending}
            isSubtaskPending={createSubtask.isPending}
          />

          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Затраты и запчасти</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="budget">
                  <TabsList className="grid w-full grid-cols-2 max-w-xs mb-3">
                    <TabsTrigger value="budget" className="text-xs">
                      Затраты
                    </TabsTrigger>
                    <TabsTrigger value="parts" className="text-xs">
                      Запчасти ({parts.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="budget" className="space-y-3 mt-0">
                    {request.budgetEntryId && (() => {
                      const linked = budgetOptions.find((b: { id: number }) => b.id === request.budgetEntryId);
                      return linked ? (
                        <p className="text-sm">
                          <span className="font-medium">{linked.title}</span> —{" "}
                          {linked.amount.toLocaleString("ru")} ₽ (
                          {budgetCategoryLabel(linked.category)})
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Запись #{request.budgetEntryId}</p>
                      );
                    })()}
                    <Select
                      value={budgetLinkId || (request.budgetEntryId ? String(request.budgetEntryId) : "none")}
                      onValueChange={setBudgetLinkId}
                    >
                      <SelectTrigger><SelectValue placeholder="Выберите расход" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— не привязано —</SelectItem>
                        {budgetOptions.map((b: { id: number; title: string; amount: number; equipmentName?: string | null }) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.title} ({b.amount.toLocaleString("ru")} ₽)
                            {b.equipmentName ? ` · ${b.equipmentName}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {budgetOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Нет записей бюджета. Создайте расход ниже или на{" "}
                        <Link href="/budget" className="text-blue-600 hover:underline">
                          странице «Затраты»
                        </Link>
                        .
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await linkToRequest.mutateAsync({
                              requestId: request.id,
                              budgetEntryId:
                                budgetLinkId && budgetLinkId !== "none" ? Number(budgetLinkId) : null,
                            });
                            toast({ title: "Бюджет привязан" });
                            refetch();
                          } catch (e: unknown) {
                            toast({
                              title: "Ошибка",
                              description: e instanceof Error ? e.message : "Не удалось привязать",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Привязать к заявке
                      </Button>
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Быстро создать расход</p>
                      <Input
                        placeholder="Название расхода"
                        value={newBudgetTitle}
                        onChange={(e) => setNewBudgetTitle(e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="Сумма, ₽"
                        value={newBudgetAmount}
                        onChange={(e) => setNewBudgetAmount(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!newBudgetTitle.trim() || !newBudgetAmount) {
                            toast({ title: "Укажите название и сумму", variant: "destructive" });
                            return;
                          }
                          try {
                            const row = await createBudget.mutateAsync({
                              title: newBudgetTitle.trim(),
                              amount: Number(newBudgetAmount),
                              category: "service",
                              equipmentId: request.equipmentId,
                              equipmentName: request.equipmentName,
                              expenseDate: new Date().toISOString().slice(0, 10),
                            });
                            await linkToRequest.mutateAsync({
                              requestId: request.id,
                              budgetEntryId: row.id,
                            });
                            setBudgetLinkId(String(row.id));
                            setNewBudgetTitle("");
                            setNewBudgetAmount("");
                            toast({ title: "Расход создан и привязан" });
                            refetch();
                          } catch (e: unknown) {
                            toast({
                              title: "Ошибка",
                              description: e instanceof Error ? e.message : "Не удалось создать",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Создать и привязать
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="parts" className="space-y-3 mt-0">
                    {parts.length === 0 && (
                      <p className="text-sm text-muted-foreground">Запчасти не добавлены</p>
                    )}
                    {parts.map((p: { id: number; partName: string; partNumber?: string | null; quantityRequired: number; status: string }) => (
                      <div key={p.id} className="flex justify-between text-sm border-b pb-2 gap-2">
                        <div>
                          <span className="font-medium">{p.partName}</span>
                          {p.partNumber && (
                            <span className="text-muted-foreground ml-2">({p.partNumber})</span>
                          )}
                          <span className="text-muted-foreground ml-2">× {p.quantityRequired}</span>
                        </div>
                        <Badge variant="outline">
                          {PART_STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </div>
                    ))}
                    {canEditParts && (
                      <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                        <p className="text-sm font-medium">Добавить со склада</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label>Категория</Label>
                            <Select
                              value={partCategoryId || "all"}
                              onValueChange={(v) => {
                                setPartCategoryId(v === "all" ? "" : v);
                                setSelectedWarehousePartId("");
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Все категории" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Все категории</SelectItem>
                                {partCategories.map((c: { id: number; name: string }) => (
                                  <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Поиск</Label>
                            <Input
                              placeholder="Название или SAP..."
                              value={partSearch}
                              onChange={(e) => setPartSearch(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                          <div>
                            <Label>Запчасть</Label>
                            <Select
                              value={selectedWarehousePartId}
                              onValueChange={setSelectedWarehousePartId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите запчасть" />
                              </SelectTrigger>
                              <SelectContent>
                                {warehouseParts.length === 0 ? (
                                  <SelectItem value="__empty__" disabled>
                                    Нет запчастей по фильтрам
                                  </SelectItem>
                                ) : (
                                  warehouseParts.map((p: { id: number; name: string; sapNumber?: string | null; quantity: number; reservedQuantity: number }) => (
                                    <SelectItem key={p.id} value={String(p.id)}>
                                      {p.name}
                                      {p.sapNumber ? ` (${p.sapNumber})` : ""} — доступно{" "}
                                      {Math.max(0, (p.quantity ?? 0) - (p.reservedQuantity ?? 0))} шт.
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Кол-во</Label>
                            <Input
                              type="number"
                              min="1"
                              className="w-20"
                              value={partQty}
                              onChange={(e) => setPartQty(e.target.value)}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              size="sm"
                              onClick={async () => {
                                const wp = warehouseParts.find(
                                  (p: { id: number }) => String(p.id) === selectedWarehousePartId
                                );
                                if (!wp) {
                                  toast({ title: "Выберите запчасть", variant: "destructive" });
                                  return;
                                }
                                try {
                                  await addPart.mutateAsync({
                                    id: request.id,
                                    partName: wp.name,
                                    partNumber: wp.sapNumber ?? undefined,
                                    quantityRequired: Number(partQty) || 1,
                                    warehousePartId: wp.id,
                                  });
                                  setSelectedWarehousePartId("");
                                  setPartQty("1");
                                  toast({ title: "Запчасть добавлена и зарезервирована на складе" });
                                  refetch();
                                } catch (e: unknown) {
                                  toast({
                                    title: "Ошибка",
                                    description: e instanceof Error ? e.message : "Не удалось добавить",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              Добавить
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          При добавлении со склада запчасть резервируется. Для статуса «Ожидание
                          запчастей» нужна хотя бы одна позиция — затраты на закупку можно
                          привязать на вкладке «Затраты».
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Трудозатраты</span>
                  <span className="text-lg font-bold tabular-nums">{totalHours} ч</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {hoursByUser.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {hoursByUser.map((h: { userId: number; userName: string; hours: number }) => (
                      <Badge key={h.userId} variant="secondary" className="font-normal">
                        {h.userName}: {h.hours} ч
                      </Badge>
                    ))}
                  </div>
                )}
                {timeEntries.length > 0 && (
                  <ul className="text-xs text-muted-foreground max-h-20 overflow-y-auto space-y-0.5">
                    {timeEntries.slice(0, 5).map(
                      (e: { id: number; userName: string; hours: number; workDate: string }) => (
                        <li key={e.id}>
                          {e.userName} — {e.hours} ч ({e.workDate})
                        </li>
                      )
                    )}
                    {timeEntries.length > 5 && (
                      <li>…ещё {timeEntries.length - 5} записей</li>
                    )}
                  </ul>
                )}
                {["assigned", "in_progress", "waiting_parts", "returned"].includes(status) && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="Ч"
                      className="w-16 h-8"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                    />
                    <Input
                      placeholder="Комментарий"
                      className="h-8 flex-1"
                      value={timeComment}
                      onChange={(e) => setTimeComment(e.target.value)}
                    />
                    <Button size="sm" className="h-8" onClick={handleAddTime}>
                      +
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {isTo && checklist.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Чек-лист ТО</CardTitle>
              </CardHeader>
              <CardContent>
                <RequestChecklistPanel
                  requestId={request.id}
                  items={checklist}
                  onUpdated={() => refetch()}
                  readOnly={checklistReadOnly}
                />
              </CardContent>
            </Card>
          )}

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Коммуникации
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="comments">
                <TabsList className="grid w-full grid-cols-2 max-w-sm">
                  <TabsTrigger value="comments" className="text-xs">
                    Комментарии ({comments.length})
                  </TabsTrigger>
                  <TabsTrigger value="links" className="text-xs">
                    <Link2 className="h-3 w-3 mr-1" />
                    Ссылки ({links.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="comments" className="space-y-3 mt-3">
                  {comments.length === 0 && (
                    <p className="text-sm text-muted-foreground">Комментариев пока нет</p>
                  )}
                  {comments.map(
                    (c: {
                      id: number;
                      authorName: string;
                      body: string;
                      createdAt: string;
                      attachments?: { name: string; url: string }[];
                    }) => (
                      <div key={c.id} className="text-sm border rounded-md p-3 bg-muted/20">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{c.authorName}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(c.createdAt), "d MMM HH:mm", { locale: ru })}
                          </span>
                        </div>
                        {c.body && <p className="mt-1">{c.body}</p>}
                        {(c.attachments ?? []).map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs block mt-1"
                          >
                            📎 {a.name}
                          </a>
                        ))}
                      </div>
                    )
                  )}
                  <div className="space-y-2 border-t pt-3">
                    <Textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Новый комментарий"
                      rows={2}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Название файла"
                        value={commentAttachmentName}
                        onChange={(e) => setCommentAttachmentName(e.target.value)}
                      />
                      <Input
                        placeholder="Ссылка (URL)"
                        value={commentAttachmentUrl}
                        onChange={(e) => setCommentAttachmentUrl(e.target.value)}
                        disabled={!!commentAttachmentFile}
                      />
                    </div>
                    <Input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => setCommentAttachmentFile(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        let attachments: { name: string; url: string }[] = [];
                        try {
                          if (commentAttachmentFile) {
                            attachments = [
                              await uploadCommentAttachment(
                                commentAttachmentFile,
                                commentAttachmentName.trim() || commentAttachmentFile.name
                              ),
                            ];
                          } else if (commentAttachmentName.trim() && commentAttachmentUrl.trim()) {
                            attachments = [
                              {
                                name: commentAttachmentName.trim(),
                                url: commentAttachmentUrl.trim(),
                              },
                            ];
                          }
                        } catch (err) {
                          toast({
                            title: "Ошибка загрузки",
                            description: err instanceof Error ? err.message : "Не удалось загрузить файл",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (!commentText.trim() && attachments.length === 0) {
                          toast({ title: "Введите комментарий или вложение", variant: "destructive" });
                          return;
                        }
                        await addComment.mutateAsync({
                          id: request.id,
                          body: commentText.trim(),
                          attachments,
                        });
                        setCommentText("");
                        setCommentAttachmentName("");
                        setCommentAttachmentUrl("");
                        setCommentAttachmentFile(null);
                        refetch();
                      }}
                    >
                      Отправить
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="links" className="space-y-3 mt-3">
                  {links.length === 0 && (
                    <p className="text-sm text-muted-foreground">Связанных ссылок нет</p>
                  )}
                  <ul className="space-y-2">
                    {links.map((link: { id: number; title: string; description?: string | null; url: string }) => (
                      <li
                        key={link.id}
                        className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            {link.title}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                          {link.description && (
                            <p className="text-muted-foreground text-xs mt-0.5">{link.description}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          disabled={addLink.isPending || removeLink.isPending}
                          onClick={async () => {
                            await removeLink.mutateAsync({ id: request.id, linkId: link.id });
                            refetch();
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t pt-3 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Название ссылки"
                        value={linkTitle}
                        onChange={(e) => setLinkTitle(e.target.value)}
                      />
                      <Input
                        placeholder="https://…"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                      />
                    </div>
                    <Input
                      placeholder="Описание (необязательно)"
                      value={linkDescription}
                      onChange={(e) => setLinkDescription(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!linkTitle.trim() || !linkUrl.trim() || addLink.isPending}
                      onClick={async () => {
                        await addLink.mutateAsync({
                          id: request.id,
                          title: linkTitle.trim(),
                          description: linkDescription.trim() || undefined,
                          url: linkUrl.trim(),
                        });
                        setLinkTitle("");
                        setLinkDescription("");
                        setLinkUrl("");
                        refetch();
                        toast({ title: "Ссылка добавлена" });
                      }}
                    >
                      Добавить ссылку
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {equipmentHistory.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">История работ по оборудованию</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {equipmentHistory.map((h: { id: number; status: string; createdAt: string }) => (
                  <div key={h.id}>
                    <Link href={`/service-requests/${h.id}`} className="text-blue-600 hover:underline">
                      #{h.id}
                    </Link>{" "}
                    — {STATUS_LABELS[h.status as ServiceRequestStatus] ?? h.status},{" "}
                    {format(new Date(h.createdAt), "d MMM yyyy", { locale: ru })}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">История статусов</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {history.map(
                (h: {
                  id: number;
                  fromStatus: string | null;
                  toStatus: string;
                  changedByName: string;
                  createdAt: string;
                  comment?: string;
                }) => (
                  <div key={h.id}>
                    {h.fromStatus ?? "—"} → {STATUS_LABELS[h.toStatus as ServiceRequestStatus] ?? h.toStatus}{" "}
                    <span className="text-muted-foreground">
                      ({h.changedByName},{" "}
                      {format(new Date(h.createdAt), "d MMM HH:mm", { locale: ru })})
                    </span>
                    {h.comment && <p className="text-muted-foreground">{h.comment}</p>}
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </main>
    </>
  );
}
