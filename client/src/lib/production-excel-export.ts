import { saveAs } from "file-saver";
import type { ProductionExportType } from "@shared/production-excel-fields";

export async function downloadProductionExport(
  type: ProductionExportType,
  subdivisionId: number,
  options?: { from?: string; to?: string }
) {
  const params = new URLSearchParams({ subdivisionId: String(subdivisionId) });
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);

  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api/production/export/${type}?${params}`, {
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  let filename = `production-${type}.xlsx`;
  const match = disposition?.match(/filename="([^"]+)"/);
  if (match?.[1]) filename = match[1];

  saveAs(blob, filename);
}
