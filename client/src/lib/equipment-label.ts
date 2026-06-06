import { equipmentStatusLabel } from "@shared/equipment-status-constants";

export function equipmentOptionLabel(eq: {
  name: string;
  type?: string | null;
  status?: string | null;
}): string {
  const typePart = eq.type ? ` (${eq.type})` : "";
  const statusPart = eq.status ? ` · ${equipmentStatusLabel(eq.status)}` : "";
  return `${eq.name}${typePart}${statusPart}`;
}
