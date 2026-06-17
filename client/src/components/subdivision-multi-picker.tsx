import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSubdivisions } from "@/hooks/use-subdivisions";

type Props = {
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  /** Если задано — показывать только эти подразделения */
  allowedIds?: number[];
};

export function SubdivisionMultiPicker({
  value,
  onChange,
  disabled,
  label = "Подразделения",
  description,
  allowedIds,
}: Props) {
  const { data: subdivisions = [] } = useSubdivisions();
  const visible = allowedIds?.length
    ? subdivisions.filter((s) => allowedIds.includes(s.id))
    : subdivisions;
  const selected = new Set(value);

  const toggle = (id: number, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="grid gap-2 sm:grid-cols-2 max-h-36 overflow-y-auto border rounded-md p-2">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-2">Подразделения не найдены</p>
        ) : (
          visible.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer min-w-0">
              <Checkbox
                checked={selected.has(s.id)}
                disabled={disabled}
                onCheckedChange={(c) => toggle(s.id, c === true)}
              />
              <span className="text-multiline">{s.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
