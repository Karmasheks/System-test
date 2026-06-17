import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function ListPaginationControls({
  page,
  totalPages,
  total,
  from,
  to,
  onPageChange,
  className,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 ${className ?? ""}`}>
      <p className="text-sm text-muted-foreground">
        {from}–{to} из {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Назад
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground px-1">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Далее
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
