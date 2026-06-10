import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { Equipment, InspectionChecklist, DailyInspection, InsertDailyInspection } from '../../../shared/schema';
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { 
  Calendar,
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Settings,
  FileText,
  Users,
  Shield,
  Save
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useInspectionChecklists } from "@/hooks/use-inspection-checklists";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSubdivisionFilter } from "@/hooks/use-subdivision-filter";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { filterItemsBySubdivision } from "@/lib/subdivision-filter";
import { isEquipmentAvailableForInspection } from "@shared/equipment-utils";

// Интерфейс для элемента чек-листа
interface ChecklistItem {
  category: string;
  item: string;
}

// Интерфейс для данных осмотра
interface InspectionItem {
  id: string;
  category: string;
  item: string;
  checked: boolean;
  status: 'ok' | 'attention' | 'critical';
}

function mapStatusToCheckResult(status: InspectionItem['status']): string {
  if (status === 'attention') return 'issue';
  return status;
}

function mapCheckResultToStatus(result: string | undefined): InspectionItem["status"] {
  if (result === "critical") return "critical";
  if (result === "issue") return "attention";
  return "ok";
}

function getDeviatedItems(items: InspectionItem[]): InspectionItem[] {
  return items.filter((item) => item.status === 'attention' || item.status === 'critical');
}

function buildInspectionCommentLines(items: InspectionItem[], generalComment: string): string[] {
  const deviated = getDeviatedItems(items);
  const lines: string[] = [];

  if (deviated.length > 0) {
    lines.push('Пункты с отклонениями:');
    for (const item of deviated) {
      const label = item.status === 'critical' ? 'Критично' : 'Требует внимания';
      lines.push(`• ${item.category}: ${item.item} — ${label}`);
    }
  }

  if (generalComment.trim()) {
    if (lines.length > 0) lines.push('');
    lines.push(`Комментарий: ${generalComment.trim()}`);
  }

  return lines;
}

function getStatusLabel(status: InspectionItem['status']): string {
  switch (status) {
    case 'critical':
      return 'Критично';
    case 'attention':
      return 'Требует внимания';
    default:
      return 'В норме';
  }
}

function countInspectionIssues(inspection: DailyInspection): number {
  if (typeof inspection.issuesCount === "number") {
    return inspection.issuesCount;
  }
  if (inspection.checkResults?.length) {
    return inspection.checkResults.filter((r) => r === "issue" || r === "critical").length;
  }
  return 0;
}

function mapDbWorkingStatus(
  status: string | null | undefined
): EquipmentInspection["workingStatus"] {
  if (status === "not_working" || status === "maintenance" || status === "working") {
    return status;
  }
  return "working";
}

// Интерфейс для данных осмотра оборудования
interface EquipmentInspection {
  equipmentId: string;
  dailyInspectionId?: number;
  status: 'not_started' | 'in_progress' | 'completed';
  inspectedBy?: string;
  inspectionDate?: Date;
  issues: number;
  notes?: string;
  workingStatus: 'working' | 'not_working' | 'maintenance';
}

