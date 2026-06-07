import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { parseSubdivisionAdminRoleKey } from "@shared/subdivision-admin-roles";

type Props = {
  value: number[];
  onChange: (ids: number[]) => void;
  role?: string;
  disabled?: boolean;
  allowedIds?: number[];
};

export function ManagedSubdivisionsEditor({
  value,
  onChange,
  role = "",
  disabled,
  allowedIds,
}: Props) {
  const { data: subdivisions = [] } = useSubdivisions();
  const roleSubdivisionId = parseSubdivisionAdminRoleKey(role);
  const visible = allowedIds?.length
    ? subdivisions.filter((s) => allowedIds.includes(s.id))
    : subdivisions;

  const toggle = (id: number, checked: boolean) => {
    const set = new Set(value);
    if (checked) set.add(id);
    else if (id !== roleSubdivisionId) set.delete(id);
    onChange(Array.from(set).sort((a, b) => a - b));
  };

  return (
    <div className="space-y-3 rounded-md border p-4 bg-amber-50/40 dark:bg-amber-950/10">
      <div>
        <h4 className="font-medium text-sm">Администрирование подразделений</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Сотрудник сможет управлять пользователями и настройками в выбранных подразделениях.
          Можно назначить несколько подразделений даже при обычной роли (инженер, техник и т.д.).
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 max-h-44 overflow-y-auto border rounded-md p-2 bg-background">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-2 p-2">Подразделения не найдены</p>
        ) : (
          visible.map((s) => {
            const lockedByRole = roleSubdivisionId === s.id;
            const checked = value.includes(s.id) || lockedByRole;
            return (
              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={checked}
                  disabled={disabled || lockedByRole}
                  onCheckedChange={(c) => toggle(s.id, c === true)}
                />
                <span className={lockedByRole ? "font-medium" : ""}>
                  {s.name}
                  {lockedByRole ? " (по роли)" : ""}
                </span>
              </label>
            );
          })
        )}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Выбрано подразделений: {value.length}
          {roleSubdivisionId != null && !value.includes(roleSubdivisionId)
            ? ` (+1 по роли)`
            : ""}
        </p>
      )}
    </div>
  );
}
