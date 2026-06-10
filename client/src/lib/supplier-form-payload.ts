import type { Equipment } from "@shared/schema";
import { buildEquipmentLinkPayload } from "@/lib/contact-supplier-utils";
import type { SupplierFormValues } from "@/components/supplier-form-fields";

export function buildSupplierCreatePayload(
  form: SupplierFormValues,
  allEquipment: Equipment[]
) {
  const equipmentLink = buildEquipmentLinkPayload(form.equipmentIds, allEquipment);
  return {
    name: form.name.trim(),
    contactPerson: form.contactPerson.trim() || null,
    position: form.position.trim() || null,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    address: form.address.trim() || null,
    website: form.website.trim() || null,
    notes: form.notes.trim() || null,
    subdivisionIds: form.subdivisionIds,
    ...equipmentLink,
  };
}