// Полный список всех возможных пунктов проверки
const allInspectionItems: ChecklistItem[] = [
  // Безопасность
  { category: "Безопасность", item: "Защитные ограждения" },
  { category: "Безопасность", item: "Аварийная кнопка" },
  { category: "Безопасность", item: "Предупреждающие знаки" },
  { category: "Безопасность", item: "Освещение рабочей зоны" },
  { category: "Безопасность", item: "Заземление" },
  { category: "Безопасность", item: "Блокировки безопасности" },
  { category: "Безопасность", item: "Средства индивидуальной защиты" },
  { category: "Безопасность", item: "Датчики безопасности" },
  
  // Механическая часть
  { category: "Механическая часть", item: "Болтовые соединения" },
  { category: "Механическая часть", item: "Подшипники" },
  { category: "Механическая часть", item: "Ремни и цепи" },
  { category: "Механическая часть", item: "Муфты" },
  { category: "Механическая часть", item: "Направляющие" },
  { category: "Механическая часть", item: "Шпиндель" },
  { category: "Механическая часть", item: "Суппорт" },
  { category: "Механическая часть", item: "Зажимы и патрон" },
  { category: "Механическая часть", item: "Передачи" },
  { category: "Механическая часть", item: "Износ деталей" },
  
  // Гидравлика
  { category: "Гидравлика", item: "Уровень масла" },
  { category: "Гидравлика", item: "Утечки" },
  { category: "Гидравлика", item: "Давление в системе" },
  { category: "Гидравлика", item: "Фильтры" },
  { category: "Гидравлика", item: "Шланги" },
  { category: "Гидравлика", item: "Гидроцилиндры" },
  { category: "Гидравлика", item: "Насос" },
  { category: "Гидравлика", item: "Клапаны" },
  { category: "Гидравлика", item: "Аккумулятор давления" },
  
  // Электрика
  { category: "Электрика", item: "Кабели и провода" },
  { category: "Электрика", item: "Контакты" },
  { category: "Электрика", item: "Изоляция" },
  { category: "Электрика", item: "Автоматы защиты" },
  { category: "Электрика", item: "Заземление электрическое" },
  { category: "Электрика", item: "Шкаф управления" },
  { category: "Электрика", item: "Двигатели" },
  { category: "Электрика", item: "Концевые выключатели" },
  { category: "Электрика", item: "Реле и контакторы" },
  
  // Пневматика
  { category: "Пневматика", item: "Давление воздуха" },
  { category: "Пневматика", item: "Утечки воздуха" },
  { category: "Пневматика", item: "Фильтры воздуха" },
  { category: "Пневматика", item: "Компрессор" },
  { category: "Пневматика", item: "Пневмоцилиндры" },
  
  // Смазка
  { category: "Смазка", item: "Точки смазки" },
  { category: "Смазка", item: "Качество смазки" },
  { category: "Смазка", item: "Количество смазки" },
  { category: "Смазка", item: "Центральная смазка" },
  { category: "Смазка", item: "Охлаждающая жидкость" },
  
  // Чистота
  { category: "Чистота", item: "Общая чистота" },
  { category: "Чистота", item: "Очистка фильтров" },
  { category: "Чистота", item: "Удаление стружки" },
  { category: "Чистота", item: "Рабочая зона" },
  { category: "Чистота", item: "Инструментальная оснастка" },
  
  // Функциональность
  { category: "Функциональность", item: "Рабочие параметры" },
  { category: "Функциональность", item: "Точность работы" },
  { category: "Функциональность", item: "Шум и вибрация" },
  { category: "Функциональность", item: "Скорости подач" },
  { category: "Функциональность", item: "Система ЧПУ" },
  { category: "Функциональность", item: "Калибровка" },
  
  // Система охлаждения
  { category: "Система охлаждения", item: "Подача СОЖ" },
  { category: "Система охлаждения", item: "Фильтрация СОЖ" },
  { category: "Система охлаждения", item: "Температура СОЖ" },
  { category: "Система охлаждения", item: "Насос СОЖ" },
  
  // Инструмент
  { category: "Инструмент", item: "Состояние инструмента" },
  { category: "Инструмент", item: "Крепление инструмента" },
  { category: "Инструмент", item: "Магазин инструментов" },
  { category: "Инструмент", item: "Система смены инструмента" }
];

