import { EQUIPMENT_STATUS_LABELS, equipmentStatusLabel } from "./equipment-utils";

export const EQUIPMENT_STATUSES = ["active", "maintenance", "repair", "inactive", "decommissioned"] as const;
export type EquipmentStatusCode = (typeof EQUIPMENT_STATUSES)[number];

export { EQUIPMENT_STATUS_LABELS, equipmentStatusLabel };

export const EQUIPMENT_STATUS_BADGE_CLASS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  maintenance:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  repair: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  inactive: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  decommissioned: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function equipmentStatusBadgeClass(status: string | null | undefined): string {
  if (!status) return EQUIPMENT_STATUS_BADGE_CLASS.inactive;
  return EQUIPMENT_STATUS_BADGE_CLASS[status] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}
