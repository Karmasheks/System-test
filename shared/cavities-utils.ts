/** Утилиты для конфигурации гнёзд ПФ: «2+2+4+1» и изделий за цикл. */

export function normalizeCavitiesLayout(raw: string): string {
  return raw.trim().replace(/\s*\+\s*/g, "+");
}

export function parseCavitiesLayout(layout: string | null | undefined): number[] {
  if (!layout?.trim()) return [];
  return layout
    .split("+")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export function sumCavitiesLayout(layout: string | null | undefined): number | null {
  const parts = parseCavitiesLayout(layout);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0);
}

export function firstCavityFromLayout(layout: string | null | undefined): number | null {
  const parts = parseCavitiesLayout(layout);
  return parts.length > 0 ? parts[0] : null;
}

export type CavitiesConfig = {
  cavities?: number;
  cavitiesLayout?: string;
  piecesPerCycle?: number;
};

/** Изделий за одно смыкание для счётчика циклов и норм. */
export function effectivePiecesPerCycle(config: {
  piecesPerCycle?: number | null;
  cavitiesLayout?: string | null;
  cavities?: number | null;
}): number {
  if (config.piecesPerCycle != null && config.piecesPerCycle > 0) {
    return config.piecesPerCycle;
  }
  const first = firstCavityFromLayout(config.cavitiesLayout);
  if (first != null) return first;
  return Math.max(config.cavities ?? 1, 1);
}

export function formatCavitiesDisplay(config: {
  cavitiesLayout?: string | null;
  cavities?: number | null;
}): string {
  if (config.cavitiesLayout?.trim()) return config.cavitiesLayout.trim();
  if (config.cavities != null) return String(config.cavities);
  return "—";
}

/** Разбор поля ввода: число или «2+2+4+1». */
export function parseCavitiesInput(raw: string): Pick<CavitiesConfig, "cavities" | "cavitiesLayout"> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.includes("+")) {
    const layout = normalizeCavitiesLayout(trimmed);
    const parts = parseCavitiesLayout(layout);
    if (parts.length === 0) return {};
    return { cavitiesLayout: layout, cavities: parts.reduce((a, b) => a + b, 0) };
  }
  const n = parseInt(trimmed, 10);
  if (Number.isInteger(n) && n > 0) return { cavities: n };
  return {};
}
