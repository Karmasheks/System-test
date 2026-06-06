/** Утилиты экспорта с корректной кириллицей для Excel (RU) и UTF-8. */

export const CSV_DELIMITER = ";";
export const UTF8_BOM = "\uFEFF";

export function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[;\n\r"]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowsToCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map((cell) => csvEscape(cell)).join(CSV_DELIMITER)).join("\n");
}

export function formatRuDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU");
}

export function formatRuDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function downloadTextFile(
  content: string,
  filename: string,
  mime = "text/plain;charset=utf-8"
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(
  rows: Array<Array<string | number | null | undefined>>,
  filename: string
): void {
  downloadTextFile(UTF8_BOM + rowsToCsv(rows), filename, "text/csv;charset=utf-8");
}

export function downloadJson(data: unknown, filename: string): void {
  downloadTextFile(JSON.stringify(data, null, 2), filename, "application/json;charset=utf-8");
}

export function reportFilename(prefix: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${date}.${extension}`;
}
