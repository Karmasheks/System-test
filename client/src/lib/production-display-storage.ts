import type { ProductionDisplayConfig } from "@shared/production-display-config";

const STORAGE_KEY = "production-display-overrides-v1";

type OverridesStore = Record<string, Partial<ProductionDisplayConfig>>;

function readStore(): OverridesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OverridesStore;
  } catch {
    return {};
  }
}

function writeStore(store: OverridesStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function readDisplayOverrides(
  subdivisionId: number | null
): Partial<ProductionDisplayConfig> | null {
  const store = readStore();
  if (subdivisionId != null) {
    return store[String(subdivisionId)] ?? null;
  }
  return store.global ?? null;
}

export function writeDisplayOverrides(
  subdivisionId: number | null,
  overrides: Partial<ProductionDisplayConfig> | null
) {
  const store = readStore();
  const key = subdivisionId != null ? String(subdivisionId) : "global";
  if (!overrides) {
    delete store[key];
  } else {
    store[key] = overrides;
  }
  writeStore(store);
}

export function clearDisplayOverrides(subdivisionId: number | null) {
  writeDisplayOverrides(subdivisionId, null);
}
