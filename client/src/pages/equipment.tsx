import { useEffect, useState, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EquipmentStatusBadge } from "@/components/equipment-status-badge";
import { PlusCircle, FileEdit, Trash2, Settings, Calendar, Clock, ExternalLink, Link2, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EquipmentForm from "@/components/equipment-form";
import { useEquipmentTypes, useEquipmentTypeMutations } from "@/hooks/use-equipment-types";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { SubdivisionsPanel } from "@/components/admin/subdivisions-panel";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EquipmentImageGallery, EquipmentImageThumbnail } from "@/components/equipment-image-urls";
import { EquipmentAssetPanel } from "@/components/equipment-asset-panel";
import { apiRequest } from "@/lib/queryClient";
import {
  normalizeEquipmentRecord,
  generateNextEquipmentId,
  formatEquipmentResponsible,
} from "@shared/equipment-utils";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS } from "@shared/equipment-status-constants";
import type { Equipment } from "@shared/schema";
import { syncEquipmentLinksApi, useEquipmentLinks } from "@/hooks/use-equipment-links";
import { equipmentLinkTypeLabel } from "@shared/equipment-link-constants";
import { useTaskDialog, type TaskRecord } from "@/hooks/use-task-dialog";
import { useAccessControl } from "@/hooks/use-access-control";
import { SubdivisionTransferPanel } from "@/components/admin/subdivision-transfer-panel";
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { filterItemsBySubdivision } from "@/lib/subdivision-filter";
import { matchesListSearch } from "@/lib/list-search";
import { ListSearchInput } from "@/components/list-search-input";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";
import { EquipmentCommentsPanel } from "@/components/equipment-comments-panel";
import { EquipmentProductionPlanPanel } from "@/components/equipment-production-plan-panel";
import { mobileTabsTriggerClass } from "@/lib/mobile-tabs";
import { cn } from "@/lib/utils";

const equipmentFormDialogClass =
  "max-w-3xl w-[min(100vw-2rem,48rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6";
const equipmentViewDialogClass =
  "max-w-5xl w-[min(100vw-2rem,64rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6";

