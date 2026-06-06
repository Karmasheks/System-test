import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { VacationPeriod } from "@shared/user-presence-constants";

function newPeriod(): VacationPeriod {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID(),
    startDate: today,
    endDate: today,
  };
}

interface VacationPeriodsEditorProps {
  periods: VacationPeriod[];
  onChange: (periods: VacationPeriod[]) => void;
  disabled?: boolean;
}

export function VacationPeriodsEditor({ periods, onChange, disabled }: VacationPeriodsEditorProps) {
  const [localPeriods, setLocalPeriods] = useState<VacationPeriod[]>(periods);

  useEffect(() => {
    setLocalPeriods(periods);
  }, [periods]);

  const sync = (next: VacationPeriod[]) => {
    setLocalPeriods(next);
    onChange(next);
  };

  const updatePeriod = (id: string, patch: Partial<VacationPeriod>) => {
    sync(localPeriods.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePeriod = (id: string) => {
    sync(localPeriods.filter((p) => p.id !== id));
  };

  const addPeriod = () => {
    sync([...localPeriods, newPeriod()]);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Укажите периоды отпуска. В эти даты статус «В отпуске» будет выставляться автоматически. Если вы выйдете на работу во время отпуска, можно дополнительно указать активность (на работе, онлайн).
      </p>

      {localPeriods.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-md px-3 py-4 text-center">
          Периоды отпуска не заданы
        </p>
      ) : (
        <div className="space-y-3">
          {localPeriods.map((period) => (
            <div
              key={period.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end border rounded-md p-3"
            >
              <div className="space-y-2">
                <Label>Начало</Label>
                <Input
                  type="date"
                  value={period.startDate}
                  disabled={disabled}
                  onChange={(e) => updatePeriod(period.id, { startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Окончание</Label>
                <Input
                  type="date"
                  value={period.endDate}
                  disabled={disabled}
                  onChange={(e) => updatePeriod(period.id, { endDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Комментарий</Label>
                <Input
                  value={period.note ?? ""}
                  disabled={disabled}
                  placeholder="Необязательно"
                  onChange={(e) => updatePeriod(period.id, { note: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => removePeriod(period.id)}
                title="Удалить период"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" onClick={addPeriod} disabled={disabled}>
        <Plus className="h-4 w-4 mr-2" />
        Добавить период
      </Button>
    </div>
  );
}
