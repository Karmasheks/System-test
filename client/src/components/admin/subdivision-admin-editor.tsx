import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSubdivisions } from "@/hooks/use-subdivisions";

type Props = {
  managedSubdivisionIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

export function SubdivisionAdminEditor({ managedSubdivisionIds, onChange, disabled }: Props) {
  const { data: subdivisions = [] } = useSubdivisions();

  const toggle = (id: number, checked: boolean) => {
    const set = new Set(managedSubdivisionIds);
    if (checked) set.add(id);
    else set.delete(id);
    onChange(Array.from(set));
  };

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h4 className="font-medium text-sm">Администратор подразделений</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Сотрудник сможет управлять пользователями в выбранных подразделениях. Назначает только
          системный администратор.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 max-h-40 overflow-y-auto border rounded-md p-2">
        {subdivisions.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-2">Нет активных подразделений</p>
        ) : (
          subdivisions.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={managedSubdivisionIds.includes(s.id)}
                disabled={disabled}
                onCheckedChange={(c) => toggle(s.id, c === true)}
              />
              <span>{s.name}</span>
            </label>
          ))
        )}
      </div>
      {managedSubdivisionIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Выбрано подразделений: {managedSubdivisionIds.length}
        </p>
      )}
    </div>
  );
}
