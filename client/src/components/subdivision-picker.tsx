import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubdivisions } from "@/hooks/use-subdivisions";

type Props = {
  value: string;
  onChange: (subdivisionId: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  /** Если задано — показывать только эти подразделения */
  allowedIds?: number[];
};

export function SubdivisionPicker({
  value,
  onChange,
  label = "Подразделение",
  required,
  className,
  allowEmpty = false,
  disabled = false,
  allowedIds,
}: Props) {
  const { data: subdivisions = [], isLoading } = useSubdivisions();
  const visible = allowedIds?.length
    ? subdivisions.filter((s) => allowedIds.includes(s.id))
    : subdivisions;

  return (
    <div className={className}>
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      <Select
        value={value || (allowEmpty ? "none" : "")}
        onValueChange={(v) => onChange(v === "none" ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Загрузка…" : "Выберите подразделение"} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value="none">Не выбрано</SelectItem>}
          {visible.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
