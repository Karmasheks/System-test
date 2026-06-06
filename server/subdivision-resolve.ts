import { storage } from "./storage";
import { getSubdivisionById } from "./subdivision-service";

/** Подразделение задачи: из тела запроса, оборудования или сотрудника. */
export async function resolveTaskSubdivisionId(options: {
  explicitId?: number | null;
  equipmentId?: string | null;
  userSubdivisionId?: number | null;
}): Promise<number | null> {
  if (options.explicitId && options.explicitId > 0) {
    const row = await getSubdivisionById(options.explicitId);
    return row?.id ?? null;
  }
  if (options.equipmentId) {
    const eq = await storage.getEquipment(options.equipmentId);
    if (eq?.subdivisionId) return eq.subdivisionId;
  }
  if (options.userSubdivisionId && options.userSubdivisionId > 0) {
    return options.userSubdivisionId;
  }
  return null;
}
