import { z } from "zod";

export const SIDEBAR_SECTION_MAIN = "main";
export const SIDEBAR_SECTION_ADMIN = "admin";

/** Ключи пунктов бокового меню (совпадают с module в навигации). */
export const SIDEBAR_NAV_KEYS = [
  "dashboard",
  "schedule",
  "equipment",
  "daily_inspection",
  "tasks",
  "contacts",
  "suppliers",
  "warehouse",
  "production_planning",
  "budget",
  "documents",
  "users",
  "reports",
] as const;

export type SidebarNavKey = (typeof SIDEBAR_NAV_KEYS)[number];

export const DEFAULT_MAIN_NAV_ORDER: SidebarNavKey[] = [
  "dashboard",
  "schedule",
  "equipment",
  "daily_inspection",
  "tasks",
  "contacts",
  "suppliers",
  "warehouse",
  "production_planning",
  "budget",
  "documents",
];

export const DEFAULT_ADMIN_NAV_ORDER: SidebarNavKey[] = ["users", "reports"];

export type UserUiPreferences = {
  sidebar?: {
    mainOrder?: SidebarNavKey[];
    adminOrder?: SidebarNavKey[];
  };
};

const sidebarNavKeySchema = z.enum(SIDEBAR_NAV_KEYS);

export const userUiPreferencesSchema = z.object({
  sidebar: z
    .object({
      mainOrder: z.array(sidebarNavKeySchema).optional(),
      adminOrder: z.array(sidebarNavKeySchema).optional(),
    })
    .optional(),
});

export const updateUiPreferencesSchema = userUiPreferencesSchema;

export function applyNavOrder<T extends { id: SidebarNavKey }>(
  items: T[],
  customOrder: SidebarNavKey[] | undefined,
  defaultOrder: SidebarNavKey[]
): T[] {
  const order = customOrder?.length ? customOrder : defaultOrder;
  const byId = new Map(items.map((i) => [i.id, i]));
  const result: T[] = [];
  const seen = new Set<SidebarNavKey>();

  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      result.push(item);
      seen.add(id);
    }
  }

  for (const id of defaultOrder) {
    if (!seen.has(id) && byId.has(id)) {
      result.push(byId.get(id)!);
      seen.add(id);
    }
  }

  for (const item of items) {
    if (!seen.has(item.id)) result.push(item);
  }

  return result;
}

export function mergeUiPreferences(
  current: UserUiPreferences | null | undefined,
  patch: UserUiPreferences
): UserUiPreferences {
  return {
    ...current,
    ...patch,
    sidebar: {
      ...current?.sidebar,
      ...patch.sidebar,
    },
  };
}