// Компонент панели администратора для настройки чек-листов
const ChecklistAdminPanel = ({ 
  equipment, 
  onSave, 
  getChecklistByEquipmentId 
}: {
  equipment: Equipment[];
  onSave: (equipmentId: string, equipmentName: string, selectedItems: ChecklistItem[]) => Promise<void>;
  getChecklistByEquipmentId: (equipmentId: string) => InspectionChecklist | null;
}) => {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [selectedItems, setSelectedItems] = useState<ChecklistItem[]>([]);

  // Загружаем существующий чек-лист при выборе оборудования
  useEffect(() => {
    const loadChecklistForEquipment = () => {
      if (selectedEquipmentId) {
        const existingChecklist = getChecklistByEquipmentId(selectedEquipmentId);
        console.log('Загружаем чек-лист для оборудования:', selectedEquipmentId, existingChecklist);
        
        if (existingChecklist && existingChecklist.checkItems.length > 0) {
          // Парсим существующие элементы чек-листа
          const parsedItems = existingChecklist.checkItems.map((itemStr: string) => {
            const [category, item] = itemStr.split(':');
            return {
              category: category?.trim() || '',
              item: item?.trim() || ''
            };
          }).filter(item => item.category && item.item);
          console.log('Установлены элементы из сохраненного чек-листа:', parsedItems.length);
          setSelectedItems(parsedItems);
        } else {
          // Если нет существующего чек-листа, показываем базовые элементы как выбранные
          console.log('Установлены базовые элементы чек-листа');
          setSelectedItems(allInspectionItems.slice(0, 20));
        }
      } else {
        setSelectedItems([]);
      }
    };

    loadChecklistForEquipment();
  }, [selectedEquipmentId, getChecklistByEquipmentId]);

  // Добавляем прослушивание событий обновления чек-листов
  useEffect(() => {
    const handleChecklistUpdate = () => {
      // Перезагружаем данные для текущего оборудования с небольшой задержкой
      setTimeout(() => {
        if (selectedEquipmentId) {
          const existingChecklist = getChecklistByEquipmentId(selectedEquipmentId);
          console.log('Событие обновления чек-листа получено для:', selectedEquipmentId, existingChecklist);
          
          if (existingChecklist && existingChecklist.checkItems.length > 0) {
            const parsedItems = existingChecklist.checkItems.map((itemStr: string) => {
              const [category, item] = itemStr.split(':');
              return {
                category: category?.trim() || '',
                item: item?.trim() || ''
              };
            }).filter(item => item.category && item.item);
            setSelectedItems(parsedItems);
            console.log('Обновлены элементы чек-листа после события:', parsedItems.length);
          }
        }
      }, 200);
    };

    window.addEventListener('checklistsUpdated', handleChecklistUpdate);
    return () => window.removeEventListener('checklistsUpdated', handleChecklistUpdate);
  }, [selectedEquipmentId, getChecklistByEquipmentId]);

  const toggleItem = (item: ChecklistItem) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.category === item.category && i.item === item.item);
      if (exists) {
        return prev.filter(i => !(i.category === item.category && i.item === item.item));
      } else {
        return [...prev, item];
      }
    });
  };

  const handleSave = () => {
    if (selectedEquipmentId && selectedItems.length > 0) {
      const selectedEquipment = equipment.find(eq => eq.id === selectedEquipmentId);
      if (selectedEquipment) {
        onSave(selectedEquipmentId, selectedEquipment.name, selectedItems);
      }
    }
  };

  // Группируем элементы по категориям
  const groupedItems = allInspectionItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  return (
    <div className="space-y-6">
      {/* Выбор оборудования */}
      <div>
        <Label htmlFor="equipment-select">Выберите оборудование</Label>
        <Select value={selectedEquipmentId} onValueChange={setSelectedEquipmentId}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите конкретное оборудование" />
          </SelectTrigger>
          <SelectContent>
            {equipment.map(eq => (
              <SelectItem key={eq.id} value={eq.id}>
                {eq.name} ({eq.type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedEquipmentId && (
        <>
          {/* Статистика */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-xl font-bold text-green-600">{selectedItems.length}</div>
              <div className="text-xs text-gray-600">Выбрано</div>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-xl font-bold text-blue-600">{allInspectionItems.length}</div>
              <div className="text-xs text-gray-600">Доступно</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="text-xl font-bold text-purple-600">{Object.keys(groupedItems).length}</div>
              <div className="text-xs text-gray-600">Категорий</div>
            </div>
          </div>

          {/* Список пунктов проверки по категориям */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
            {Object.entries(groupedItems).map(([category, items]) => (
              <Card key={category} className="h-fit">
                <CardHeader className="pb-2 px-4 pt-3">
                  <CardTitle className="text-sm font-medium">{category}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 px-4 pb-3">
                  {items.map((item, index) => {
                    const isSelected = selectedItems.find(i => 
                      i.category === item.category && i.item === item.item
                    );
                    
                    return (
                      <div key={index} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${category}-${index}`}
                          checked={!!isSelected}
                          onCheckedChange={() => toggleItem(item)}
                        />
                        <Label 
                          htmlFor={`${category}-${index}`}
                          className="text-xs font-normal cursor-pointer leading-4"
                        >
                          {item.item}
                        </Label>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Кнопка сохранения */}
          <div className="flex justify-end space-x-4">
            <Button
              onClick={handleSave}
              disabled={selectedItems.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Сохранить чек-лист
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default function DailyInspection() {
  const { user } = useAuth();
  const { isAdmin } = useAccessControl();
  const {
    filterValue,
    setFilterValue,
    filterSubdivisionId,
    availableSubdivisions,
    showFilter,
    filterLabel,
  } = useSubdivisionFilter();
  const { checklists, createChecklist, updateChecklist, getChecklistByEquipmentId } = useInspectionChecklists();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Загрузка оборудования из API
  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ['/api/equipment'],
  });

  const activeEquipment = useMemo(
    () => equipment.filter((eq: Equipment) => eq.status !== "decommissioned"),
    [equipment]
  );

  const subdivisionScopedEquipment = useMemo(
    () => filterItemsBySubdivision(activeEquipment, filterSubdivisionId),
    [activeEquipment, filterSubdivisionId]
  );

  const inspectableEquipment = useMemo(
    () => subdivisionScopedEquipment.filter((eq) => isEquipmentAvailableForInspection(eq)),
    [subdivisionScopedEquipment]
  );

  // Мутация для создания ежедневного осмотра
  const createDailyInspectionMutation = useMutation({
    mutationFn: async (inspectionData: InsertDailyInspection) => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/daily-inspections', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(inspectionData),
      });
      if (!response.ok) throw new Error('Failed to create inspection');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-inspections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/equipment'] });
      queryClient.invalidateQueries({ queryKey: ['/api/remarks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      window.dispatchEvent(new CustomEvent('dailyInspectionsUpdated'));
    },
  });

  // Состояния
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [isInspectionDialogOpen, setIsInspectionDialogOpen] = useState(false);
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);

  // Загрузка ежедневных осмотров из базы данных
  const { data: dailyInspections = [] } = useQuery<DailyInspection[]>({
    queryKey: ['/api/daily-inspections'],
  });

  // Автосохранение состояния осмотра
  const saveInspectionProgress = (equipmentId: string, items: InspectionItem[]) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const progressKey = `inspection-progress-${equipmentId}-${today}`;
    localStorage.setItem(progressKey, JSON.stringify({
      equipmentId,
      items,
      timestamp: new Date().toISOString()
    }));
  };

  const loadInspectionProgress = (equipmentId: string): InspectionItem[] | null => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const progressKey = `inspection-progress-${equipmentId}-${today}`;
    const saved = localStorage.getItem(progressKey);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Проверяем, что данные не старше 2 часов
        const savedTime = new Date(parsed.timestamp);
        const now = new Date();
        const diffHours = (now.getTime() - savedTime.getTime()) / (1000 * 60 * 60);
        
        if (diffHours < 2) {
          return parsed.items;
        } else {
          // Удаляем устаревшие данные
          localStorage.removeItem(progressKey);
        }
      } catch (error) {
        console.error('Ошибка загрузки прогресса осмотра:', error);
      }
    }
    
    return null;
  };

  const clearInspectionProgress = (equipmentId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const progressKey = `inspection-progress-${equipmentId}-${today}`;
    localStorage.removeItem(progressKey);
  };

  // Состояние осмотров оборудования (синхронизация с базой данных)
  const [equipmentInspections, setEquipmentInspections] = useState<Record<string, EquipmentInspection>>({});

  // Синхронизация локального состояния с данными из базы данных
  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayInspections = dailyInspections.filter((inspection: DailyInspection) => {
      const inspectionDate = new Date(inspection.inspectionDate);
      return format(inspectionDate, "yyyy-MM-dd") === today;
    });

    const inspectionsByEquipment: Record<string, EquipmentInspection> = {};

    todayInspections.forEach((inspection: DailyInspection) => {
      inspectionsByEquipment[inspection.equipmentId] = {
        equipmentId: inspection.equipmentId,
        dailyInspectionId: inspection.id,
        status: inspection.status === "completed" ? "completed" : "in_progress",
        inspectedBy: inspection.inspectedBy,
        inspectionDate: new Date(inspection.inspectionDate),
        issues: countInspectionIssues(inspection),
        workingStatus: mapDbWorkingStatus(inspection.workingStatus),
        notes: Array.isArray(inspection.comments) ? inspection.comments.join("; ") : "",
      };
    });

    setEquipmentInspections(inspectionsByEquipment);
  }, [dailyInspections]);

  // Сохранение данных осмотров в localStorage при изменении
  // Локальное сохранение удалено для синхронизации с базой данных

  // Функция сохранения кастомного чек-листа
  const handleSaveChecklist = async (equipmentId: string, equipmentName: string, selectedItems: ChecklistItem[]) => {
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Недостаточно прав",
        description: "Настройка осмотров доступна только администратору",
      });
      return;
    }

    try {
      const checkItems = selectedItems.map(item => `${item.category}: ${item.item}`);
      
      const existingChecklist = getChecklistByEquipmentId(equipmentId);
      
      if (existingChecklist) {
        // Обновляем существующий чек-лист
        await updateChecklist(existingChecklist.id, {
          checkItems,
          equipmentName
        });
        console.log('Обновлен существующий чек-лист ID:', existingChecklist.id);
      } else {
        // Создаем новый чек-лист
        const checklistData = {
          equipmentId,
          equipmentName,
          checkItems,
          createdBy: user?.name || "Администратор"
        };
        await createChecklist(checklistData);
        console.log('Создан новый чек-лист для оборудования:', equipmentId);
      }

      toast({
        title: "Чек-лист сохранен",
        description: `Настройки для оборудования "${equipmentName}" успешно сохранены.`
      });
      
      setIsAdminDialogOpen(false);
    } catch (error) {
      console.error('Ошибка сохранения чек-листа:', error);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось сохранить чек-лист"
      });
    }
  };

  // Функция сохранения осмотра
  const handleSaveInspection = async () => {
    if (!selectedEquipment) return;

    const deviatedItems = getDeviatedItems(inspectionItems);
    const criticalIssues = deviatedItems.filter((item) => item.status === 'critical').length;
    const attentionIssues = deviatedItems.filter((item) => item.status === 'attention').length;
    const totalIssues = deviatedItems.length;
    const commentLines = buildInspectionCommentLines(inspectionItems, generalNotes);

    let workingStatus: 'working' | 'not_working' | 'maintenance' = 'working';
    if (criticalIssues > 0) {
      workingStatus = 'not_working';
    } else if (attentionIssues > 2) {
      workingStatus = 'maintenance';
    }

    const inspectionData = {
      equipmentId: selectedEquipment.id,
      equipmentName: selectedEquipment.name,
      inspectionDate: new Date(),
      inspectedBy: user?.name || 'Неизвестно',
      status: 'completed',
      checkResults: inspectionItems.map((item) => mapStatusToCheckResult(item.status)),
      comments: commentLines,
      issuesCount: totalIssues,
      workingStatus,
    };

    try {
      const savedInspection = await createDailyInspectionMutation.mutateAsync(inspectionData);

      // Обновляем локальное состояние
      setEquipmentInspections((prev) => ({
        ...prev,
        [selectedEquipment.id]: {
          equipmentId: selectedEquipment.id,
          dailyInspectionId: savedInspection.id,
          status: "completed",
          inspectedBy: user?.name || "Неизвестно",
          inspectionDate: new Date(),
          issues: totalIssues,
          workingStatus,
          notes: commentLines.join("; "),
        },
      }));

      // Очищаем сохраненный прогресс после успешного завершения
      clearInspectionProgress(selectedEquipment.id);

      // Отправляем событие для синхронизации замечаний на всех страницах
      window.dispatchEvent(new CustomEvent('remarksUpdated'));

      toast({
        title: "Осмотр завершен",
        description: `Оборудование ${selectedEquipment.name} осмотрено. Обнаружено проблем: ${totalIssues}`,
      });

      setIsInspectionDialogOpen(false);
      setSelectedEquipment(null);
      setGeneralNotes("");
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить результаты осмотра",
        variant: "destructive",
      });
      console.error('Ошибка сохранения осмотра:', error);
    }
  };

  // Автосохранение при изменении элементов осмотра
  useEffect(() => {
    if (selectedEquipment && inspectionItems.length > 0) {
      saveInspectionProgress(selectedEquipment.id, inspectionItems);
    }
  }, [inspectionItems, selectedEquipment]);

  // Функция загрузки элементов осмотра из базы данных
  const loadInspectionItemsFromDatabase = (equipment: Equipment, prioritizeProgress: boolean = true) => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayInspection = dailyInspections.find(
      (row) =>
        row.equipmentId === equipment.id &&
        format(new Date(row.inspectionDate), "yyyy-MM-dd") === todayStr
    );

    // Загружаем чек-лист из базы данных первым делом
    const checklist = getChecklistByEquipmentId(equipment.id);
    let items: ChecklistItem[] = [];
    
    if (checklist && checklist.checkItems.length > 0) {
      // Используем кастомный чек-лист из базы данных
      items = checklist.checkItems.map((itemStr: string) => {
        const [category, item] = itemStr.split(':');
        return {
          category: category?.trim() || '',
          item: item?.trim() || ''
        };
      }).filter(item => item.category && item.item);
      console.log('Загружены элементы из базы данных:', items.length);
    } else {
      // Используем базовый чек-лист (первые 20 элементов)
      items = allInspectionItems.slice(0, 20);
      console.log('Загружены базовые элементы чек-листа');
    }

    // Создаем базовые элементы осмотра на основе чек-листа
    const baseItems: InspectionItem[] = items.map((item, index) => ({
      id: `${equipment.id}-${index}`,
      category: item.category,
      item: item.item,
      checked: false,
      status: "ok" as const,
    }));

    if (
      todayInspection?.checkResults?.length &&
      todayInspection.status === "completed"
    ) {
      const fromDb = baseItems.map((baseItem, index) => {
        const result = todayInspection.checkResults[index];
        const status = mapCheckResultToStatus(result);
        return {
          ...baseItem,
          checked: result != null && result !== "ok",
          status,
        };
      });
      setInspectionItems(fromDb);
      const commentLine = (todayInspection.comments ?? []).find((line) =>
        line.startsWith("Комментарий:")
      );
      if (commentLine) {
        setGeneralNotes(commentLine.replace(/^Комментарий:\s*/, "").trim());
      } else {
        setGeneralNotes("");
      }
      return;
    }

    // Если есть сохраненный прогресс, восстанавливаем только статусы и заметки
    if (prioritizeProgress) {
      const savedProgress = loadInspectionProgress(equipment.id);
      
      if (savedProgress && savedProgress.length > 0) {
        // Совмещаем структуру из базы данных с сохраненным прогрессом
        const mergedItems = baseItems.map(baseItem => {
          const savedItem = savedProgress.find(saved => 
            saved.category === baseItem.category && saved.item === baseItem.item
          );
          
          if (savedItem) {
            return {
              ...baseItem,
              checked: savedItem.checked,
              status: savedItem.status,
            };
          }
          
          return baseItem;
        });
        
        setInspectionItems(mergedItems);
        console.log('Загружены элементы из базы данных с восстановленным прогрессом');
        toast({
          title: "Прогресс восстановлен",
          description: "Загружен сохраненный прогресс осмотра",
        });
        return;
      }
    }

    setInspectionItems(baseItems);
  };

  // Обновляем элементы осмотра при выборе оборудования
  useEffect(() => {
    if (selectedEquipment) {
      loadInspectionItemsFromDatabase(selectedEquipment);
    }
  }, [selectedEquipment, checklists, dailyInspections, getChecklistByEquipmentId]);

  // Прослушиваем события обновления чек-листов и перезагружаем элементы
  useEffect(() => {
    const handleChecklistUpdate = () => {
      if (selectedEquipment) {
        console.log('Получено событие обновления чек-листов, перезагружаем элементы');
        // Небольшая задержка для обновления данных в провайдере
        setTimeout(() => {
          // При обновлении чек-листа не учитываем локальный прогресс
          loadInspectionItemsFromDatabase(selectedEquipment, false);
        }, 100);
      }
    };

    window.addEventListener('checklistsUpdated', handleChecklistUpdate);
    return () => window.removeEventListener('checklistsUpdated', handleChecklistUpdate);
  }, [selectedEquipment, getChecklistByEquipmentId]);

  if (!user) {
    return null;
  }

  const categories = ["all", "Безопасность", "Механическая часть", "Гидравлика", "Электрика", "Пневматика", "Смазка", "Чистота", "Функциональность", "Система охлаждения", "Инструмент"];
  const equipmentCategories = [
    "all",
    ...Array.from(new Set(inspectableEquipment.map((eq: Equipment) => eq.type))),
  ];

  const excludedFromInspectionCount =
    subdivisionScopedEquipment.length - inspectableEquipment.length;

  // Фильтрация оборудования для осмотра
  const filteredEquipment = inspectableEquipment.filter((eq: Equipment) => {
    const matchesSearch = eq.name.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesCategory = categoryFilter === "all" || eq.type === categoryFilter;
    const inspection = equipmentInspections[eq.id];
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "inspected" && inspection?.status === 'completed') ||
      (statusFilter === "not_inspected" && (!inspection || inspection.status !== 'completed')) ||
      (statusFilter === "working" && (!inspection || inspection.workingStatus === 'working')) ||
      (statusFilter === "not_working" && inspection?.workingStatus === 'not_working') ||
      (statusFilter === "maintenance" && inspection?.workingStatus === 'maintenance');
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusText = (status: string) => {
    switch (status) {
      case 'not_started': return 'Не начат';
      case 'in_progress': return 'В процессе';
      case 'completed': return 'Завершен';
      default: return 'Не начат';
    }
  };

  const getWorkingStatusText = (status: string) => {
    switch (status) {
      case 'working': return 'Работает';
      case 'not_working': return 'Не работает';
      case 'maintenance': return 'На обслуживании';
      default: return 'Работает';
    }
  };

  return (
    <>
      <Helmet>
        <title>Ежедневный осмотр оборудования - StarLine</title>
        <meta name="description" content="Система ежедневного осмотра и контроля состояния производственного оборудования" />
      </Helmet>

      <div className="p-4">
          <div className="w-full">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Ежедневный осмотр оборудования
                  </h1>
                </div>
                
                {isAdmin && (
                  <Button
                    onClick={() => setIsAdminDialogOpen(true)}
                    variant="outline"
                    size="sm"
                    className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    <span className="text-xs">Настройка</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Фильтры */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-4 space-y-3">
              {showFilter && (
                <div className="flex flex-wrap items-end gap-3">
                  <SubdivisionFilterSelect
                    value={filterValue}
                    onChange={setFilterValue}
                    subdivisions={availableSubdivisions}
                    showAll={isAdmin}
                    className="w-full sm:w-64"
                  />
                  <p className="text-xs text-muted-foreground pb-2">
                    {filterSubdivisionId == null && isAdmin
                      ? "Все подразделения"
                      : filterLabel}
                  </p>
                </div>
              )}
              {!showFilter && filterLabel && (
                <p className="text-sm text-muted-foreground">
                  Подразделение: <span className="font-medium text-foreground">{filterLabel}</span>
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="search" className="text-xs">Поиск</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                    <Input
                      id="search"
                      placeholder="Название..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="category" className="text-xs">Тип</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {equipmentCategories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category === "all" ? "Все типы" : category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="status" className="text-xs">Статус</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="inspected">Осмотрено</SelectItem>
                      <SelectItem value="not_inspected">Не осмотрено</SelectItem>
                      <SelectItem value="working">Работает</SelectItem>
                      <SelectItem value="not_working">Не работает</SelectItem>
                      <SelectItem value="maintenance">Обслуживание</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-end">
                  <Button
                    onClick={() => {
                      setSearchFilter("");
                      setCategoryFilter("all");
                      setStatusFilter("all");
                      if (isAdmin) setFilterValue("all");
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full h-8"
                  >
                    <Filter className="w-3 h-3 mr-1" />
                    <span className="text-xs">Сбросить</span>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Для осмотра: {filteredEquipment.length} из {inspectableEquipment.length}
                {excludedFromInspectionCount > 0 && (
                  <span>
                    {" "}
                    · скрыто {excludedFromInspectionCount} (на ТО, в ремонте или неактивно)
                  </span>
                )}
              </p>
            </div>

            {/* Список оборудования */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-2">
              {filteredEquipment.length === 0 && (
                <div className="col-span-full py-8 text-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  Нет оборудования для осмотра
                  {excludedFromInspectionCount > 0
                    ? " — всё доступное сейчас на ТО, в ремонте в другом подразделении или неактивно"
                    : ""}
                </div>
              )}
              {filteredEquipment.map((eq) => {
                const inspection = equipmentInspections[eq.id];
                const statusColor = inspection?.status === 'completed' ? 'green' : 
                                  inspection?.status === 'in_progress' ? 'yellow' : 'gray';
                const workingStatusColor = inspection?.workingStatus === 'working' ? 'green' :
                                         inspection?.workingStatus === 'not_working' ? 'red' : 'orange';

                return (
                  <Card key={eq.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-1 px-3 pt-2">
                      <div className="flex flex-col space-y-1">
                        <CardTitle className="text-xs font-medium truncate">{eq.name}</CardTitle>
                        <Badge variant="outline" className="text-xs self-start">{eq.type}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">Осмотр:</span>
                          <Badge 
                            className={`text-xs px-1 py-0 ${
                              statusColor === 'green' ? 'bg-green-100 text-green-800' :
                              statusColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {getStatusText(inspection?.status || 'not_started')}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">Статус:</span>
                          <Badge 
                            className={`text-xs px-1 py-0 ${
                              workingStatusColor === 'green' ? 'bg-green-100 text-green-800' :
                              workingStatusColor === 'red' ? 'bg-red-100 text-red-800' :
                              'bg-orange-100 text-orange-800'
                            }`}
                          >
                            {getWorkingStatusText(inspection?.workingStatus || 'working')}
                          </Badge>
                        </div>
                        
                        {inspection?.issues > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Замечаний:</span>
                            <Badge variant="destructive" className="text-xs px-1">{inspection.issues}</Badge>
                          </div>
                        )}
                        
                        {inspection?.inspectedBy && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Осмотрел:</span>
                            <span className="text-xs font-medium">{inspection.inspectedBy}</span>
                          </div>
                        )}
                        
                        <Button
                          onClick={() => {
                            setSelectedEquipment(eq);
                            setIsInspectionDialogOpen(true);
                          }}
                          className="w-full mt-1 h-7"
                          size="sm"
                          variant={inspection?.status === 'completed' ? 'outline' : 'default'}
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          <span className="text-xs">{inspection?.status === 'completed' ? 'Просмотр' : 'Осмотр'}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredEquipment.length === 0 && (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Оборудование не найдено
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Попробуйте изменить параметры фильтрации
                </p>
              </div>
            )}
          </div>
      </div>

      {/* Диалог проведения осмотра */}
      <Dialog open={isInspectionDialogOpen} onOpenChange={setIsInspectionDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Осмотр оборудования: {selectedEquipment?.name}</DialogTitle>
            <DialogDescription>
              Проведите ежедневный осмотр оборудования по пунктам чек-листа
            </DialogDescription>
          </DialogHeader>
          
          {selectedEquipment && (
            <div className="space-y-4">
              {/* Информация об оборудовании */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium">Оборудование:</span>
                    <p>{selectedEquipment.name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Тип:</span>
                    <p>{selectedEquipment.type}</p>
                  </div>
                </div>
              </div>

              {/* Кнопки управления */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Кнопка "Отметить все как норма" для администратора */}
                {isAdmin && (
                  <Button
                    onClick={() => {
                      setInspectionItems(prev => prev.map(item => ({
                        ...item,
                        checked: true,
                        status: 'ok' as const
                      })));
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Отметить все как "В норме"
                  </Button>
                )}
                
                {/* Кнопка сохранения прогресса */}
                <Button
                  onClick={() => {
                    if (selectedEquipment) {
                      saveInspectionProgress(selectedEquipment.id, inspectionItems);
                      toast({
                        title: "Прогресс сохранен",
                        description: "Данные осмотра сохранены локально",
                      });
                    }
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Сохранить прогресс
                </Button>
              </div>

              {/* Список пунктов осмотра */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {inspectionItems.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id={item.id}
                        checked={item.checked}
                        onCheckedChange={(checked) => {
                          setInspectionItems(prev => prev.map(i => 
                            i.id === item.id ? { ...i, checked: !!checked } : i
                          ));
                        }}
                      />
                      <div className="flex-1 space-y-2">
                        <label htmlFor={item.id} className="text-sm font-medium cursor-pointer">
                          {item.category}: {item.item}
                        </label>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={item.status === 'ok' ? 'default' : 'outline'}
                            onClick={() => setInspectionItems(prev => prev.map(i => 
                              i.id === item.id ? { ...i, status: 'ok' } : i
                            ))}
                            className="h-6 text-xs"
                          >
                            В норме
                          </Button>
                          <Button
                            size="sm"
                            variant={item.status === 'attention' ? 'default' : 'outline'}
                            onClick={() => setInspectionItems(prev => prev.map(i => 
                              i.id === item.id ? { ...i, status: 'attention' } : i
                            ))}
                            className="h-6 text-xs"
                          >
                            Внимание
                          </Button>
                          <Button
                            size="sm"
                            variant={item.status === 'critical' ? 'default' : 'outline'}
                            onClick={() => setInspectionItems(prev => prev.map(i => 
                              i.id === item.id ? { ...i, status: 'critical' } : i
                            ))}
                            className="h-6 text-xs"
                          >
                            Критично
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {getDeviatedItems(inspectionItems).length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <Label>Пункты с изменённым статусом</Label>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {getDeviatedItems(inspectionItems).map((item) => (
                      <li key={item.id}>
                        {item.category}: {item.item} — {getStatusLabel(item.status)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="general-notes">Комментарий к осмотру</Label>
                <Textarea
                  id="general-notes"
                  placeholder="Общий комментарий по результатам осмотра. Пункты с отклонениями будут добавлены автоматически."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  className="min-h-24"
                />
              </div>

              {/* Статистика осмотра */}
              <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
                <div className="space-y-3">
                  {/* Прогресс бар */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Прогресс осмотра</span>
                      <span>{Math.round((inspectionItems.filter(i => i.checked).length / inspectionItems.length) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${(inspectionItems.filter(i => i.checked).length / inspectionItems.length) * 100}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                  
                  {/* Статистика */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span className="text-sm font-medium">Проверено:</span>
                      <p className="text-lg font-bold text-blue-600">
                        {inspectionItems.filter(i => i.checked).length}/{inspectionItems.length}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Замечания:</span>
                      <p className="text-lg font-bold text-yellow-600">
                        {getDeviatedItems(inspectionItems).length}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Критичные:</span>
                      <p className="text-lg font-bold text-red-600">
                        {inspectionItems.filter(i => i.status === 'critical').length}
                      </p>
                    </div>
                  </div>
                  
                  {/* Индикатор автосохранения */}
                  <div className="text-xs text-gray-600 flex items-center gap-1">
                    <Save className="w-3 h-3" />
                    Прогресс автоматически сохраняется
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsInspectionDialogOpen(false);
              setSelectedEquipment(null);
              setGeneralNotes("");
            }}>
              Отмена
            </Button>
            <Button 
              onClick={handleSaveInspection}
              disabled={inspectionItems.filter(i => i.checked).length === 0}
            >
              Завершить осмотр
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог настройки чек-листов */}
      {isAdmin && (
      <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Настройка чек-листов осмотра</DialogTitle>
            <DialogDescription>
              Выберите оборудование и настройте пункты проверки для ежедневного осмотра
            </DialogDescription>
          </DialogHeader>
          
          <ChecklistAdminPanel
            equipment={subdivisionScopedEquipment}
            onSave={handleSaveChecklist}
            getChecklistByEquipmentId={(id) => getChecklistByEquipmentId(id) ?? null}
          />
        </DialogContent>
      </Dialog>
      )}
    </>
  );
}