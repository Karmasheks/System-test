import { cn } from "./utils";

/** Многострочный текст в ячейках таблиц, списков и карточках вместо truncate. */
export const multilineTextClass = "min-w-0 break-words leading-snug whitespace-normal";

export function multilineText(...extra: string[]) {
  return cn(multilineTextClass, ...extra);
}
