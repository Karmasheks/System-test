import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAccessControl } from "@/hooks/use-access-control";
import { useProductionConflicts, useProductionMutations } from "@/hooks/use-production-planning";
import { CONFLICT_SEVERITY_LABELS } from "@/lib/production-planning-constants";
import { ListPaginationControls } from "@/components/list-pagination-controls";
import { useListPagination } from "@/hooks/use-list-pagination";

type Props = {
  subdivisionId: number;
};

export function PlanningConflictsTab({ subdivisionId }: Props) {
  const { toast } = useToast();
  const { canEditModule } = useAccessControl();
  const canEdit = canEditModule("production_planning");

  const { data: conflicts = [], isLoading } = useProductionConflicts(subdivisionId);
  const { resolveConflict } = useProductionMutations();

  const {
    page,
    setPage,
    pageItems: conflictPageItems,
    totalPages,
    total: conflictsTotal,
    from,
    to,
  } = useListPagination(conflicts, 25, String(subdivisionId));

  const handleResolve = async (id: number) => {
    try {
      await resolveConflict.mutateAsync(id);
      toast({ title: "Конфликт отмечен решённым" });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тип</TableHead>
              <TableHead>Важность</TableHead>
              <TableHead>Сообщение</TableHead>
              <TableHead>Заказ</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : conflictsTotal === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Нет активных конфликтов
                </TableCell>
              </TableRow>
            ) : (
              conflictPageItems.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.conflictType}</TableCell>
                <TableCell>
                  <Badge variant={c.severity === "blocking" ? "destructive" : "outline"}>
                    {CONFLICT_SEVERITY_LABELS[c.severity] ?? c.severity}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md truncate" title={c.message}>
                  {c.message}
                </TableCell>
                <TableCell>{c.orderId ?? "—"}</TableCell>
                <TableCell>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => handleResolve(c.id)}>
                      Решён
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
      <ListPaginationControls
        page={page}
        totalPages={totalPages}
        total={conflictsTotal}
        from={from}
        to={to}
        onPageChange={setPage}
      />
    </div>
  );
}
