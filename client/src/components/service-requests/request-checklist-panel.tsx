import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useUpdateChecklistItem } from "@/hooks/use-service-requests";
import type { RequestChecklistItem } from "@shared/schema";

type Props = {
  requestId: number;
  items: RequestChecklistItem[];
  onUpdated: () => void;
  readOnly?: boolean;
};

export function RequestChecklistPanel({ requestId, items, onUpdated, readOnly }: Props) {
  const updateItem = useUpdateChecklistItem();
  const [drafts, setDrafts] = useState<Record<number, { comment: string; measurement: string }>>({});

  const done = items.filter((i) => i.isCompleted).length;

  const save = async (
    item: RequestChecklistItem,
    patch: { isCompleted?: boolean; comment?: string; measurementValue?: number }
  ) => {
    await updateItem.mutateAsync({ requestId, itemId: item.id, ...patch });
    onUpdated();
  };

  if (items.length === 0) return null;

  const byCategory = items.reduce<Record<string, RequestChecklistItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Выполнено {done} из {items.length}
        </p>
        <Badge variant={done === items.length ? "default" : "secondary"}>
          {done === items.length ? "Чек-лист готов" : "В процессе"}
        </Badge>
      </div>

      {Object.entries(byCategory).map(([category, catItems]) => (
        <div key={category} className="border rounded-lg p-3 space-y-3">
          <p className="font-medium text-sm">{category}</p>
          {catItems.map((item) => {
            const draft = drafts[item.id] ?? {
              comment: item.comment ?? "",
              measurement: item.measurementValue != null ? String(item.measurementValue) : "",
            };
            return (
              <div key={item.id} className="pl-2 border-l-2 border-muted space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={item.isCompleted}
                    disabled={readOnly || updateItem.isPending}
                    onCheckedChange={(checked) =>
                      save(item, { isCompleted: !!checked, comment: draft.comment || undefined })
                    }
                  />
                  <span className={`text-sm ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                    {item.itemText}
                  </span>
                </div>
                {item.measurementNorm && (
                  <p className="text-xs text-muted-foreground ml-6">
                    Норма: {item.measurementNorm} {item.measurementUnit ?? ""}
                  </p>
                )}
                {!readOnly && (
                  <div className="ml-6 flex flex-wrap gap-2">
                    {item.measurementNorm && (
                      <Input
                        className="w-24 h-8 text-sm"
                        placeholder="Замер"
                        value={draft.measurement}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [item.id]: { ...draft, measurement: e.target.value },
                          }))
                        }
                      />
                    )}
                    <Input
                      className="flex-1 min-w-[120px] h-8 text-sm"
                      placeholder="Комментарий"
                      value={draft.comment}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [item.id]: { ...draft, comment: e.target.value },
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() =>
                        save(item, {
                          isCompleted: item.isCompleted,
                          comment: draft.comment || undefined,
                          measurementValue: draft.measurement
                            ? Number(draft.measurement)
                            : undefined,
                        })
                      }
                    >
                      Сохранить
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
