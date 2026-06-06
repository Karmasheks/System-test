import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { EquipmentActivityItem } from "@/hooks/use-equipment-activity";

const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  task: "Задача",
  service_request: "Сервисная заявка",
  maintenance: "ТО",
  remark: "Замечание",
  inspection: "Осмотр",
  budget: "Затрата",
  link: "Связь",
  equipment_status: "Статус",
  equipment_location: "Расположение",
  subdivision_transfer: "Перенос",
  repair_transfer: "Ремонт",
};

interface Props {
  items: EquipmentActivityItem[];
  isLoading?: boolean;
  emptyText?: string;
  maxHeightClass?: string;
  onOpenEquipment?: (equipmentId: string) => void;
  onOpenTask?: (taskId: number) => void;
  showCategory?: boolean;
}

export function EquipmentActivityList({
  items,
  isLoading,
  emptyText = "Событий пока нет",
  maxHeightClass = "max-h-72",
  onOpenEquipment,
  onOpenTask,
  showCategory = true,
}: Props) {
  if (isLoading) {
    return <p className="text-sm text-gray-500">Загрузка…</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-4 text-center">{emptyText}</p>;
  }

  return (
    <ul className={`space-y-2 ${maxHeightClass} overflow-y-auto overflow-x-hidden`}>
      {items.map((item) => (
        <li key={item.id} className="p-2 border rounded-md text-sm min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1 overflow-hidden">
              {item.category === "task" && onOpenTask ? (
                <button
                  type="button"
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline break-words text-left"
                  onClick={() => onOpenTask(item.entityId)}
                >
                  {item.title}
                </button>
              ) : (item.href ?? (item.category === "task" ? `/tasks?task=${item.entityId}` : undefined)) ? (
                <Link href={item.href ?? `/tasks?task=${item.entityId}`}>
                  <p className="font-medium text-blue-600 dark:text-blue-400 hover:underline break-words">
                    {item.title}
                  </p>
                </Link>
              ) : (
                <p className="font-medium break-words">{item.title}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                {format(new Date(item.occurredAt), "dd.MM.yyyy HH:mm")}
                {showCategory && (
                  <>
                    {" "}
                    · {ACTIVITY_CATEGORY_LABELS[item.category] ?? item.category}
                  </>
                )}
                {item.actor ? ` · ${item.actor}` : ""}
              </p>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground">{item.subtitle}</p>
              )}
              {item.links.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.links.map((link) =>
                    link.type === "equipment" && onOpenEquipment ? (
                      <button
                        key={`${link.type}-${link.label}`}
                        type="button"
                        className="inline-flex"
                        onClick={() => {
                          const match = item.href?.match(/highlight=([^&]+)/);
                          if (match?.[1]) onOpenEquipment(match[1]);
                        }}
                      >
                        <Badge variant="secondary" className="text-[10px] hover:bg-secondary/80">
                          {link.label}
                        </Badge>
                      </button>
                    ) : link.type === "task" && onOpenTask ? (
                      <button
                        key={`${link.type}-${link.id}-${link.label}`}
                        type="button"
                        className="inline-flex"
                        onClick={() => onOpenTask(link.id)}
                      >
                        <Badge variant="secondary" className="text-[10px] hover:bg-secondary/80">
                          {link.label}
                          {link.id > 0 ? ` #${link.id}` : ""}
                        </Badge>
                      </button>
                    ) : link.type === "service_request" ? (
                      <Link key={`${link.type}-${link.id}-${link.label}`} href={`/service-requests/${link.id}`}>
                        <Badge variant="secondary" className="text-[10px] hover:bg-secondary/80">
                          {link.label}
                          {link.id > 0 ? ` #${link.id}` : ""}
                        </Badge>
                      </Link>
                    ) : (
                      <Badge
                        key={`${link.type}-${link.id}-${link.label}`}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {link.label}
                        {link.id > 0 ? ` #${link.id}` : ""}
                      </Badge>
                    )
                  )}
                </div>
              )}
            </div>
            {item.statusLabel && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {item.statusLabel}
              </Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
