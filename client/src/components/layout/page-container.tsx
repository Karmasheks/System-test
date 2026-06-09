import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Единая ширина контента страниц — на всю область main (как дашборд и пользователи). */
export const PAGE_MAIN_CLASS = "p-4 lg:p-6 w-full min-w-0";

export function PageContainer({
  children,
  className,
  as: Tag = "main",
}: {
  children: ReactNode;
  className?: string;
  as?: "main" | "div";
}) {
  return <Tag className={cn(PAGE_MAIN_CLASS, className)}>{children}</Tag>;
}
