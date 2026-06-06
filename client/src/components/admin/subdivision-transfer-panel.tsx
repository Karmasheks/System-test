import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubdivisionPicker } from "@/components/subdivision-picker";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowRightLeft, Wrench, Undo2 } from "lucide-react";

type EntityType = "equipment" | "warehouse_part" | "user";

type Props = {
  entityType: EntityType;
  entityId: string | number;
  entityLabel?: string;
  currentSubdivisionId?: number | null;
  repairSubdivisionId?: number | null;
  homeSubdivisionName?: string | null;
  onSuccess?: () => void;
};

const entityTitles: Record<EntityType, string> = {
  equipment: "оборудование",
  warehouse_part: "запчасть",
  user: "сотрудника",
};

export function SubdivisionTransferPanel({
  entityType,
  entityId,
  entityLabel,
  currentSubdivisionId,
  repairSubdivisionId,
  homeSubdivisionName,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [targetSubdivisionId, setTargetSubdivisionId] = useState("");
  const [repairTargetId, setRepairTargetId] = useState("");
  const [repairComment, setRepairComment] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
    queryClient.invalidateQueries({ queryKey: ["/api/warehouse/parts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    onSuccess?.();
  };

  const transferMutation = useMutation({
    mutationFn: async () => {
      const targetId = Number(targetSubdivisionId);
      if (Number.isNaN(targetId)) throw new Error("Выберите подразделение");

      if (entityType === "equipment") {
        return apiRequest("POST", "/api/subdivisions/transfers/equipment", {
          equipmentId: entityId,
          targetSubdivisionId: targetId,
        });
      }
      if (entityType === "warehouse_part") {
        return apiRequest("POST", "/api/subdivisions/transfers/warehouse-part", {
          partId: entityId,
          targetSubdivisionId: targetId,
        });
      }
      return apiRequest("POST", "/api/subdivisions/transfers/user", {
        userId: entityId,
        targetSubdivisionId: targetId,
      });
    },
    onSuccess: () => {
      toast({ title: "Перенос выполнен", description: `${entityLabel ?? entityTitles[entityType]} перенесено` });
      setTargetSubdivisionId("");
      invalidate();
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message?.replace(/^\d+:\s*/, "") ?? "Не удалось перенести", variant: "destructive" });
    },
  });

  const repairMutation = useMutation({
    mutationFn: async () => {
      const repairId = Number(repairTargetId);
      if (Number.isNaN(repairId)) throw new Error("Выберите подразделение для ремонта");
      return apiRequest("POST", "/api/subdivisions/transfers/equipment/repair", {
        equipmentId: entityId,
        repairSubdivisionId: repairId,
        comment: repairComment.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Отправлено на ремонт" });
      setRepairTargetId("");
      setRepairComment("");
      invalidate();
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message?.replace(/^\d+:\s*/, "") ?? "Не удалось отправить", variant: "destructive" });
    },
  });

  const returnMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/subdivisions/transfers/equipment/repair/return", {
        equipmentId: entityId,
      }),
    onSuccess: () => {
      toast({ title: "Возврат с ремонта выполнен" });
      invalidate();
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message?.replace(/^\d+:\s*/, "") ?? "Не удалось вернуть", variant: "destructive" });
    },
  });

  const onRepair = entityType === "equipment" && repairSubdivisionId != null;

  return (
    <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <h4 className="font-medium text-sm">Перенос между подразделениями</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Доступно системному администратору. Текущее подразделение:{" "}
        {currentSubdivisionId ? `#${currentSubdivisionId}` : "не указано"}
        {onRepair && homeSubdivisionName ? ` · домашнее: ${homeSubdivisionName}` : ""}
      </p>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Целевое подразделение</Label>
          <SubdivisionPicker value={targetSubdivisionId} onChange={setTargetSubdivisionId} />
        </div>
        <Button
          size="sm"
          onClick={() => transferMutation.mutate()}
          disabled={transferMutation.isPending || !targetSubdivisionId}
        >
          Перенести
        </Button>
      </div>

      {entityType === "equipment" && (
        <div className="space-y-3 border-t pt-3">
          {onRepair ? (
            <div className="flex flex-wrap items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-600" />
              <span className="text-sm">
                На ремонте в подразделении #{repairSubdivisionId}
                {homeSubdivisionName ? ` (из «${homeSubdivisionName}»)` : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => returnMutation.mutate()}
                disabled={returnMutation.isPending}
              >
                <Undo2 className="h-4 w-4 mr-1" />
                Вернуть с ремонта
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-orange-600" />
                <Label className="text-sm font-medium">Отправить на ремонт в другое подразделение</Label>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Подразделение ремонта</Label>
                  <SubdivisionPicker value={repairTargetId} onChange={setRepairTargetId} />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => repairMutation.mutate()}
                  disabled={repairMutation.isPending || !repairTargetId}
                >
                  На ремонт
                </Button>
              </div>
              <Textarea
                placeholder="Комментарий (необязательно)"
                value={repairComment}
                onChange={(e) => setRepairComment(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
