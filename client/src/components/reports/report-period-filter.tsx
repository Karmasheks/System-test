import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ReportPeriodPreset = "today" | "week" | "month" | "custom";

export function getReportPeriodRange(
  preset: ReportPeriodPreset,
  customFrom: string,
  customTo: string
): { from: string; to: string; label: string } {
  const now = new Date();
  if (preset === "today") {
    const d = format(now, "yyyy-MM-dd");
    return { from: d, to: d, label: "Сегодня" };
  }
  if (preset === "week") {
    const from = startOfWeek(now, { locale: ru });
    const to = endOfWeek(now, { locale: ru });
    return {
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
      label: "Неделя",
    };
  }
  if (preset === "month") {
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
      label: "Месяц",
    };
  }
  return {
    from: customFrom,
    to: customTo,
    label: `${format(new Date(customFrom), "d MMM", { locale: ru })} — ${format(new Date(customTo), "d MMM yyyy", { locale: ru })}`,
  };
}

export function ReportPeriodFilter({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  preset: ReportPeriodPreset;
  onPresetChange: (p: ReportPeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <Button
        type="button"
        size="sm"
        variant={preset === "today" ? "default" : "outline"}
        onClick={() => onPresetChange("today")}
      >
        Сегодня
      </Button>
      <Button
        type="button"
        size="sm"
        variant={preset === "week" ? "default" : "outline"}
        onClick={() => onPresetChange("week")}
      >
        Неделя
      </Button>
      <Button
        type="button"
        size="sm"
        variant={preset === "month" ? "default" : "outline"}
        onClick={() => onPresetChange("month")}
      >
        Месяц
      </Button>
      <Button
        type="button"
        size="sm"
        variant={preset === "custom" ? "default" : "outline"}
        onClick={() => onPresetChange("custom")}
      >
        Период
      </Button>
      {preset === "custom" && (
        <>
          <div>
            <Label className="text-xs">С</Label>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">По</Label>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