export default function Equipment() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { isSystemAdmin, canViewModule } = useAccessControl();
  const systemAdmin = isSystemAdmin();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { openEdit } = useTaskDialog();

  const { data: equipmentRaw = [] } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });
  const equipment = equipmentRaw.map((item) => normalizeEquipmentRecord(item));
  const { data: equipmentTypesList = [] } = useEquipmentTypes();
  const { createType } = useEquipmentTypeMutations();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
    allowAllOption,
  } = useSubdivisionFilter();
  const [newEquipmentType, setNewEquipmentType] = useState("");
  const { data: subdivisions = [] } = useSubdivisions();

  const equipmentSubdivisionLabel = (item: Equipment) => {
    if (item.subdivisionName?.trim()) return item.subdivisionName;
    if (item.subdivisionId) {
      return subdivisions.find((s) => s.id === item.subdivisionId)?.name ?? `#${item.subdivisionId}`;
    }
    return item.department?.trim() || "—";
  };

  const typeNames = useMemo(() => {
    const fromDb = equipmentTypesList.map((t) => t.name);
    const fromItems = equipment.map((e) => e.type).filter(Boolean) as string[];
    return [...new Set([...fromDb, ...fromItems])].sort((a, b) => a.localeCompare(b, "ru"));
  }, [equipmentTypesList, equipment]);

  const subdivisionEquipment = useMemo(
    () => filterItemsBySubdivision(equipment, filterSubdivisionId),
    [equipment, filterSubdivisionId]
  );

  const filteredEquipment = useMemo(() => {
    let list = subdivisionEquipment;
    if (typeFilter !== "all") {
      list = list.filter((e) => e.type === typeFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((e) => e.status === statusFilter);
    }
    if (searchQuery.trim()) {
      list = list.filter((item) =>
        matchesListSearch(searchQuery, [
          item.id,
          item.name,
          item.type,
          item.description,
          item.status,
          item.responsible,
          item.department,
          item.subdivisionName,
          item.serialNumber,
          item.inventoryNumber,
          equipmentSubdivisionLabel(item),
        ])
      );
    }
    return list;
  }, [equipment, typeFilter, statusFilter, filterSubdivisionId, searchQuery, subdivisions]);

  const listFilterKey = `${filterValue}-${typeFilter}-${statusFilter}-${searchQuery}`;
  const {
    page,
    setPage,
    pageItems: paginatedEquipment,
    totalPages,
    total: filteredTotal,
    from,
    to,
  } = useListPagination(filteredEquipment, 25, listFilterKey);

  const createEquipmentMutation = useMutation({
    mutationFn: async (newEquipment: any) => {
      const response = await apiRequest("POST", "/api/equipment", newEquipment);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      window.dispatchEvent(new CustomEvent("equipmentUpdated"));
      toast({
        title: "Успешно",
        description: "Оборудование добавлено",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message.replace(/^\d+:\s*/, "") || "Не удалось добавить оборудование",
        variant: "destructive",
      });
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/equipment/${id}`, data);
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", variables.id, "activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", variables.id, "link-history"] });
      window.dispatchEvent(new CustomEvent("equipmentUpdated"));
      toast({
        title: "Успешно",
        description: "Оборудование обновлено",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message.replace(/^\d+:\s*/, "") || "Не удалось обновить оборудование",
        variant: "destructive",
      });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/equipment/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      window.dispatchEvent(new CustomEvent("equipmentUpdated"));
      toast({
        title: "Успешно",
        description: "Оборудование удалено",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить оборудование",
        variant: "destructive",
      });
    },
  });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const { data: viewEquipmentLinks = [], isLoading: loadingViewLinks } = useEquipmentLinks(
    viewDialogOpen ? selectedEquipment?.id : undefined
  );

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    type: "",
    description: "",
    status: "active",
    lastMaintenance: "",
    nextMaintenance: "",
    responsible: "",
    maintenancePeriods: [] as string[],
  });

  const [customType, setCustomType] = useState("");
  const [isCustomType, setIsCustomType] = useState(false);

  const maintenancePeriodOptions = [
    { value: "1М - ТО", label: "1М - ТО (ежемесячно)" },
    { value: "3М - ТО", label: "3М - ТО (раз в 3 месяца)" },
    { value: "6М - ТО", label: "6М - ТО (раз в 6 месяцев)" },
    { value: "1Г - ТО", label: "1Г - ТО (ежегодно)" },
  ];

  useEffect(() => {
    if (!isLoading && !isAuthenticated()) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  const resetForm = useCallback(() => {
    setFormData({
      id: "",
      name: "",
      type: "",
      description: "",
      status: "active",
      lastMaintenance: "",
      nextMaintenance: "",
      responsible: "",
      maintenancePeriods: [],
    });
    setCustomType("");
    setIsCustomType(false);
  }, []);

  const openAddDialog = useCallback(() => {
    resetForm();
    setAddDialogOpen(true);
  }, [resetForm]);

  const openEditDialog = useCallback(
    (equipmentItem: any) => {
      setSelectedEquipment(equipmentItem);

      const isCustomEquipmentType = !typeNames.includes(equipmentItem.type);
      setIsCustomType(isCustomEquipmentType);
      setCustomType(isCustomEquipmentType ? equipmentItem.type : "");

      setFormData({
        id: equipmentItem.id,
        name: equipmentItem.name,
        type: equipmentItem.type,
        description: equipmentItem.description || "",
        status: equipmentItem.status,
        lastMaintenance: equipmentItem.lastMaintenance,
        nextMaintenance: equipmentItem.nextMaintenance,
        responsible: equipmentItem.responsible,
        maintenancePeriods: equipmentItem.maintenancePeriods || [],
      });

      setEditDialogOpen(true);
    },
    [typeNames],
  );

  const openViewDialog = useCallback((equipmentItem: any) => {
    setSelectedEquipment(equipmentItem);
    setViewDialogOpen(true);
  }, []);

  const openEquipmentById = useCallback(
    async (equipmentId: string) => {
      const id = equipmentId?.trim();
      if (!id) return;

      const local = equipment.find((eq) => eq.id === id);
      if (local) {
        setSelectedEquipment(local);
        setViewDialogOpen(true);
        return;
      }

      try {
        const res = await apiRequest("GET", `/api/equipment/${encodeURIComponent(id)}`);
        const fetched = normalizeEquipmentRecord((await res.json()) as Equipment);
        setSelectedEquipment(fetched);
        setViewDialogOpen(true);
        queryClient.setQueryData<Equipment[]>(["/api/equipment"], (old) => {
          if (!old) return [fetched];
          if (old.some((eq) => eq.id === id)) return old;
          return [...old, fetched];
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Не удалось открыть оборудование";
        toast({ title: "Ошибка", description: message, variant: "destructive" });
      }
    },
    [equipment, queryClient, toast]
  );

  const openTaskById = useCallback(
    async (taskId: number) => {
      try {
        const res = await apiRequest("GET", `/api/tasks/${taskId}`);
        if (!res.ok) {
          throw new Error("Задача не найдена");
        }
        const task = (await res.json()) as TaskRecord;
        openEdit(task);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Не удалось открыть задачу";
        toast({ title: "Ошибка", description: message, variant: "destructive" });
      }
    },
    [openEdit, toast]
  );

  const openDeleteDialog = useCallback((equipmentItem: any) => {
    setSelectedEquipment(equipmentItem);
    setDeleteDialogOpen(true);
  }, []);

  const handleAddEquipment = useCallback(() => {
    if (!formData.name || !formData.type) {
      toast({
        title: "Ошибка",
        description: "Заполните все обязательные поля",
        variant: "destructive",
      });
      return;
    }

    const newId = generateNextEquipmentId(equipment.map((item) => item.id));
    const newEquipment = {
      ...formData,
      id: newId,
      department: "",
      status: formData.status as "active" | "maintenance" | "inactive",
    };

    createEquipmentMutation.mutate(newEquipment);
    setAddDialogOpen(false);
    resetForm();
  }, [createEquipmentMutation, equipment.length, formData, resetForm, toast]);

  const handleEditEquipment = useCallback(() => {
    if (!selectedEquipment) return;

    const updatedData = {
      ...formData,
      status: formData.status as "active" | "maintenance" | "inactive",
    };

    updateEquipmentMutation.mutate({ id: selectedEquipment.id, data: updatedData });
    setEditDialogOpen(false);
    setSelectedEquipment(null);
    resetForm();
  }, [formData, resetForm, selectedEquipment, updateEquipmentMutation]);

  const handleDeleteEquipment = useCallback(() => {
    if (!selectedEquipment) return;
    deleteEquipmentMutation.mutate(selectedEquipment.id);
    setDeleteDialogOpen(false);
    setSelectedEquipment(null);
  }, [deleteEquipmentMutation, selectedEquipment]);

  const handleMaintenancePeriodChange = useCallback((period: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      maintenancePeriods: checked
        ? [...prev.maintenancePeriods, period]
        : prev.maintenancePeriods.filter((p) => p !== period),
    }));
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      description: e.target.value,
    }));
  }, []);

  const handleCustomTypeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomType(value);
    setFormData((prev) => ({
      ...prev,
      type: value,
    }));
  }, []);

  const handleFormFieldChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, name: e.target.value }));
  }, []);

  const getPeriodBadge = (period: string) => {
    const colors = {
      "1М - ТО": "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100",
      "3М - ТО": "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100",
      "6М - ТО": "bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100",
      "1Г - ТО": "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100",
    };

    return (
      <Badge key={period} className={`text-xs ${colors[period as keyof typeof colors] || "bg-gray-100 text-gray-800"}`}>
        {period}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Оборудование - Система управления оборудованием</title>
        <meta
          name="description"
          content="Управление оборудованием и настройка периодичности технического обслуживания"
        />
      </Helmet>

      <main className="p-4 lg:p-6 w-full min-w-0">
        <div className="w-full min-w-0">
              <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Оборудование</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Управление оборудованием и настройка периодичности ТО
                  </p>
                </div>

                <div className="flex gap-2">
                  <SubdivisionsPanel />
                  <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen} modal>
                    <DialogTrigger asChild>
                      <Button onClick={openAddDialog} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Добавить оборудование
                      </Button>
                    </DialogTrigger>
                    <DialogContent className={equipmentFormDialogClass} blockOutsideClose>
                    <DialogHeader>
                      <DialogTitle>Добавить новое оборудование</DialogTitle>
                      <DialogDescription>
                        Заполните информацию о новом оборудовании и настройте периодичность ТО
                      </DialogDescription>
                    </DialogHeader>
                    <EquipmentForm
                      allEquipment={equipment}
                      onSave={async (data, links) => {
                        const newId = generateNextEquipmentId(equipment.map((item) => item.id));
                        try {
                          await createEquipmentMutation.mutateAsync({
                            ...data,
                            id: newId,
                            department: data.department || "",
                          });
                          if (links.length > 0) {
                            await syncEquipmentLinksApi(newId, links, queryClient);
                          }
                          queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
                          setAddDialogOpen(false);
                        } catch (error: any) {
                          toast({
                            title: "Ошибка",
                            description: error.message?.replace(/^\d+:\s*/, "") ?? "Не удалось сохранить",
                            variant: "destructive",
                          });
                        }
                      }}
                      onCancel={() => setAddDialogOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center">
                      <Settings className="h-6 w-6 text-blue-600" />
                      <div className="ml-3">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Всего</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{subdivisionEquipment.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center">
                      <Clock className="h-6 w-6 text-green-600" />
                      <div className="ml-3">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Активно</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {subdivisionEquipment.filter((eq) => eq.status === "active").length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center">
                      <Calendar className="h-6 w-6 text-emerald-600" />
                      <div className="ml-3">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">На ТО</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {subdivisionEquipment.filter((eq) => eq.status === "maintenance").length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center">
                      <Wrench className="h-6 w-6 text-rose-600" />
                      <div className="ml-3">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">В ремонте</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {subdivisionEquipment.filter((eq) => eq.status === "repair").length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center">
                      <Settings className="h-6 w-6 text-red-600" />
                      <div className="ml-3">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Неактивно</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {subdivisionEquipment.filter((eq) => eq.status === "inactive").length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Список оборудования</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <ListSearchInput
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder="Название, ID, тип, ответственный…"
                      className="w-full sm:max-w-xs"
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
                    <div className="w-56">
                      <Label>Статус</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все статусы</SelectItem>
                          {EQUIPMENT_STATUSES.map((code) => (
                            <SelectItem key={code} value={code}>
                              {EQUIPMENT_STATUS_LABELS[code]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-56">
                      <Label>Категория (тип)</Label>
                      <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все категории</SelectItem>
                          {typeNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div>
                        <Label className="sr-only">Новая категория</Label>
                        <Input
                          placeholder="Новая категория"
                          value={newEquipmentType}
                          onChange={(e) => setNewEquipmentType(e.target.value)}
                          className="w-44"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!newEquipmentType.trim()) return;
                          try {
                            await createType.mutateAsync(newEquipmentType.trim());
                            setNewEquipmentType("");
                            toast({ title: "Категория добавлена" });
                          } catch {
                            toast({ title: "Не удалось добавить категорию", variant: "destructive" });
                          }
                        }}
                      >
                        +
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground pb-2">
                      Показано: {filteredTotal} из {subdivisionEquipment.length}
                      {totalPages > 1 && ` · страница ${page} из ${totalPages}`}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <table className="w-full table-fixed text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left p-2 font-medium w-12">Фото</th>
                          <th className="text-left p-2 font-medium w-[24%]">Название</th>
                          <th className="text-left p-2 font-medium w-[12%] hidden md:table-cell">Тип</th>
                          <th className="text-left p-2 font-medium w-[14%] hidden lg:table-cell">Подразделение</th>
                          <th className="text-left p-2 font-medium w-[12%]">Статус</th>
                          <th className="text-left p-2 font-medium w-[12%] hidden sm:table-cell">ТО</th>
                          <th className="text-left p-2 font-medium w-[12%] hidden xl:table-cell">Ответств.</th>
                          <th className="text-right p-2 font-medium w-[88px]"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedEquipment.map((equipmentItem) => (
                          <tr
                            key={equipmentItem.id}
                            role="button"
                            tabIndex={0}
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                            onClick={() => openViewDialog(equipmentItem)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openViewDialog(equipmentItem);
                              }
                            }}
                          >
                            <td className="p-2 w-12">
                              <EquipmentImageThumbnail url={equipmentItem.imageUrls?.[0]} />
                            </td>
                            <td className="p-2 min-w-0 align-top">
                              <p className="font-medium text-multiline">
                                {equipmentItem.name}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{equipmentItem.id}</p>
                            </td>
                            <td className="p-2 text-muted-foreground text-multiline hidden md:table-cell align-top">
                              {equipmentItem.type}
                            </td>
                            <td className="p-2 text-muted-foreground text-multiline hidden lg:table-cell align-top">
                              {equipmentSubdivisionLabel(equipmentItem)}
                            </td>
                            <td className="p-2 align-top">
                              <EquipmentStatusBadge status={equipmentItem.status} compact />
                            </td>
                            <td className="p-2 hidden sm:table-cell align-top">
                              <div className="flex gap-1 flex-wrap">
                                {equipmentItem.maintenancePeriods?.length ? (
                                  equipmentItem.maintenancePeriods.map((period) => getPeriodBadge(period))
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-muted-foreground text-multiline hidden xl:table-cell">
                              {formatEquipmentResponsible(equipmentItem.responsible)}
                            </td>
                            <td className="p-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={() => openEditDialog(equipmentItem)}
                                >
                                  <FileEdit className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 text-red-600 hover:text-red-700"
                                  onClick={() => openDeleteDialog(equipmentItem)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ListPaginationControls
                      page={page}
                      totalPages={totalPages}
                      total={filteredTotal}
                      from={from}
                      to={to}
                      onPageChange={setPage}
                    />
                  </div>
                </CardContent>
              </Card>
        </div>
      </main>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen} modal>
        <DialogContent className={equipmentFormDialogClass} blockOutsideClose>
          <DialogHeader>
            <DialogTitle>Редактировать оборудование</DialogTitle>
            <DialogDescription>Измените информацию об оборудовании и настройки периодичности ТО</DialogDescription>
          </DialogHeader>
          <EquipmentForm
            initialData={selectedEquipment}
            allEquipment={equipment}
            onSave={async (data, links) => {
              if (!selectedEquipment) return;
              try {
                await updateEquipmentMutation.mutateAsync({ id: selectedEquipment.id, data });
                await syncEquipmentLinksApi(selectedEquipment.id, links, queryClient);
                setEditDialogOpen(false);
                setSelectedEquipment(null);
              } catch (error: any) {
                toast({
                  title: "Ошибка",
                  description: error.message?.replace(/^\d+:\s*/, "") ?? "Не удалось сохранить",
                  variant: "destructive",
                });
              }
            }}
            onCancel={() => {
              setEditDialogOpen(false);
              setSelectedEquipment(null);
            }}
            isEdit={true}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className={equipmentViewDialogClass}>
          <DialogHeader>
            <DialogTitle>Информация об оборудовании</DialogTitle>
            <DialogDescription>
              Подробная информация, связи и управление активом
            </DialogDescription>
          </DialogHeader>
          {selectedEquipment && (
            <Tabs key={selectedEquipment.id} defaultValue="card" className="min-w-0">
              <TabsList
                className={cn(
                  "w-full h-auto gap-1 p-1 grid",
                  systemAdmin ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
                )}
              >
                <TabsTrigger value="card" className={mobileTabsTriggerClass}>Карточка</TabsTrigger>
                <TabsTrigger value="management" className={mobileTabsTriggerClass}>
                  Связи и история
                </TabsTrigger>
                {systemAdmin && (
                  <TabsTrigger value="subdivisions" className={mobileTabsTriggerClass}>
                    Подразделения
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="card" className="space-y-4 min-w-0 mt-3">
                <EquipmentImageGallery urls={selectedEquipment.imageUrls} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="font-medium">ID</Label>
                    <p className="text-gray-600 dark:text-gray-400 font-mono">{selectedEquipment.id}</p>
                  </div>
                  <div>
                    <Label className="font-medium">Название</Label>
                    <p className="text-gray-600 dark:text-gray-400">{selectedEquipment.name}</p>
                  </div>
                  <div>
                    <Label className="font-medium">Тип</Label>
                    <p className="text-gray-600 dark:text-gray-400">{selectedEquipment.type || "—"}</p>
                  </div>
                  <div>
                    <Label className="font-medium">Статус</Label>
                    <div className="mt-1">
                      <EquipmentStatusBadge status={selectedEquipment.status} />
                    </div>
                  </div>
                  <div>
                    <Label className="font-medium">Подразделение</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {equipmentSubdivisionLabel(selectedEquipment)}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">На ремонте в</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.repairSubdivisionName
                        ? `${selectedEquipment.repairSubdivisionName}${
                            selectedEquipment.homeSubdivisionName
                              ? ` (из «${selectedEquipment.homeSubdivisionName}»)`
                              : ""
                          }`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Местоположение</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.location || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Модель</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.model || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Серийный №</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.serialNumber || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Инвентарный №</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.inventoryNumber || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Дата установки</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.installationDate || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Гарантия до</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.warrantyUntil || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Ответственный</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {formatEquipmentResponsible(selectedEquipment.responsible)}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="font-medium">Описание</Label>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                    {selectedEquipment.description?.trim() || "—"}
                  </p>
                </div>

                {canViewModule("production_planning") && (
                  <EquipmentProductionPlanPanel equipmentId={selectedEquipment.id} />
                )}

                <div>
                  <Label className="font-medium">Confluence</Label>
                  {selectedEquipment.confluenceUrl ? (
                    <a
                      href={selectedEquipment.confluenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:underline break-all"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      {selectedEquipment.confluenceUrl}
                    </a>
                  ) : (
                    <p className="text-gray-600 dark:text-gray-400 mt-1">—</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="font-medium">Последнее ТО</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.lastMaintenance || "Не указано"}
                    </p>
                  </div>
                  <div>
                    <Label className="font-medium">Следующее ТО</Label>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedEquipment.nextMaintenance || "Не указано"}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="font-medium">Периодичность ТО</Label>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {selectedEquipment.maintenancePeriods?.length > 0 ? (
                      selectedEquipment.maintenancePeriods.map((period: string) => getPeriodBadge(period))
                    ) : (
                      <span className="text-gray-400">Не настроено</span>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label className="font-medium flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Связанное оборудование
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Оборудование, работающее в связке с этим активом. Управление — на вкладке «Связи и История».
                  </p>
                  {loadingViewLinks ? (
                    <p className="text-sm text-muted-foreground">Загрузка…</p>
                  ) : viewEquipmentLinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Связи не указаны</p>
                  ) : (
                    <ul className="space-y-2">
                      {viewEquipmentLinks.map((link) => (
                        <li
                          key={link.id}
                          className="p-2 border rounded-md text-sm flex flex-wrap items-start justify-between gap-2"
                        >
                          <button
                            type="button"
                            className="text-left min-w-0 hover:underline text-blue-600 dark:text-blue-400"
                            onClick={() => openEquipmentById(link.otherEquipmentId)}
                          >
                            <p className="font-medium">{link.otherEquipmentName}</p>
                            <p className="text-xs text-muted-foreground">
                              {link.otherEquipmentId}
                              {link.otherEquipmentType ? ` · ${link.otherEquipmentType}` : ""}
                            </p>
                          </button>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {equipmentLinkTypeLabel(link.linkType)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <EquipmentCommentsPanel equipmentId={selectedEquipment.id} />
              </TabsContent>

              <TabsContent value="management" className="min-w-0 mt-3">
                <EquipmentAssetPanel
                  equipmentId={selectedEquipment.id}
                  equipmentName={selectedEquipment.name}
                  onOpenEquipment={openEquipmentById}
                  onOpenTask={openTaskById}
                  embedded
                />
              </TabsContent>

              {systemAdmin && (
                <TabsContent value="subdivisions" className="min-w-0 mt-3">
                  <SubdivisionTransferPanel
                    entityType="equipment"
                    entityId={selectedEquipment.id}
                    entityLabel={selectedEquipment.name}
                    currentSubdivisionId={selectedEquipment.subdivisionId}
                    currentSubdivisionName={selectedEquipment.subdivisionName}
                    repairSubdivisionId={selectedEquipment.repairSubdivisionId}
                    repairSubdivisionName={selectedEquipment.repairSubdivisionName}
                    homeSubdivisionName={selectedEquipment.homeSubdivisionName}
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
                      queryClient.invalidateQueries({
                        queryKey: ["/api/equipment", selectedEquipment.id, "activity"],
                      });
                    }}
                  />
                </TabsContent>
              )}
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить оборудование</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить это оборудование? Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          {selectedEquipment && (
            <div className="py-4">
              <p className="text-gray-600 dark:text-gray-400">
                <strong>{selectedEquipment.name}</strong> ({selectedEquipment.id})
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDeleteEquipment}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}