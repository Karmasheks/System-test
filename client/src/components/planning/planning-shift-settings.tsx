import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useProductionDisplayConfig } from "@/hooks/use-production-display-config";
import {
  useProductionProducts,
  useProductionMutations,
  useShiftTemplates,
  useProductShiftNorms,
  type ShiftSlotView,
} from "@/hooks/use-production-planning";
import { DEFAULT_SHIFT_SLOTS } from "@shared/shift-template-types";
import { Clock, Plus, Save } from "lucide-react";

type Props = {
  subdivisionId: number;
  canEdit: boolean;
};

function emptySlots(count: number): ShiftSlotView[] {
  const base = DEFAULT_SHIFT_SLOTS.slice(0, count);
  return base.map((s, i) => ({
    ...s,
    code: String(i + 1),
    name: s.name || `Смена ${i + 1}`,
  }));
}

export function PlanningShiftSettings({ subdivisionId, canEdit }: Props) {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useShiftTemplates(subdivisionId);
  const { data: products = [] } = useProductionProducts({ subdivisionId, activeOnly: true });
  const { serverSettings } = useProductionDisplayConfig(subdivisionId);
  const {
    createShiftTemplate,
    updateShiftTemplate,
    setDefaultShiftTemplate,
    upsertProductShiftNorms,
  } = useProductionMutations();

  const defaultId = serverSettings?.defaultShiftTemplateId ?? null;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState("");
  const [slotCount, setSlotCount] = useState("2");
  const [slots, setSlots] = useState<ShiftSlotView[]>(emptySlots(2));

  const [normProductId, setNormProductId] = useState("");
  const [normDraft, setNormDraft] = useState<Record<string, string>>({});

  const selectedTemplate = templates.find((t) => String(t.id) === selectedTemplateId);
  const productIdNum = normProductId ? Number(normProductId) : null;
  const { data: productNorms } = useProductShiftNorms(productIdNum, subdivisionId);

  useEffect(() => {
    if (templates.length === 0) return;
    const preferred =
      defaultId != null
        ? templates.find((t) => t.id === defaultId)
        : templates.find((t) => t.isActive) ?? templates[0];
    if (preferred && !selectedTemplateId) {
      setSelectedTemplateId(String(preferred.id));
    }
  }, [templates, defaultId, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateName(selectedTemplate.name);
    const s = selectedTemplate.pattern.slots;
    setSlotCount(String(s.length));
    setSlots(s);
  }, [selectedTemplate?.id]);

  useEffect(() => {
    if (!productNorms) return;
    const draft: Record<string, string> = {};
    for (const slot of productNorms.slots) {
      const stored = productNorms.stored.find((n) => n.shiftCode === slot.code);
      const resolved = productNorms.resolved[slot.code];
      draft[slot.code] = String(stored?.shiftNorm ?? resolved ?? "");
    }
    setNormDraft(draft);
  }, [productNorms, normProductId]);

  const activeSlots = useMemo(() => slots.slice(0, Number(slotCount) || 1), [slots, slotCount]);

  const handleSlotCountChange = (count: string) => {
    setSlotCount(count);
    const n = Number(count) || 1;
    setSlots((prev) => {
      if (prev.length >= n) return prev.slice(0, n);
      const extra = emptySlots(n).slice(prev.length);
      return [...prev, ...extra];
    });
  };

  const updateSlot = (index: number, patch: Partial<ShiftSlotView>) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch, code: String(i + 1) } : s))
    );
  };

  const handleSaveTemplate = async () => {
    if (!canEdit) return;
    const pattern = { slots: activeSlots };
    try {
      if (selectedTemplateId && selectedTemplateId !== "new") {
        await updateShiftTemplate.mutateAsync({
          id: Number(selectedTemplateId),
          name: templateName.trim() || "Шаблон смен",
          pattern,
        });
        toast({ title: "Шаблон смен обновлён" });
      } else {
        const created = await createShiftTemplate.mutateAsync({
          subdivisionId,
          name: templateName.trim() || "Шаблон смен",
          pattern,
          isActive: true,
        });
        setSelectedTemplateId(String(created.id));
        toast({ title: "Шаблон смен создан" });
      }
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  const handleSetDefault = async () => {
    if (!canEdit || !selectedTemplateId || selectedTemplateId === "new") return;
    try {
      await setDefaultShiftTemplate.mutateAsync({
        subdivisionId,
        templateId: Number(selectedTemplateId),
      });
      toast({ title: "Шаблон установлен по умолчанию" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Ошибка",
      });
    }
  };

  const normSlots = productNorms?.slots?.length ? productNorms.slots : activeSlots;

  const handleSaveNorms = async () => {
    if (!canEdit || !productIdNum) return;
    const norms = normSlots
      .map((slot) => {
        const raw = normDraft[slot.code]?.trim();
        if (!raw) return null;
        const shiftNorm = Number(raw);
        if (!shiftNorm || shiftNorm <= 0) return null;
        return { shiftCode: slot.code, shiftNorm };
      })
      .filter(Boolean) as Array<{ shiftCode: string; shiftNorm: number }>;

    try {
      await upsertProductShiftNorms.mutateAsync({
        productId: productIdNum,
        subdivisionId,
        norms,
      });
      toast({ title: "Нормы по сменам сохранены" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Не удалось сохранить нормы",
      });
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка смен…</p>;
  }

  return (
    <div className="space-y-4 lg:col-span-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Шаблон смен
          </CardTitle>
          <CardDescription>
            От 1 до 3 смен с разной длительностью. Используется при расчёте плана и норм.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[200px] flex-1">
              <Label className="text-xs">Шаблон</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Выберите шаблон" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                      {defaultId === t.id ? " (по умолчанию)" : ""}
                    </SelectItem>
                  ))}
                  {canEdit && <SelectItem value="new">+ Новый шаблон</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[120px]">
              <Label className="text-xs">Число смен</Label>
              <Select value={slotCount} onValueChange={handleSlotCountChange} disabled={!canEdit}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 смена</SelectItem>
                  <SelectItem value="2">2 смены</SelectItem>
                  <SelectItem value="3">3 смены</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Название шаблона</Label>
            <Input
              className="h-9 mt-1 max-w-md"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-3">
            {activeSlots.map((slot, index) => (
              <div
                key={slot.code}
                className="grid gap-2 sm:grid-cols-4 p-3 rounded-md border bg-muted/20"
              >
                <div>
                  <Label className="text-xs">Смена {index + 1}</Label>
                  <Input
                    className="h-9 mt-1"
                    value={slot.name}
                    onChange={(e) => updateSlot(index, { name: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label className="text-xs">Часов</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    className="h-9 mt-1"
                    value={slot.hours}
                    onChange={(e) =>
                      updateSlot(index, { hours: Number(e.target.value) || 11 })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label className="text-xs">Начало</Label>
                  <Input
                    className="h-9 mt-1"
                    placeholder="07:00"
                    value={slot.startTime ?? ""}
                    onChange={(e) => updateSlot(index, { startTime: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label className="text-xs">Окончание</Label>
                  <Input
                    className="h-9 mt-1"
                    placeholder="18:00"
                    value={slot.endTime ?? ""}
                    onChange={(e) => updateSlot(index, { endTime: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            ))}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleSaveTemplate}
                disabled={updateShiftTemplate.isPending || createShiftTemplate.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                Сохранить шаблон
              </Button>
              {selectedTemplateId && selectedTemplateId !== "new" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSetDefault}
                  disabled={setDefaultShiftTemplate.isPending || defaultId === Number(selectedTemplateId)}
                >
                  Сделать по умолчанию
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Нормы выпуска по сменам</CardTitle>
          <CardDescription>
            Для каждого изделия — норма шт за смену с учётом её длительности. При создании заказа
            подтягиваются автоматически.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="max-w-md">
            <Label className="text-xs">Изделие</Label>
            <Select value={normProductId} onValueChange={setNormProductId}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="Выберите изделие" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.sapCode} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {normProductId && (
            <div className="space-y-2">
              {normSlots.map((slot) => (
                <div key={slot.code} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[140px] text-muted-foreground">
                    {slot.name} ({slot.hours} ч)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    className="h-9 w-[140px]"
                    placeholder="шт/смену"
                    value={normDraft[slot.code] ?? ""}
                    onChange={(e) =>
                      setNormDraft((d) => ({ ...d, [slot.code]: e.target.value }))
                    }
                    disabled={!canEdit}
                  />
                  {productNorms?.resolved[slot.code] != null &&
                    !normDraft[slot.code] && (
                      <span className="text-xs text-muted-foreground">
                        расчёт: {productNorms.resolved[slot.code].toLocaleString("ru-RU")}
                      </span>
                    )}
                </div>
              ))}
              {canEdit && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={handleSaveNorms}
                  disabled={upsertProductShiftNorms.isPending}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Сохранить нормы
                </Button>
              )}
            </div>
          )}

          {!normProductId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Выберите изделие, чтобы задать нормы по каждой смене
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
