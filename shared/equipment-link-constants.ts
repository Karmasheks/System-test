export const EQUIPMENT_LINK_TYPES = [
  { code: "works_with", label: "Работает в связке" },
  { code: "auxiliary", label: "Вспомогательное" },
  { code: "depends_on", label: "Зависит от" },
] as const;

export type EquipmentLinkType = (typeof EQUIPMENT_LINK_TYPES)[number]["code"];

export function equipmentLinkTypeLabel(code: string): string {
  return EQUIPMENT_LINK_TYPES.find((t) => t.code === code)?.label ?? code;
}

export interface EquipmentLinkView {
  id: number;
  linkType: string;
  note: string | null;
  equipmentId: string;
  linkedEquipmentId: string;
  otherEquipmentId: string;
  otherEquipmentName: string;
  otherEquipmentType: string;
  otherEquipmentStatus: string;
}

export interface EquipmentLinkInput {
  linkedEquipmentId: string;
  linkType?: EquipmentLinkType;
  note?: string | null;
}

export function linksToFormInput(links: Pick<EquipmentLinkView, "otherEquipmentId" | "linkType" | "note">[]): EquipmentLinkInput[] {
  return links.map((link) => ({
    linkedEquipmentId: link.otherEquipmentId,
    linkType: (link.linkType as EquipmentLinkInput["linkType"]) ?? "works_with",
    note: link.note,
  }));
}
