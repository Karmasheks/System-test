import { Badge } from "@/components/ui/badge";
import {
  equipmentStatusBadgeClass,
  equipmentStatusLabel,
} from "@shared/equipment-status-constants";
import { cn } from "@/lib/utils";

type Props = {
  status: string | null | undefined;
  className?: string;
  compact?: boolean;
};

export function EquipmentStatusBadge({ status, className, compact }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-normal",
        compact ? "text-[10px] px-1.5 py-0" : "text-xs",
        equipmentStatusBadgeClass(status),
        className
      )}
    >
      {equipmentStatusLabel(status)}
    </Badge>
  );
}
