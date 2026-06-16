import { z } from "zod";
import { PRODUCTION_ORDER_PRIORITIES } from "./schema";

export const PRODUCTION_IMPORT_FIELDS = [
  "productSapCode",
  "productName",
  "quantity",
  "priority",
  "desiredDate",
  "comment",
  "subdivision",
] as const;

export type ProductionImportField = (typeof PRODUCTION_IMPORT_FIELDS)[number];

export const PRODUCTION_IMPORT_FIELD_LABELS: Record<ProductionImportField, string> = {
  productSapCode: "SAP изделия",
  productName: "Наименование изделия",
  quantity: "Количество",
  priority: "Приоритет",
  desiredDate: "Желаемая дата",
  comment: "Комментарий",
  subdivision: "Подразделение",
};

/** Подсказки для автоматического сопоставления заголовков Excel */
export const PRODUCTION_IMPORT_HEADER_ALIASES: Record<ProductionImportField, string[]> = {
  productSapCode: [
    "sap",
    "sap код",
    "код sap",
    "sap изделия",
    "sap code",
    "sapcode",
    "код изделия",
    "номер sap",
  ],
  productName: [
    "наименование",
    "изделие",
    "название",
    "наименование изделия",
    "product",
    "name",
    "продукт",
  ],
  quantity: [
    "количество",
    "кол-во",
    "кол.",
    "qty",
    "quantity",
    "объем",
    "план",
    "запрошено",
  ],
  priority: ["приоритет", "priority", "urgency"],
  desiredDate: [
    "желаемая дата",
    "дата",
    "срок",
    "desired date",
    "дата завершения",
    "дата начала",
    "deadline",
  ],
  comment: ["комментарий", "comment", "note", "примечание", "описание"],
  subdivision: [
    "подразделение",
    "subdivision",
    "цех",
    "отдел",
    "department",
  ],
};

export const productionImportColumnMappingSchema = z.object({
  productSapCode: z.string().optional(),
  productName: z.string().optional(),
  quantity: z.string().optional(),
  priority: z.string().optional(),
  desiredDate: z.string().optional(),
  comment: z.string().optional(),
  subdivision: z.string().optional(),
});

export type ProductionImportColumnMapping = z.infer<typeof productionImportColumnMappingSchema>;

export const mappedProductionImportRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  productSapCode: z.string().optional(),
  productName: z.string().optional(),
  quantity: z.number().positive().optional(),
  priority: z.string().optional(),
  desiredDate: z.string().optional(),
  comment: z.string().optional(),
  subdivisionName: z.string().optional(),
  subdivisionId: z.number().int().optional(),
});

export type MappedProductionImportRow = z.infer<typeof mappedProductionImportRowSchema>;

export interface ImportPreviewError {
  field?: string;
  message: string;
}

export interface ImportPreviewItem {
  rowNumber: number;
  valid: boolean;
  errors: ImportPreviewError[];
  resolved?: {
    subdivisionId: number;
    subdivisionName: string;
    productId: number;
    productName: string;
    productSapCode: string;
    quantity: number;
    priority: string;
    desiredStartDate?: string;
    comment?: string;
  };
  raw: MappedProductionImportRow;
}

export const productionImportPreviewSchema = z.object({
  defaultSubdivisionId: z.number().int().positive(),
  fileName: z.string().optional(),
  rows: z.array(mappedProductionImportRowSchema).min(1),
});

export const productionImportConfirmSchema = productionImportPreviewSchema;

export const PRODUCTION_EXPORT_TYPES = [
  "plan",
  "shift-assignment",
  "material-requirements",
  "plan-fact",
  "conflicts",
] as const;

export type ProductionExportType = (typeof PRODUCTION_EXPORT_TYPES)[number];

export const PRODUCTION_EXPORT_LABELS: Record<ProductionExportType, string> = {
  plan: "Производственный план",
  "shift-assignment": "Сменное задание",
  "material-requirements": "Потребность в сырье",
  "plan-fact": "План / факт",
  conflicts: "Список конфликтов",
};

export function normalizeImportPriority(value: string | undefined): string {
  if (!value?.trim()) return "medium";
  const v = value.trim().toLowerCase();
  const map: Record<string, string> = {
    low: "low",
    l: "low",
    низкий: "low",
    низк: "low",
    medium: "medium",
    m: "medium",
    средний: "medium",
    средн: "medium",
    high: "high",
    h: "high",
    высокий: "high",
    высок: "high",
    critical: "critical",
    c: "critical",
    критический: "critical",
    критич: "critical",
  };
  const normalized = map[v] ?? v;
  return (PRODUCTION_ORDER_PRIORITIES as readonly string[]).includes(normalized)
    ? normalized
    : "medium";
}

export function suggestImportColumnMapping(headers: string[]): ProductionImportColumnMapping {
  const mapping: ProductionImportColumnMapping = {};
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    norm: h.trim().toLowerCase().replace(/\s+/g, " "),
  }));

  for (const field of PRODUCTION_IMPORT_FIELDS) {
    const aliases = PRODUCTION_IMPORT_HEADER_ALIASES[field];
    const match = normalizedHeaders.find((h) =>
      aliases.some((a) => h.norm === a || h.norm.includes(a))
    );
    if (match) {
      mapping[field] = match.original;
    }
  }

  return mapping;
}
