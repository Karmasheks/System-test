export interface MaterialRequirementLine {
  materialId: number;
  materialName: string;
  sapCode: string;
  unit: string;
  usageType: string;
  required: number;
  available: number;
  reserved: number;
  isRequired: boolean;
  sufficient: boolean;
}

export interface ScheduleTimelineSlot {
  id: number;
  equipmentId: string;
  orderId: number;
  startTime: string;
  endTime: string;
  plannedQuantity: number;
  status: string;
  conflictStatus: string;
  comment?: string | null;
}

export interface MaintenanceBlock {
  id: number;
  equipmentId: string;
  equipmentName: string;
  scheduledDate: string;
  status: string;
  maintenanceType: string;
}

export interface ToirOverlayBlock {
  id: string;
  kind: "maintenance" | "repair";
  equipmentId: string;
  equipmentName: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
}
