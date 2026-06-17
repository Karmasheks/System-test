import { useState, useCallback, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Equipment } from '../../../shared/schema';
import { EquipmentImageUrlsField } from '@/components/equipment-image-urls';
import { EquipmentLinksField } from '@/components/equipment-links-field';
import { useTeamUsers } from "@/hooks/use-warehouse";
import { useEquipmentTypes } from "@/hooks/use-equipment-types";
import { SubdivisionPicker } from "@/components/subdivision-picker";
import { useEquipmentLinks } from "@/hooks/use-equipment-links";
import { linksToFormInput, type EquipmentLinkInput } from "@shared/equipment-link-constants";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS } from "@shared/equipment-status-constants";

const NONE_RESPONSIBLE = "__none__";

interface EquipmentFormProps {
  initialData?: Equipment;
  allEquipment: Equipment[];
  onSave: (data: Equipment, links: EquipmentLinkInput[]) => void;
  onCancel: () => void;
  isEdit?: boolean;
}

export default function EquipmentForm({ initialData, allEquipment, onSave, onCancel, isEdit = false }: EquipmentFormProps) {
  const { data: teamUsers = [] } = useTeamUsers();
  const { data: typesFromApi = [] } = useEquipmentTypes();
  const { data: existingLinks = [] } = useEquipmentLinks(initialData?.id);
  const [linkDrafts, setLinkDrafts] = useState<EquipmentLinkInput[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    type: "",
    description: "",
    status: "active",
    lastMaintenance: "",
    nextMaintenance: "",
    responsible: "",
    department: "",
    subdivisionId: "",
    maintenancePeriods: [] as string[],
    model: "",
    serialNumber: "",
    inventoryNumber: "",
    installationDate: "",
    warrantyUntil: "",
    location: "",
    confluenceUrl: "",
    imageUrls: [] as string[],
  });

  const [customType, setCustomType] = useState("");
  const [isCustomType, setIsCustomType] = useState(false);

  const equipmentTypes = useMemo(() => {
    const names = typesFromApi.map((t) => t.name);
    const set = new Set(names);
    if (formData.type?.trim() && !set.has(formData.type.trim())) {
      names.push(formData.type.trim());
    }
    return names.sort((a, b) => a.localeCompare(b, "ru"));
  }, [typesFromApi, formData.type]);

  const responsibleOptions = useMemo(() => {
    const names = teamUsers.map((user) => user.name).filter(Boolean);
    if (formData.responsible && !names.includes(formData.responsible)) {
      return [formData.responsible, ...names];
    }
    return names;
  }, [teamUsers, formData.responsible]);

  useEffect(() => {
    if (initialData?.id && !linksLoaded && existingLinks) {
      setLinkDrafts(linksToFormInput(existingLinks));
      setLinksLoaded(true);
    }
  }, [initialData?.id, existingLinks, linksLoaded]);

  useEffect(() => {
    if (!initialData?.id) {
      setLinkDrafts([]);
      setLinksLoaded(false);
    }
  }, [initialData?.id]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        id: initialData.id || "",
        name: initialData.name || "",
        type: initialData.type || "",
        description: initialData.description || "",
        status: initialData.status || "active",
        lastMaintenance: initialData.lastMaintenance || "",
        nextMaintenance: initialData.nextMaintenance || "",
        responsible: initialData.responsible || "",
        department: initialData.department || "",
        subdivisionId: initialData.subdivisionId ? String(initialData.subdivisionId) : "",
        maintenancePeriods: initialData.maintenancePeriods || [],
        model: initialData.model || "",
        serialNumber: initialData.serialNumber || "",
        inventoryNumber: initialData.inventoryNumber || "",
        installationDate: initialData.installationDate || "",
        warrantyUntil: initialData.warrantyUntil || "",
        location: initialData.location || "",
        confluenceUrl: initialData.confluenceUrl || "",
        imageUrls: initialData.imageUrls ?? [],
      });

      const isCustom = !equipmentTypes.includes(initialData.type || "");
      setIsCustomType(isCustom);
      if (isCustom) {
        setCustomType(initialData.type || "");
      }
    }
  }, [initialData, equipmentTypes]);

  const handleFieldChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, name: e.target.value }));
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, description: e.target.value }));
  }, []);

  const handleCustomTypeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomType(value);
    setFormData(prev => ({ ...prev, type: value }));
  }, []);

  const handleMaintenancePeriodChange = useCallback((period: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      maintenancePeriods: checked 
        ? [...prev.maintenancePeriods, period]
        : prev.maintenancePeriods.filter(p => p !== period)
    }));
  }, []);

  const handleSave = () => {
    if (!formData.name.trim() || !formData.type.trim()) {
      return;
    }
    onSave({
      ...formData,
      name: formData.name.trim(),
      type: formData.type.trim(),
      subdivisionId: formData.subdivisionId ? Number(formData.subdivisionId) : null,
      responsible: formData.responsible.trim(),
      description: formData.description || null,
      model: formData.model || null,
      serialNumber: formData.serialNumber || null,
      inventoryNumber: formData.inventoryNumber || null,
      installationDate: formData.installationDate || null,
      warrantyUntil: formData.warrantyUntil || null,
      location: formData.location || null,
      confluenceUrl: formData.confluenceUrl || null,
      imageUrls: formData.imageUrls.filter((u) => u.trim()),
    } as Equipment, linkDrafts);
  };

  const maintenancePeriods = ["1М - ТО", "3М - ТО", "6М - ТО", "1Г - ТО"];

  return (
    <div className="space-y-3 min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="name">Название оборудования *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={handleNameChange}
            placeholder="Введите название"
          />
        </div>
        <div>
          <Label htmlFor="type">Тип оборудования *</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="customTypeCheck"
                checked={isCustomType}
                onChange={(e) => {
                  setIsCustomType(e.target.checked);
                  if (!e.target.checked) {
                    setCustomType("");
                    handleFieldChange('type', '');
                  }
                }}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <Label htmlFor="customTypeCheck" className="text-sm">Ввести тип вручную</Label>
            </div>
            
            {isCustomType ? (
              <Input
                placeholder="Введите тип оборудования"
                value={customType}
                onChange={handleCustomTypeChange}
              />
            ) : (
              <Select value={formData.type} onValueChange={(value) => handleFieldChange('type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="description">Описание оборудования</Label>
        <Textarea
          id="description"
          className="min-h-[10rem] resize-y leading-relaxed"
          rows={6}
          value={formData.description}
          onChange={handleDescriptionChange}
          placeholder="Введите описание оборудования (опционально)"
        />
      </div>

      <SubdivisionPicker
        value={formData.subdivisionId}
        onChange={(id) => handleFieldChange("subdivisionId", id)}
        required
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="location">Местоположение</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => handleFieldChange("location", e.target.value)}
            placeholder="Цех / участок"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="model">Модель</Label>
          <Input id="model" value={formData.model} onChange={(e) => handleFieldChange("model", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="serialNumber">Серийный №</Label>
          <Input
            id="serialNumber"
            value={formData.serialNumber}
            onChange={(e) => handleFieldChange("serialNumber", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="inventoryNumber">Инвентарный №</Label>
          <Input
            id="inventoryNumber"
            value={formData.inventoryNumber}
            onChange={(e) => handleFieldChange("inventoryNumber", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="confluenceUrl">Confluence</Label>
          <Input
            id="confluenceUrl"
            value={formData.confluenceUrl}
            onChange={(e) => handleFieldChange("confluenceUrl", e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <EquipmentImageUrlsField
        urls={formData.imageUrls}
        onChange={(imageUrls) => setFormData((prev) => ({ ...prev, imageUrls }))}
      />

      <EquipmentLinksField
        equipmentId={initialData?.id}
        allEquipment={allEquipment}
        value={linkDrafts}
        onChange={setLinkDrafts}
        collapsible={!isEdit}
        defaultOpen={false}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="installationDate">Дата установки</Label>
          <Input
            id="installationDate"
            type="date"
            value={formData.installationDate}
            onChange={(e) => handleFieldChange("installationDate", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="warrantyUntil">Гарантия до</Label>
          <Input
            id="warrantyUntil"
            type="date"
            value={formData.warrantyUntil}
            onChange={(e) => handleFieldChange("warrantyUntil", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="status">Статус</Label>
          <Select value={formData.status} onValueChange={(value) => handleFieldChange('status', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT_STATUSES.map((code) => (
                <SelectItem key={code} value={code}>
                  {EQUIPMENT_STATUS_LABELS[code]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="responsible">Ответственный</Label>
          <Select
            value={formData.responsible || NONE_RESPONSIBLE}
            onValueChange={(value) =>
              handleFieldChange("responsible", value === NONE_RESPONSIBLE ? "" : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Не назначен" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_RESPONSIBLE}>Не назначен</SelectItem>
              {responsibleOptions.map((person) => (
                <SelectItem key={person} value={person}>{person}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {teamUsers.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              В системе пока нет пользователей — можно сохранить без ответственного
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="lastMaintenance">Последнее ТО</Label>
          <Input
            id="lastMaintenance"
            type="date"
            value={formData.lastMaintenance}
            onChange={(e) => handleFieldChange('lastMaintenance', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="nextMaintenance">Следующее ТО</Label>
          <Input
            id="nextMaintenance"
            type="date"
            value={formData.nextMaintenance}
            onChange={(e) => handleFieldChange('nextMaintenance', e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label>Периодичность ТО</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {maintenancePeriods.map((period) => (
            <div key={period} className="flex items-center space-x-2">
              <Checkbox
                id={`period-${period}`}
                checked={formData.maintenancePeriods.includes(period)}
                onCheckedChange={(checked) => handleMaintenancePeriodChange(period, !!checked)}
              />
              <Label htmlFor={`period-${period}`} className="text-sm">
                {period}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button onClick={handleSave} disabled={!formData.name.trim() || !formData.type.trim()}>
          {isEdit ? 'Сохранить изменения' : 'Добавить оборудование'}
        </Button>
      </div>
    </div>
  );
}
