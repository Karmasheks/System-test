import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Equipment } from "@shared/schema";

type Props = {
  equipment: Equipment[];
  value: string[];
  onChange: (ids: string[]) => void;
  subdivisionIds?: number[];
  disabled?: boolean;
  label?: string;
  description?: string;
};

export function EquipmentMultiPicker({
  equipment,
  value,
  onChange,
  subdivisionIds = [],
  disabled,
  label = "Оборудование",
  description,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = new Set(value);

  const equipmentById = useMemo(
    () => new Map(equipment.map((eq) => [eq.id, eq])),
    [equipment]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const subdivisionFilter = new Set(subdivisionIds);
    let list = [...equipment].sort((a, b) => a.name.localeCompare(b.name, "ru"));

    if (subdivisionIds.length > 0) {
      list = list.filter(
        (eq) => eq.subdivisionId != null && subdivisionFilter.has(eq.subdivisionId)
      );
    }

    if (!q) return list;
    return list.filter(
      (eq) =>
        eq.name.toLowerCase().includes(q) ||
        eq.id.toLowerCase().includes(q) ||
        (eq.subdivisionName ?? "").toLowerCase().includes(q)
    );
  }, [equipment, search, subdivisionIds]);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(Array.from(next));
  };

  const removeOne = (id: string) => {
    onChange(value.filter((item) => item !== id));
  };

  const triggerLabel =
    value.length === 0
      ? subdivisionIds.length > 0
        ? "Выберите оборудование подразделения"
        : "Выберите оборудование"
      : `Выбрано: ${value.length}`;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal h-9",
              value.length === 0 && "text-muted-foreground"
            )}
          >
            <span className="text-multiline">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="h-8 text-sm mb-2"
            disabled={disabled}
          />
          {subdivisionIds.length > 0 && (
            <p className="text-[11px] text-muted-foreground mb-2 px-1">
              Показано оборудование выбранных подразделений
            </p>
          )}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-2">
                {subdivisionIds.length > 0
                  ? "Нет оборудования в выбранных подразделениях"
                  : "Оборудование не найдено"}
              </p>
            ) : (
              filtered.map((eq) => (
                <label
                  key={eq.id}
                  className="flex items-start gap-2 text-sm cursor-pointer rounded-md px-1 py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(eq.id)}
                    disabled={disabled}
                    onCheckedChange={(c) => toggle(eq.id, c === true)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium block text-multiline">{eq.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {eq.id}
                      {eq.subdivisionName ? ` · ${eq.subdivisionName}` : ""}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => {
            const eq = equipmentById.get(id);
            return (
              <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1 max-w-full">
                <span className="text-multiline">{eq?.name ?? id}</span>
                {!disabled && (
                  <button
                    type="button"
                    className="rounded-sm hover:bg-muted p-0.5"
                    onClick={() => removeOne(id)}
                    aria-label={`Убрать ${eq?.name ?? id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
