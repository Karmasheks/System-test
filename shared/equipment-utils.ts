import type { Equipment, InsertEquipment } from "./schema";

function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function normalizeImageUrls(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  return raw.map(String).map((url) => url.trim()).filter(Boolean);
}

/** Следующий свободный ID вида EQ001, EQ002… с учётом удалённых записей. */
export function generateNextEquipmentId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const match = /^EQ(\d+)$/i.exec(String(id).trim());
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `EQ${String(max + 1).padStart(3, "0")}`;
}

export function formatEquipmentResponsible(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "Не назначен";
}

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  active: "Активно",
  maintenance: "На ТО / в ремонте",
  inactive: "Неактивно",
  decommissioned: "Выведено из эксплуатации",
};

export function equipmentStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return EQUIPMENT_STATUS_LABELS[status] ?? status;
}

/** Доступно для ежедневного осмотра: не на ТО, ремонте в другом подразделении и не неактивно. */
export function isEquipmentAvailableForInspection(eq: {
  status?: string | null;
  repairSubdivisionId?: number | null;
}): boolean {
  if (eq.status === "decommissioned" || eq.status === "inactive") return false;
  if (eq.status === "maintenance") return false;
  if (eq.repairSubdivisionId != null) return false;
  return eq.status === "active";
}

export function formatEquipmentLocation(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "Не указано";
}

/** Приводит объект оборудования из API к единому виду (camelCase + массивы). */
export function normalizeEquipmentRecord(item: Record<string, unknown>): Equipment {
  return {
    ...(item as unknown as Equipment),
    confluenceUrl: (item.confluenceUrl ?? item.confluence_url ?? null) as string | null,
    imageUrls: normalizeImageUrls(item.imageUrls ?? item.image_urls),
    maintenancePeriods: (item.maintenancePeriods ?? item.maintenance_periods ?? []) as string[],
  };
}

export function parseEquipmentCreatePayload(body: Record<string, unknown>): InsertEquipment {
  return {
    id: String(body.id ?? ""),
    name: String(body.name ?? "").trim(),
    type: String(body.type ?? "").trim(),
    description: emptyToNull(body.description),
    status: String(body.status ?? "active"),
    lastMaintenance: String(body.lastMaintenance ?? ""),
    nextMaintenance: String(body.nextMaintenance ?? ""),
    responsible: String(body.responsible ?? "").trim(),
    maintenancePeriods: Array.isArray(body.maintenancePeriods)
      ? body.maintenancePeriods.map(String)
      : [],
    department: String(body.department ?? ""),
    subdivisionId:
      body.subdivisionId != null && body.subdivisionId !== ""
        ? Number(body.subdivisionId)
        : null,
    subdivisionName: emptyToNull(body.subdivisionName ?? body.subdivision_name),
    model: emptyToNull(body.model),
    serialNumber: emptyToNull(body.serialNumber),
    inventoryNumber: emptyToNull(body.inventoryNumber),
    installationDate: emptyToNull(body.installationDate),
    warrantyUntil: emptyToNull(body.warrantyUntil),
    location: emptyToNull(body.location),
    confluenceUrl: emptyToNull(body.confluenceUrl),
    imageUrls: normalizeImageUrls(body.imageUrls ?? body.image_urls),
  };
}

export function parseEquipmentUpdatePayload(
  body: Record<string, unknown>
): Partial<InsertEquipment> {
  const update: Partial<InsertEquipment> = {};

  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.type !== undefined) update.type = String(body.type).trim();
  if (body.description !== undefined) update.description = emptyToNull(body.description);
  if (body.status !== undefined) update.status = String(body.status);
  if (body.lastMaintenance !== undefined) update.lastMaintenance = String(body.lastMaintenance);
  if (body.nextMaintenance !== undefined) update.nextMaintenance = String(body.nextMaintenance);
  if (body.responsible !== undefined) update.responsible = String(body.responsible).trim();
  if (body.maintenancePeriods !== undefined) {
    update.maintenancePeriods = Array.isArray(body.maintenancePeriods)
      ? body.maintenancePeriods.map(String)
      : [];
  }
  if (body.department !== undefined) update.department = String(body.department);
  if (body.subdivisionId !== undefined) {
    update.subdivisionId =
      body.subdivisionId != null && body.subdivisionId !== ""
        ? Number(body.subdivisionId)
        : null;
  }
  if (body.subdivisionName !== undefined) {
    update.subdivisionName = emptyToNull(body.subdivisionName);
  }
  if (body.model !== undefined) update.model = emptyToNull(body.model);
  if (body.serialNumber !== undefined) update.serialNumber = emptyToNull(body.serialNumber);
  if (body.inventoryNumber !== undefined) update.inventoryNumber = emptyToNull(body.inventoryNumber);
  if (body.installationDate !== undefined) update.installationDate = emptyToNull(body.installationDate);
  if (body.warrantyUntil !== undefined) update.warrantyUntil = emptyToNull(body.warrantyUntil);
  if (body.location !== undefined) update.location = emptyToNull(body.location);
  if (body.confluenceUrl !== undefined) update.confluenceUrl = emptyToNull(body.confluenceUrl);
  if (body.imageUrls !== undefined || body.image_urls !== undefined) {
    update.imageUrls = normalizeImageUrls(body.imageUrls ?? body.image_urls);
  }

  return update;
}
