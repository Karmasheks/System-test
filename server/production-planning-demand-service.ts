import {
  createProductionOrder,
  getProduct,
  upsertProductEquipment,
  updateOrderStatus,
} from "./production-service";
import { bulkUpsertDailyPlan } from "./production-daily-plan-service";
import { getProductionTooling } from "./production-tooling-service";
import { resolveShiftNorm } from "@shared/production-norm-utils";
import type { ProductionOrderPriority } from "@shared/schema";

export type CreatePlanningDemandInput = {
  subdivisionId: number;
  productId: number;
  requestedQuantity: number;
  equipmentId: string;
  toolingId?: number;
  pfNumber?: string;
  desiredStartDate?: string;
  desiredEndDate?: string;
  priority?: ProductionOrderPriority;
  comment?: string;
  orderNumber?: string;
  shiftNormOverride?: number;
  cycleTimeSecOverride?: number;
  setupTimeMin?: number;
};

export async function createPlanningDemand(
  data: CreatePlanningDemandInput,
  user: { id: number; name: string }
) {
  const product = await getProduct(data.productId);
  if (!product) throw new Error("Изделие не найдено");
  if (product.subdivisionId !== data.subdivisionId) {
    throw new Error("Изделие не принадлежит выбранному подразделению");
  }

  const tooling = data.toolingId ? await getProductionTooling(data.toolingId) : null;
  if (tooling && tooling.subdivisionId !== data.subdivisionId) {
    throw new Error("Оснастка не принадлежит подразделению");
  }

  const pfNumber = data.pfNumber ?? tooling?.pfNumber ?? product.pfNumber ?? undefined;

  const equipmentLink = await upsertProductEquipment({
    productId: data.productId,
    equipmentId: data.equipmentId,
    subdivisionId: data.subdivisionId,
    priority: 0,
    cycleTimeSecOverride: data.cycleTimeSecOverride ?? tooling?.cycleTimeSec ?? undefined,
    shiftNormOverride:
      data.shiftNormOverride ?? resolveShiftNorm(product, null, tooling) ?? undefined,
    setupTimeMin: data.setupTimeMin ?? undefined,
    isActive: true,
  });

  const order = await createProductionOrder(
    {
      subdivisionId: data.subdivisionId,
      productId: data.productId,
      requestedQuantity: data.requestedQuantity,
      plannedQuantity: data.requestedQuantity,
      priority: data.priority ?? "medium",
      desiredStartDate: data.desiredStartDate ?? undefined,
      desiredEndDate: data.desiredEndDate ?? undefined,
      orderNumber: data.orderNumber?.trim() ?? "",
      orderNumberIsManual: Boolean(data.orderNumber?.trim()),
      comment: data.comment ?? undefined,
      status: "ready",
      source: "manual",
    },
    user
  );

  const planDate =
    data.desiredStartDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  await bulkUpsertDailyPlan(data.subdivisionId, [
    {
      equipmentId: data.equipmentId,
      orderId: order.id,
      productId: data.productId,
      planDate,
      shiftCode: "1",
      plannedQuantity: 0,
      pfNumber,
    },
  ]);

  await updateOrderStatus(order.id, "planned");

  return {
    order: { ...order, status: "planned" },
    equipmentLink,
    toolingId: tooling?.id ?? null,
    pfNumber,
    planDate,
  };
}
