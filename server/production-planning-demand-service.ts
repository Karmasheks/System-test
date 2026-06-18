import {
  createProductionOrder,
  getProduct,
  upsertProductEquipment,
  updateOrderStatus,
} from "./production-service";
import { bulkUpsertDailyPlan } from "./production-daily-plan-service";
import { getProductionTooling, getProductionToolingByPfNumber } from "./production-tooling-service";
import { resolveNormsForProduct } from "./product-shift-norm-service";
import { getActiveShiftPattern } from "./shift-template-service";
import { buildAutoPlanDistribution } from "@shared/production-plan-distribution";
import type { ProductionOrderPriority } from "@shared/schema";

export type PlanDistributionLine = {
  planDate: string;
  shiftCode: string;
  plannedQuantity: number;
};

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
  /** Коды смен для автоплана, напр. ["1"] или ["1","2"] */
  activeShiftCodes?: string[];
  /** Готовое распределение по дням/сменам (приоритет над автопланом) */
  planDistribution?: PlanDistributionLine[];
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

  const tooling =
    data.toolingId != null
      ? await getProductionTooling(data.toolingId)
      : product.pfNumber
        ? await getProductionToolingByPfNumber(data.subdivisionId, product.pfNumber)
        : null;
  if (tooling && tooling.subdivisionId !== data.subdivisionId) {
    throw new Error("Оснастка не принадлежит подразделению");
  }

  const pfNumber = data.pfNumber ?? tooling?.pfNumber ?? product.pfNumber ?? undefined;
  const pattern = await getActiveShiftPattern(data.subdivisionId);
  const normByShift = await resolveNormsForProduct(
    data.productId,
    data.subdivisionId,
    pattern.slots,
    tooling
  );

  const primaryShift = data.activeShiftCodes?.[0] ?? pattern.slots[0]?.code ?? "1";
  const primaryNorm =
    data.shiftNormOverride ??
    normByShift[primaryShift] ??
    product.defaultShiftNorm ??
    undefined;

  const equipmentLink = await upsertProductEquipment({
    productId: data.productId,
    equipmentId: data.equipmentId,
    subdivisionId: data.subdivisionId,
    priority: 0,
    cycleTimeSecOverride: data.cycleTimeSecOverride ?? tooling?.cycleTimeSec ?? undefined,
    shiftNormOverride: primaryNorm,
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

  const startDate =
    data.desiredStartDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const activeCodes =
    data.activeShiftCodes?.length
      ? data.activeShiftCodes
      : pattern.slots.map((s) => s.code);

  const distribution =
    data.planDistribution?.length
      ? data.planDistribution
      : buildAutoPlanDistribution({
          totalQuantity: data.requestedQuantity,
          startDate,
          endDate: data.desiredEndDate?.slice(0, 10),
          slots: pattern.slots,
          activeShiftCodes: activeCodes,
          normByShift,
        });

  if (distribution.length > 0) {
    await bulkUpsertDailyPlan(
      data.subdivisionId,
      distribution.map((line) => ({
        equipmentId: data.equipmentId,
        orderId: order.id,
        productId: data.productId,
        planDate: line.planDate,
        shiftCode: line.shiftCode,
        plannedQuantity: line.plannedQuantity,
        pfNumber,
        toolingId: tooling?.id ?? null,
      }))
    );
  } else {
    await bulkUpsertDailyPlan(data.subdivisionId, [
      {
        equipmentId: data.equipmentId,
        orderId: order.id,
        productId: data.productId,
        planDate: startDate,
        shiftCode: primaryShift,
        plannedQuantity: 0,
        pfNumber,
        toolingId: tooling?.id ?? null,
      },
    ]);
  }

  await updateOrderStatus(order.id, "planned");

  return {
    order: { ...order, status: "planned" as const },
    equipmentLink,
    toolingId: tooling?.id ?? null,
    pfNumber,
    planDistribution: distribution,
    normByShift,
  };
}
