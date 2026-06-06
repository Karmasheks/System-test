import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { WarehouseMovement } from "@shared/schema";
import type { WarehouseActivityItem } from "@/hooks/use-warehouse";
import type { LinkedWorkItem } from "@shared/warehouse-linked-work";

export function movementLabel(type: string) {
  switch (type) {
    case "in":
      return "Приход";
    case "out":
      return "Списание";
    case "reserve":
      return "Резерв";
    default:
      return type;
  }
}

function movementColor(type: string) {
  if (type === "in") return "text-green-600";
  if (type === "reserve") return "text-blue-600";
  return "text-orange-600";
}

type MovementRow = (WarehouseMovement | WarehouseActivityItem) & {
  linkedWork?: LinkedWorkItem[];
};

interface Props {
  movement: MovementRow;
  showPartName?: boolean;
  onOpenTask?: (taskId: number) => void;
  onNavigate?: (href: string) => void;
}

function LinkedWorkButtons({
  linkedWork,
  onOpenTask,
  onNavigate,
}: {
  linkedWork: LinkedWorkItem[];
  onOpenTask?: (taskId: number) => void;
  onNavigate?: (href: string) => void;
}) {
  if (linkedWork.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {linkedWork.map((item) => {
        if (item.type === "task" && onOpenTask) {
          return (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              onClick={() => onOpenTask(item.id)}
            >
              Задача: {item.title}
            </button>
          );
        }

        const href =
          item.type === "service_request"
            ? `/service-requests/${item.id}`
            : item.type === "maintenance"
              ? `/schedule`
              : undefined;

        if (href && onNavigate) {
          return (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              onClick={() => onNavigate(href)}
            >
              {item.type === "service_request" ? "Заявка" : "ТО"}: {item.title}
            </button>
          );
        }

        return (
          <span
            key={`${item.type}-${item.id}`}
            className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs text-muted-foreground"
          >
            {item.title}
          </span>
        );
      })}
    </div>
  );
}

export function WarehouseMovementItem({ movement, showPartName, onOpenTask, onNavigate }: Props) {
  const partName = "partName" in movement ? movement.partName : undefined;
  const title = showPartName && partName
    ? `${movementLabel(movement.type)}: ${partName} — ${movement.quantity} шт.`
    : `${movementLabel(movement.type)}: ${movement.quantity} шт.`;

  const linkedWork: LinkedWorkItem[] =
    movement.linkedWork ??
    ([
      movement.taskId
        ? {
            type: "task" as const,
            id: movement.taskId,
            title: movement.taskTitle ?? `Задача #${movement.taskId}`,
          }
        : null,
      movement.serviceRequestId
        ? {
            type: "service_request" as const,
            id: movement.serviceRequestId,
            title: `Заявка #${movement.serviceRequestId}`,
          }
        : null,
      movement.maintenanceId
        ? {
            type: "maintenance" as const,
            id: movement.maintenanceId,
            title: `ТО #${movement.maintenanceId}`,
          }
        : null,
    ].filter(Boolean) as LinkedWorkItem[]);

  return (
    <div className="border rounded p-2 text-sm">
      <div className="flex justify-between gap-2">
        <span className={movementColor(movement.type)}>{title}</span>
        <span className="text-muted-foreground shrink-0">
          {format(new Date(movement.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
        </span>
      </div>
      <div className="text-muted-foreground text-xs mt-0.5">
        {movement.performedByName}
        {movement.equipmentName
          ? movement.type === "out" || movement.type === "reserve"
            ? ` → ${movement.equipmentName}`
            : ` · ${movement.equipmentName}`
          : ""}
        {movement.destination ? ` (${movement.destination})` : ""}
      </div>
      <LinkedWorkButtons linkedWork={linkedWork} onOpenTask={onOpenTask} onNavigate={onNavigate} />
      {movement.comment && <p className="text-xs mt-1 text-muted-foreground">{movement.comment}</p>}
    </div>
  );
}

export function filterMovements<T extends { type: string }>(
  movements: T[],
  filter: "all" | "reserve" | "out"
): T[] {
  if (filter === "reserve") return movements.filter((m) => m.type === "reserve");
  if (filter === "out") return movements.filter((m) => m.type === "out");
  return movements;
}
