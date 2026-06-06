import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link2, Plus, Trash2 } from "lucide-react";
import {
  EQUIPMENT_LINK_TYPES,
  equipmentLinkTypeLabel,
  type EquipmentLinkInput,
} from "@shared/equipment-link-constants";
import type { Equipment } from "@shared/schema";

interface EquipmentLinksFieldProps {
  equipmentId?: string;
  allEquipment: Equipment[];
  value: EquipmentLinkInput[];
  onChange: (links: EquipmentLinkInput[]) => void;
  disabled?: boolean;
}

export function EquipmentLinksField({
  equipmentId,
  allEquipment,
  value,
  onChange,
  disabled,
}: EquipmentLinksFieldProps) {
  const [selectedId, setSelectedId] = useState("");
  const [linkType, setLinkType] = useState<string>("works_with");
  const [note, setNote] = useState("");

  const linkedIds = useMemo(() => new Set(value.map((l) => l.linkedEquipmentId)), [value]);

  const availableEquipment = useMemo(
    () =>
      allEquipment.filter(
        (item) => item.id !== equipmentId && !linkedIds.has(item.id) && item.status !== "decommissioned"
      ),
    [allEquipment, equipmentId, linkedIds]
  );

  const equipmentById = useMemo(
    () => new Map(allEquipment.map((item) => [item.id, item])),
    [allEquipment]
  );

  const addLink = () => {
    if (!selectedId || linkedIds.has(selectedId)) return;
    onChange([
      ...value,
      {
        linkedEquipmentId: selectedId,
        linkType: linkType as EquipmentLinkInput["linkType"],
        note: note.trim() || null,
      },
    ]);
    setSelectedId("");
    setNote("");
    setLinkType("works_with");
  };

  const removeLink = (linkedEquipmentId: string) => {
    onChange(value.filter((link) => link.linkedEquipmentId !== linkedEquipmentId));
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Связанное оборудование
        </Label>
        <p className="text-xs text-muted-foreground mt-1">
          Укажите оборудование, с которым этот актив работает в связке
        </p>
      </div>

      {!disabled && (
        <div className="grid gap-2 p-3 border rounded-md bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Оборудование</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите оборудование" />
                </SelectTrigger>
                <SelectContent>
                  {availableEquipment.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Нет доступного оборудования
                    </SelectItem>
                  ) : (
                    availableEquipment.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.id})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Тип связи</Label>
              <Select value={linkType} onValueChange={setLinkType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_LINK_TYPES.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Комментарий</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Необязательно"
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addLink}
            disabled={!selectedId || selectedId === "__none__"}
          >
            <Plus className="h-3 w-3 mr-1" />
            Добавить связь
          </Button>
        </div>
      )}

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Связи не указаны</p>
      ) : (
        <ul className="space-y-2">
          {value.map((link) => {
            const item = equipmentById.get(link.linkedEquipmentId);
            return (
              <li
                key={link.linkedEquipmentId}
                className="flex items-start justify-between gap-2 p-2 border rounded-md text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {item?.name ?? link.linkedEquipmentId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item?.id ?? link.linkedEquipmentId}
                    {item?.type ? ` · ${item.type}` : ""}
                  </p>
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {equipmentLinkTypeLabel(link.linkType ?? "works_with")}
                  </Badge>
                  {link.note && (
                    <p className="text-xs text-muted-foreground mt-1">{link.note}</p>
                  )}
                </div>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLink(link.linkedEquipmentId)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
