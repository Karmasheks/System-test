import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { downloadProductionExport } from "@/lib/production-excel-export";
import {
  PRODUCTION_EXPORT_TYPES,
  PRODUCTION_EXPORT_LABELS,
  type ProductionExportType,
} from "@shared/production-excel-fields";
import { Download } from "lucide-react";
import { useState } from "react";

type Props = {
  subdivisionId: number;
};

export function ProductionExportMenu({ subdivisionId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (type: ProductionExportType) => {
    setLoading(type);
    try {
      await downloadProductionExport(type, subdivisionId);
      toast({ title: "Файл экспортирован" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка экспорта",
        description: e instanceof Error ? e.message : "Ошибка",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading != null}>
          <Download className="w-4 h-4 mr-1" />
          Экспорт Excel
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PRODUCTION_EXPORT_TYPES.map((type) => (
          <DropdownMenuItem
            key={type}
            onClick={() => handleExport(type)}
            disabled={loading === type}
          >
            {PRODUCTION_EXPORT_LABELS[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
