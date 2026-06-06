import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Subdivision } from "@shared/schema";

type Props = {
  value: string;
  onChange: (value: string) => void;
  subdivisions: Subdivision[];
  showAll?: boolean;
  className?: string;
  label?: string;
};

export function SubdivisionFilterSelect({
  value,
  onChange,
  subdivisions,
  showAll = true,
  className,
  label = "Подразделение",
}: Props) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
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
    </div>
  );
}
