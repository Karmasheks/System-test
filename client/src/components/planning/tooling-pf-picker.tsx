import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductionToolingView } from "@/hooks/use-production-planning";

type Props = {
  tooling: ProductionToolingView[];
  value: string;
  onChange: (toolingId: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function ToolingPfPicker({
  tooling,
  value,
  onChange,
  disabled,
  placeholder = "Не привязано",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...tooling].sort((a, b) => a.pfNumber.localeCompare(b.pfNumber, "ru")),
    [tooling]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.pfNumber.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const selected = sorted.find((t) => String(t.id) === value);

  const scrollList = (position: "start" | "middle" | "end") => {
    const el = listRef.current;
    if (!el) return;
    if (position === "start") el.scrollTop = 0;
    else if (position === "end") el.scrollTop = el.scrollHeight;
    else el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  };

  const pick = (id: string) => {
    onChange(id);
    setExpanded(false);
    setSearch("");
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        role="combobox"
        aria-expanded={expanded}
        className={cn(
          "w-full justify-between font-normal h-9 min-h-9",
          !selected && "text-muted-foreground"
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="truncate text-left pr-2">
          {selected ? (
            <>
              <span className="font-mono">{selected.pfNumber}</span>
              <span className="text-muted-foreground"> — {selected.name}</span>
            </>
          ) : (
            placeholder
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        )}
      </Button>

      {expanded && (
        <div
          className="rounded-md border bg-muted/20 p-2 space-y-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: номер ПФ, название…"
            className="h-8 text-sm bg-background"
            autoFocus
          />
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => scrollList("start")}
            >
              ↑ Начало
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => scrollList("middle")}
            >
              ↕ Середина
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => scrollList("end")}
            >
              ↓ Конец
            </Button>
            <span className="text-[11px] text-muted-foreground self-center ml-auto tabular-nums">
              {filtered.length} из {sorted.length}
            </span>
          </div>
          <div
            ref={listRef}
            className="max-h-[min(220px,35vh)] overflow-y-scroll overscroll-contain rounded-md border bg-background"
            role="listbox"
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={cn(
                "flex w-full items-center gap-2 px-2 py-2 text-sm text-left hover:bg-muted/70 border-b",
                !value && "bg-muted/50"
              )}
              onClick={() => pick("")}
            >
              <Check className={cn("h-4 w-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
              <span className="text-muted-foreground">Не привязано</span>
            </button>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-4 text-center">
                Ничего не найдено
              </p>
            ) : (
              filtered.map((t) => {
                const id = String(t.id);
                const isSelected = value === id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-start gap-2 px-2 py-2 text-sm text-left hover:bg-muted/70 border-b last:border-b-0",
                      isSelected && "bg-muted/50"
                    )}
                    onClick={() => pick(id)}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0 mt-0.5",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0">
                      <span className="font-mono font-medium block">{t.pfNumber}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2">{t.name}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
