import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subdivision } from "@shared/schema";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  subdivisions: Subdivision[];
  showAll?: boolean;
  className?: string;
  label?: string;
  /** Без label над полем — в одну строку с другими фильтрами */
  inline?: boolean;
};

export function SubdivisionFilterSelect({
  value,
  onChange,
  subdivisions,
  showAll = true,
  className,
  label = "Подразделение",
  inline = false,
}: Props) {
  const select = (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-10", inline ? className : "w-full")}>
        {inline && <Filter className="w-4 h-4 mr-2 shrink-0" />}
        <SelectValue placeholder="Подразделение" />
      </SelectTrigger>
      <SelectContent>
        {showAll && <SelectItem value="all">Все подразделения</SelectItem>}
        {subdivisions.map((s) => (
          <SelectItem key={s.id} value={String(s.id)}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (inline) {
    return select;
  }

  return (
    <div className={className}>
      <Label>{label}</Label>
      {select}
    </div>
  );
}
