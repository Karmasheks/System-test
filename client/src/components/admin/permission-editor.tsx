import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DASHBOARD_BLOCK_DEFINITIONS,
  MODULE_DEFINITIONS,
  PERMISSION_PRESET_DEFINITIONS,
  SENSITIVE_FIELD_DEFINITIONS,
  TASK_CAPABILITY_DEFINITIONS,
  accessLevelLabel,
  buildPermissionPreset,
  type AccessLevel,
  type AppModule,
  type DashboardBlock,
  type PermissionPresetKey,
  type SensitiveField,
  type TaskCapabilities,
} from "@shared/permissions-constants";

export interface PermissionEditorState {
  modules: Record<AppModule, AccessLevel>;
  hiddenFields: SensitiveField[];
  hiddenDashboardBlocks: DashboardBlock[];
  taskCapabilities: TaskCapabilities;
}

interface PermissionEditorProps {
  value: PermissionEditorState;
  onChange: (value: PermissionEditorState) => void;
  disabled?: boolean;
  showDashboardBlocks?: boolean;
  showPresets?: boolean;
}

function ModuleLevelRow({
  label,
  section,
  level,
  disabled,
  onChange,
}: {
  label: string;
  section: string;
  level: AccessLevel;
  disabled?: boolean;
  onChange: (level: AccessLevel) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm bg-card">
      <div className="min-w-0">
        <p className="font-medium text-multiline">{label}</p>
        <p className="text-xs text-muted-foreground">{section}</p>
      </div>
      <Select value={level} onValueChange={(v) => onChange(v as AccessLevel)} disabled={disabled}>
        <SelectTrigger className="w-[148px] h-8 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{accessLevelLabel("none")}</SelectItem>
          <SelectItem value="view">{accessLevelLabel("view")}</SelectItem>
          <SelectItem value="edit">{accessLevelLabel("edit")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function PermissionEditor({
  value,
  onChange,
  disabled,
  showDashboardBlocks = true,
  showPresets = true,
}: PermissionEditorProps) {
  const applyPreset = (key: PermissionPresetKey) => {
    const preset = buildPermissionPreset(key);
    onChange({
      modules: { ...preset.modules },
      hiddenFields: [...preset.hiddenFields],
      hiddenDashboardBlocks: [...preset.hiddenDashboardBlocks],
      taskCapabilities: { ...preset.taskCapabilities },
    });
  };
  const setModuleLevel = (module: AppModule, level: AccessLevel) => {
    onChange({
      ...value,
      modules: { ...value.modules, [module]: level },
    });
  };

  const setAllModules = (level: AccessLevel, section?: "main" | "admin") => {
    const next = { ...value.modules };
    for (const mod of MODULE_DEFINITIONS) {
      if (!section || mod.section === section) {
        next[mod.key] = level;
      }
    }
    onChange({ ...value, modules: next });
  };

  const toggleHiddenField = (field: SensitiveField, visible: boolean) => {
    const set = new Set(value.hiddenFields);
    if (visible) set.delete(field);
    else set.add(field);
    onChange({ ...value, hiddenFields: Array.from(set) as SensitiveField[] });
  };

  const toggleDashboardBlock = (block: DashboardBlock, visible: boolean) => {
    const set = new Set(value.hiddenDashboardBlocks);
    if (visible) set.delete(block);
    else set.add(block);
    onChange({ ...value, hiddenDashboardBlocks: Array.from(set) as DashboardBlock[] });
  };

  const toggleTaskCapability = (key: keyof TaskCapabilities, enabled: boolean) => {
    onChange({
      ...value,
      taskCapabilities: { ...value.taskCapabilities, [key]: enabled },
    });
  };

  const mainModules = MODULE_DEFINITIONS.filter((m) => m.section === "main");
  const adminModules = MODULE_DEFINITIONS.filter((m) => m.section === "admin");

  return (
    <div className="space-y-4">
      {showPresets && !disabled && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <p className="text-sm font-medium">Быстрые шаблоны прав</p>
          <p className="text-xs text-muted-foreground">
            Подставьте готовый набор прав и при необходимости уточните вручную. Удобно для делегирования
            администрирования без смены роли на «Администратор системы».
          </p>
          <div className="flex flex-wrap gap-2">
            {PERMISSION_PRESET_DEFINITIONS.map((preset) => (
              <Badge
                key={preset.key}
                variant="outline"
                className="cursor-pointer hover:bg-muted px-2.5 py-1 h-auto text-left whitespace-normal"
                onClick={() => applyPreset(preset.key)}
                title={preset.description}
              >
                {preset.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

    <Tabs defaultValue="modules" className="w-full">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1">
        <TabsTrigger value="modules" className="text-xs sm:text-sm">
          Разделы
        </TabsTrigger>
        <TabsTrigger value="tasks" className="text-xs sm:text-sm">
          Задачи
        </TabsTrigger>
        {showDashboardBlocks && (
          <TabsTrigger value="dashboard" className="text-xs sm:text-sm">
            Панель
          </TabsTrigger>
        )}
        <TabsTrigger value="data" className="text-xs sm:text-sm">
          Данные
        </TabsTrigger>
      </TabsList>

      <TabsContent value="modules" className="space-y-4 mt-4">
        <p className="text-sm text-muted-foreground">
          Уровень доступа к каждому разделу меню. «Скрыто» — раздел не отображается.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Основные разделы</h4>
            <div className="flex gap-1 flex-wrap">
              <Badge
                variant="outline"
                className="cursor-pointer text-xs"
                onClick={() => !disabled && setAllModules("view", "main")}
              >
                Все: просмотр
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer text-xs"
                onClick={() => !disabled && setAllModules("none", "main")}
              >
                Сбросить
              </Badge>
            </div>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {mainModules.map((mod) => (
              <ModuleLevelRow
                key={mod.key}
                label={mod.label}
                section="Основное меню"
                level={value.modules[mod.key] ?? "none"}
                disabled={disabled}
                onChange={(level) => setModuleLevel(mod.key, level)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Администрирование</h4>
            <div className="flex gap-1 flex-wrap">
              <Badge
                variant="outline"
                className="cursor-pointer text-xs"
                onClick={() => !disabled && setAllModules("view", "admin")}
              >
                Все: просмотр
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer text-xs"
                onClick={() => !disabled && setAllModules("none", "admin")}
              >
                Сбросить
              </Badge>
            </div>
          </div>
          <div className="space-y-2">
            {adminModules.map((mod) => (
              <ModuleLevelRow
                key={mod.key}
                label={mod.label}
                section="Администрирование"
                level={value.modules[mod.key] ?? "none"}
                disabled={disabled}
                onChange={(level) => setModuleLevel(mod.key, level)}
              />
            ))}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="tasks" className="space-y-3 mt-4">
        <p className="text-sm text-muted-foreground">
          Дополнительные действия в разделе «Задачи и заявки». Модуль «Задачи» должен быть не ниже «Просмотр».
        </p>
        <div className="space-y-2">
          {TASK_CAPABILITY_DEFINITIONS.map((cap) => (
            <div key={cap.key} className="flex items-start gap-3 rounded-md border p-3 bg-card">
              <Checkbox
                id={`task-cap-${cap.key}`}
                checked={value.taskCapabilities[cap.key]}
                onCheckedChange={(checked) => toggleTaskCapability(cap.key, checked === true)}
                disabled={disabled}
              />
              <div className="grid gap-0.5 leading-none">
                <Label htmlFor={`task-cap-${cap.key}`} className="text-sm font-medium cursor-pointer">
                  {cap.label}
                </Label>
                <p className="text-xs text-muted-foreground">{cap.description}</p>
              </div>
            </div>
          ))}
        </div>
      </TabsContent>

      {showDashboardBlocks && (
        <TabsContent value="dashboard" className="space-y-3 mt-4">
          <p className="text-sm text-muted-foreground">
            Отметьте блоки, которые пользователь <strong>видит</strong> на главной панели.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {DASHBOARD_BLOCK_DEFINITIONS.map((block) => {
              const visible = !value.hiddenDashboardBlocks.includes(block.key);
              return (
                <div key={block.key} className="flex items-start gap-3 rounded-md border p-3 bg-card">
                  <Checkbox
                    id={`dash-show-${block.key}`}
                    checked={visible}
                    onCheckedChange={(checked) => toggleDashboardBlock(block.key, checked === true)}
                    disabled={disabled}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label htmlFor={`dash-show-${block.key}`} className="text-sm font-medium cursor-pointer">
                      {block.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{block.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      )}

      <TabsContent value="data" className="space-y-3 mt-4">
        <p className="text-sm text-muted-foreground">
          Отметьте данные, которые пользователь <strong>может видеть</strong> в системе.
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {SENSITIVE_FIELD_DEFINITIONS.map((field) => {
            const visible = !value.hiddenFields.includes(field.key);
            return (
              <div key={field.key} className="flex items-start gap-3 rounded-md border p-3 bg-card">
                <Checkbox
                  id={`field-show-${field.key}`}
                  checked={visible}
                  onCheckedChange={(checked) => toggleHiddenField(field.key, checked === true)}
                  disabled={disabled}
                />
                <div className="grid gap-0.5 leading-none">
                  <Label htmlFor={`field-show-${field.key}`} className="text-sm font-medium cursor-pointer">
                    {field.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
    </div>
  );
}
