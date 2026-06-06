import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWarehouseCategories, useWarehouseParts } from "@/hooks/use-warehouse";
import type { WarehousePart } from "@shared/schema";

export type PartReservationDraft = {
  enabled: boolean;
  categoryId: string;
  partId: string;
  quantity: string;
  partSearch: string;
};

export const emptyPartReservation: PartReservationDraft = {
  enabled: false,
  categoryId: "",
  partId: "",
  quantity: "1",
  partSearch: "",
};

type Props = {
  value: PartReservationDraft;
  onChange: (value: PartReservationDraft) => void;
};

export function PartReservationField({ value, onChange }: Props) {
  const { data: categories = [] } = useWarehouseCategories();
  const { data: parts = [] } = useWarehouseParts({
    categoryId: value.categoryId ? Number(value.categoryId) : undefined,
    search: value.partSearch || undefined,
  });

  const selectedPart = useMemo(
    () => parts.find((p) => String(p.id) === value.partId),
    [parts, value.partId]
  );

  const available = selectedPart
    ? (selectedPart.quantity ?? 0) - (selectedPart.reservedQuantity ?? 0)
    : null;

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Checkbox
          id="part-reserve-enabled"
          checked={value.enabled}
          onCheckedChange={(checked) =>
            onChange({ ...value, enabled: checked === true })
          }
        />
        <Label htmlFor="part-reserve-enabled" className="cursor-pointer font-medium">
          Зарезервировать запчасть (опционально)
        </Label>
      </div>

      {value.enabled && (
        <div className="space-y-3 pl-1">
          <div>
            <Label>Категория</Label>
            <Select
              value={value.categoryId || "all"}
              onValueChange={(categoryId) =>
                onChange({
                  ...value,
                  categoryId: categoryId === "all" ? "" : categoryId,
                  partId: "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Поиск запчасти</Label>
            <Input
              placeholder="Название, SAP, инв. номер..."
              value={value.partSearch}
              onChange={(e) => onChange({ ...value, partSearch: e.target.value, partId: "" })}
            />
          </div>

          <div>
            <Label>Запчасть</Label>
            <Select
              value={value.partId || "none"}
              onValueChange={(partId) =>
                onChange({ ...value, partId: partId === "none" ? "" : partId })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите запчасть" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбрано</SelectItem>
                {parts.map((p: WarehousePart) => {
                  const free = (p.quantity ?? 0) - (p.reservedQuantity ?? 0);
                  return (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} — свободно {free} шт.
                      {(p.reservedQuantity ?? 0) > 0 ? ` (зарезерв. ${p.reservedQuantity})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Количество</Label>
            <Input
              type="number"
              min="0.01"
              step="1"
              value={value.quantity}
              onChange={(e) => onChange({ ...value, quantity: e.target.value })}
            />
            {available != null && value.partId && (
              <p className="text-xs text-muted-foreground mt-1">
                Доступно для резерва: {available} шт.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function partReservationPayload(draft: PartReservationDraft) {
  if (!draft.enabled || !draft.partId) return undefined;
  const quantity = Number(draft.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return undefined;
  return { partId: Number(draft.partId), quantity };
}
