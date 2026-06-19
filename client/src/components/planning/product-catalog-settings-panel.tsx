import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  PRODUCT_CATALOG_BUILTIN_FIELDS,
  PRODUCT_CATALOG_FIELD_TYPES,
  PRODUCT_CATALOG_FIELD_TYPE_LABELS,
  PRODUCT_CATALOG_PRESETS,
  applyCatalogPreset,
  createProductCatalogCustomField,
  extractCatalogPreset,
  type ProductCatalogCustomField,
  type ProductCatalogDisplayConfig,
  type ProductCatalogFieldPreset,
  type ProductCatalogSavedTemplate,
} from "@shared/production-display-config";
import { Plus, Save, Trash2, X } from "lucide-react";

type Props = {
  catalog: ProductCatalogDisplayConfig;
  canEdit: boolean;
  onChange: (catalog: ProductCatalogDisplayConfig) => void;
};

export function ProductCatalogSettingsPanel({ catalog, canEdit, onChange }: Props) {
  const { toast } = useToast();
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");

  const patchCatalog = (patch: Partial<ProductCatalogDisplayConfig>) => {
    onChange({ ...catalog, ...patch });
  };

  const applyPreset = (preset: ProductCatalogFieldPreset) => {
    onChange(applyCatalogPreset(catalog, preset));
  };

  const updateCustomField = (id: string, patch: Partial<ProductCatalogCustomField>) => {
    patchCatalog({
      customFields: catalog.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };

  const removeCustomField = (id: string) => {
    patchCatalog({
      customFields: catalog.customFields.filter((f) => f.id !== id),
    });
  };

  const addCustomField = () => {
    patchCatalog({
      customFields: [...catalog.customFields, createProductCatalogCustomField()],
    });
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) {
      toast({ title: "Укажите название шаблона", variant: "destructive" });
      return;
    }
    const tpl: ProductCatalogSavedTemplate = {
      id: `tpl_${Date.now().toString(36)}`,
      name,
      description: templateDescription.trim() || undefined,
      preset: extractCatalogPreset(catalog),
      createdAt: new Date().toISOString(),
    };
    patchCatalog({
      savedTemplates: [...catalog.savedTemplates, tpl],
    });
    setTemplateName("");
    setTemplateDescription("");
    toast({
      title: "Шаблон добавлен",
      description: "Нажмите «Сохранить настройки подразделения» вверху страницы",
    });
  };

  const deleteTemplate = (id: string) => {
    patchCatalog({
      savedTemplates: catalog.savedTemplates.filter((t) => t.id !== id),
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label className="text-xs text-muted-foreground">Базовые шаблоны</Label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {Object.entries(PRODUCT_CATALOG_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant="outline"
              disabled={!canEdit}
              title={preset.description}
              onClick={() => applyPreset(preset.preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {catalog.savedTemplates.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground">Сохранённые шаблоны</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {catalog.savedTemplates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!canEdit}
                  title={tpl.description ?? tpl.preset.customFields.map((f) => f.label).join(", ")}
                  onClick={() => applyPreset(tpl.preset)}
                >
                  {tpl.name}
                  {tpl.preset.customFields.length > 0 && (
                    <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">
                      +{tpl.preset.customFields.length}
                    </Badge>
                  )}
                </Button>
                {canEdit && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => deleteTemplate(tpl.id)}
                    title="Удалить шаблон"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 pt-1 border-t">
        <Label className="text-xs">Стандартные поля</Label>
        {PRODUCT_CATALOG_BUILTIN_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2">
            <Checkbox
              checked={catalog[key]}
              disabled={!canEdit}
              onCheckedChange={(v) => patchCatalog({ [key]: Boolean(v) })}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="space-y-3 pt-1 border-t">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Свои поля</Label>
          {canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={addCustomField}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Добавить поле
            </Button>
          )}
        </div>
        {catalog.customFields.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Добавьте поля под вашу продукцию: артикул поставщика, класс точности, упаковка и т.д.
          </p>
        ) : (
          <div className="space-y-2">
            {catalog.customFields.map((field) => (
              <div
                key={field.id}
                className="rounded-md border bg-muted/20 p-3 space-y-2"
              >
                <div className="flex flex-wrap gap-2 items-start">
                  <div className="flex-1 min-w-[140px]">
                    <Label className="text-[10px]">Название</Label>
                    <Input
                      className="h-8 mt-0.5"
                      value={field.label}
                      disabled={!canEdit}
                      onChange={(e) => updateCustomField(field.id, { label: e.target.value })}
                    />
                  </div>
                  <div className="w-[130px]">
                    <Label className="text-[10px]">Тип</Label>
                    <Select
                      value={field.fieldType}
                      disabled={!canEdit}
                      onValueChange={(v) =>
                        updateCustomField(field.id, {
                          fieldType: v as ProductCatalogCustomField["fieldType"],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 mt-0.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_CATALOG_FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {PRODUCT_CATALOG_FIELD_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[90px]">
                    <Label className="text-[10px]">Ед. изм.</Label>
                    <Input
                      className="h-8 mt-0.5"
                      placeholder="шт"
                      value={field.unit ?? ""}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateCustomField(field.id, { unit: e.target.value || undefined })
                      }
                    />
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 mt-4 shrink-0"
                      onClick={() => removeCustomField(field.id)}
                      title="Удалить поле"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={field.enabled}
                      disabled={!canEdit}
                      onCheckedChange={(v) => updateCustomField(field.id, { enabled: Boolean(v) })}
                    />
                    Включено
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={field.showInForm}
                      disabled={!canEdit}
                      onCheckedChange={(v) =>
                        updateCustomField(field.id, { showInForm: Boolean(v) })
                      }
                    />
                    В форме
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={field.showInTable}
                      disabled={!canEdit}
                      onCheckedChange={(v) =>
                        updateCustomField(field.id, { showInTable: Boolean(v) })
                      }
                    />
                    В таблице
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={field.required}
                      disabled={!canEdit}
                      onCheckedChange={(v) =>
                        updateCustomField(field.id, { required: Boolean(v) })
                      }
                    />
                    Обязательное
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="space-y-2 pt-1 border-t">
          <Label className="text-xs">Сохранить текущую конфигурацию как шаблон</Label>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[160px]">
              <Input
                className="h-9"
                placeholder="Название шаблона"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="flex-[2] min-w-[200px]">
              <Textarea
                className="min-h-[36px] h-9 py-2 resize-none"
                placeholder="Описание (опционально)"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
              />
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={saveTemplate}>
              <Save className="h-4 w-4 mr-1" />
              Сохранить шаблон
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Шаблоны хранятся в настройках подразделения. После сохранения шаблона нажмите «Сохранить
            настройки подразделения» вверху страницы.
          </p>
        </div>
      )}
    </div>
  );
}
