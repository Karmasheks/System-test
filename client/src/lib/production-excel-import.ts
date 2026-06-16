import * as XLSX from "xlsx";
import {
  PRODUCTION_IMPORT_FIELDS,
  type ProductionImportColumnMapping,
  type ProductionImportField,
  suggestImportColumnMapping,
} from "@shared/production-excel-fields";
import type { MappedProductionImportRow } from "@shared/production-excel-fields";

export type ParsedExcelSheet = {
  headers: string[];
  rawRows: Record<string, unknown>[];
  fileName: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function normalizeExcelCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && value > 20000 && value < 60000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }
  }
  return String(value).trim();
}

export function parseExcelFile(file: File): Promise<ParsedExcelSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
          raw: false,
        });
        const headers =
          json.length > 0
            ? Object.keys(json[0])
            : (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] as string[]) ?? [];
        resolve({
          headers,
          rawRows: json,
          fileName: file.name,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function buildColumnMapping(headers: string[]): ProductionImportColumnMapping {
  return suggestImportColumnMapping(headers);
}

export function applyColumnMapping(
  rawRows: Record<string, unknown>[],
  mapping: ProductionImportColumnMapping,
  startRowNumber = 2
): MappedProductionImportRow[] {
  return rawRows.map((row, index) => {
    const get = (field: ProductionImportField) => {
      const header = mapping[field];
      if (!header) return "";
      return normalizeExcelCell(row[header]);
    };

    const qtyRaw = get("quantity");
    const quantity = qtyRaw ? Number(qtyRaw.replace(",", ".")) : undefined;

    const subdivisionRaw = get("subdivision");
    const subdivisionIdNum = subdivisionRaw && /^\d+$/.test(subdivisionRaw)
      ? Number(subdivisionRaw)
      : undefined;

    return {
      rowNumber: startRowNumber + index,
      productSapCode: get("productSapCode") || undefined,
      productName: get("productName") || undefined,
      quantity: quantity && !Number.isNaN(quantity) ? quantity : undefined,
      priority: get("priority") || undefined,
      desiredDate: get("desiredDate") || undefined,
      comment: get("comment") || undefined,
      subdivisionName: subdivisionIdNum ? undefined : subdivisionRaw || undefined,
      subdivisionId: subdivisionIdNum,
    };
  });
}

export function mappingFieldOptions(headers: string[]) {
  return PRODUCTION_IMPORT_FIELDS.map((field) => ({
    field,
    header: mappingLabel(field),
    options: headers,
  }));
}

function mappingLabel(field: ProductionImportField) {
  const labels: Record<ProductionImportField, string> = {
    productSapCode: "SAP изделия",
    productName: "Наименование изделия",
    quantity: "Количество",
    priority: "Приоритет",
    desiredDate: "Желаемая дата",
    comment: "Комментарий",
    subdivision: "Подразделение",
  };
  return labels[field];
}
