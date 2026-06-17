import { cn } from "@/lib/utils";

type ChatUnreadBadgeProps = {
  count: number;
  className?: string;
};

export function ChatUnreadBadge({ count, className }: ChatUnreadBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);
  const singleChar = label.length === 1;

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground",
        "h-5 text-[11px] font-semibold leading-none tabular-nums",
        singleChar ? "w-5" : "min-w-[1.25rem] px-1.5",
        className
      )}
      aria-label={`${count} непрочитанных`}
    >
      {label}
    </span>
  );
}
