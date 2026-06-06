import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { SubdivisionPicker } from "@/components/subdivision-picker";

type Props = {
  primarySubdivisionId: string;
  onPrimaryChange: (id: string) => void;
  extraSubdivisionIds: number[];
  onExtraChange: (ids: number[]) => void;
  viewAllSubdivisions: boolean;
  onViewAllChange: (value: boolean) => void;
  disabled?: boolean;
  isAdminRole?: boolean;
};

export function SubdivisionAccessEditor({
  primarySubdivisionId,
  onPrimaryChange,
  extraSubdivisionIds,
  onExtraChange,
  viewAllSubdivisions,
  onViewAllChange,
  disabled,
  isAdminRole,
}: Props) {
  const { data: subdivisions = [] } = useSubdivisions();
  const primaryNum = primarySubdivisionId ? Number(primarySubdivisionId) : null;

  const toggleExtra = (id: number, checked: boolean) => {
    if (id === primaryNum) return;
    const set = new Set(extraSubdivisionIds);
    if (checked) set.add(id);
    else set.delete(id);
    onExtraChange(Array.from(set));
  };

  if (isAdminRole) {
    return (
      <p className="text-sm text-muted-foreground rounded-md border p-3">
        Администратор видит все подразделения без ограничений.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <h4 className="font-medium text-sm">Организационная привязка</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Сотрудник по умолчанию видит оборудование, склад, задачи и заявки своего подразделения.
          Отметьте дополнительные подразделения для расширенного просмотра.
        </p>
      </div>

      <SubdivisionPicker
        value={primarySubdivisionId}
        onChange={onPrimaryChange}
        required
        disabled={disabled || viewAllSubdivisions}
      />

      <div className="flex items-start gap-3">
        <Checkbox
          id="view-all-subdivisions"
          checked={viewAllSubdivisions}
          onCheckedChange={(c) => onViewAllChange(c === true)}
          disabled={disabled}
        />
        <div>
          <Label htmlFor="view-all-subdivisions" className="cursor-pointer font-medium">
            Видит все подразделения
          </Label>
          <p className="text-xs text-muted-foreground">Как у администратора — без фильтра по цехам</p>
        </div>
      </div>

      {!viewAllSubdivisions && (
        <div className="space-y-2">
          <Label className="text-sm">Дополнительные подразделения (просмотр)</Label>
          <div className="grid gap-2 sm:grid-cols-2 max-h-40 overflow-y-auto border rounded-md p-2">
            {subdivisions.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={s.id === primaryNum || extraSubdivisionIds.includes(s.id)}
                  disabled={disabled || s.id === primaryNum}
                  onCheckedChange={(c) => toggleExtra(s.id, c === true)}
                />
                <span className={s.id === primaryNum ? "text-muted-foreground" : ""}>
                  {s.name}
                  {s.id === primaryNum ? " (основное)" : ""}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
