import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubdivisionMultiPicker } from "@/components/subdivision-multi-picker";
import { EquipmentMultiPicker } from "@/components/equipment-multi-picker";
import { useEquipmentApi } from "@/hooks/use-equipment-api";
import type { Equipment } from "@shared/schema";

export type SupplierFormValues = {
  name: string;
  contactPerson: string;
  position: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  notes: string;
  equipmentIds: string[];
  subdivisionIds: number[];
};

export function emptySupplierForm(): SupplierFormValues {
  return {
    name: "",
    contactPerson: "",
    position: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    notes: "",
    equipmentIds: [],
    subdivisionIds: [],
  };
}

type SupplierFormFieldsProps = {
  value: SupplierFormValues;
  onChange: (value: SupplierFormValues) => void;
  equipment?: Equipment[];
};

export function SupplierFormFields({ value, onChange, equipment }: SupplierFormFieldsProps) {
  const { allEquipment: defaultEquipment } = useEquipmentApi();
  const allEquipment = equipment ?? defaultEquipment;

  const set = (patch: Partial<SupplierFormValues>) => onChange({ ...value, ...patch });

  const handleEquipmentChange = (equipmentIds: string[]) => {
    const subdivisionSet = new Set(value.subdivisionIds);
    for (const id of equipmentIds) {
      const eq = allEquipment.find((e) => e.id === id);
      if (eq?.subdivisionId) subdivisionSet.add(eq.subdivisionId);
    }
    onChange({
      ...value,
      equipmentIds,
      subdivisionIds: Array.from(subdivisionSet).sort((a, b) => a - b),
    });
  };

  return (
    <div className="grid gap-3">
      <div>
        <Label>Название *</Label>
        <Input value={value.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div>
        <Label>Контактное лицо</Label>
        <Input value={value.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} />
      </div>
      <div>
        <Label>Должность</Label>
        <Input value={value.position} onChange={(e) => set({ position: e.target.value })} />
      </div>
      <div>
        <Label>Телефон</Label>
        <Input value={value.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <div>
        <Label>Email</Label>
        <Input value={value.email} onChange={(e) => set({ email: e.target.value })} />
      </div>
      <div>
        <Label>Адрес</Label>
        <Input value={value.address} onChange={(e) => set({ address: e.target.value })} />
      </div>
      <div>
        <Label>Сайт</Label>
        <Input value={value.website} onChange={(e) => set({ website: e.target.value })} />
      </div>

      <SubdivisionMultiPicker
        value={value.subdivisionIds}
        onChange={(subdivisionIds) => {
          const subSet = new Set(subdivisionIds);
          const equipmentIds =
            subdivisionIds.length === 0
              ? value.equipmentIds
              : value.equipmentIds.filter((id) => {
                  const eq = allEquipment.find((e) => e.id === id);
                  return eq?.subdivisionId != null && subSet.has(eq.subdivisionId);
                });
          onChange({ ...value, subdivisionIds, equipmentIds });
        }}
        description="Поставщик может обслуживать несколько подразделений"
      />

      <EquipmentMultiPicker
        equipment={allEquipment}
        value={value.equipmentIds}
        subdivisionIds={value.subdivisionIds}
        onChange={handleEquipmentChange}
        description="Оборудование, для которого актуален поставщик"
      />

      <div>
        <Label>Комментарий</Label>
        <Textarea
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Заметки по поставщику…"
          rows={3}
          className="resize-y min-h-[72px]"
        />
      </div>
    </div>
  );
}
