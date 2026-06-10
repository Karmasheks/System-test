function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

/** Короткая подпись задачи на календаре: #id и модель оборудования. */
export function formatTaskCalendarLabel(
  taskId: number,
  equipmentModel?: string | null,
  maxLen = 24
): string {
  const model = equipmentModel?.trim();
  const base = `#${taskId}`;
  if (!model) return truncate(base, maxLen);
  return truncate(`${base} · ${model}`, maxLen);
}

/** Короткая подпись заявки на календаре. */
export function formatServiceRequestCalendarLabel(
  requestId: number,
  equipmentModel?: string | null,
  maxLen = 24
): string {
  const model = equipmentModel?.trim();
  const base = `Заявка #${requestId}`;
  if (!model) return truncate(`${base}`, maxLen);
  return truncate(`${base} · ${model}`, maxLen);
}

export function serviceRequestCalendarTitle(
  requestId: number,
  equipmentModel?: string | null,
  equipmentName?: string | null
): string {
  const parts = [`Заявка #${requestId}`];
  if (equipmentModel?.trim()) parts.push(equipmentModel.trim());
  else if (equipmentName?.trim()) parts.push(equipmentName.trim());
  return parts.join(" · ");
}

export function taskCalendarTitle(
  taskId: number,
  taskTitle?: string | null,
  equipmentModel?: string | null,
  equipmentName?: string | null
): string {
  const parts = [`Задача #${taskId}`];
  if (taskTitle?.trim()) parts.push(taskTitle.trim());
  if (equipmentModel?.trim()) parts.push(equipmentModel.trim());
  else if (equipmentName?.trim()) parts.push(equipmentName.trim());
  return parts.join(" · ");
}

export function equipmentModelFromId(
  equipmentId: string | null | undefined,
  equipment: { id: string; model?: string | null }[]
): string | null {
  if (!equipmentId) return null;
  const model = equipment.find((e) => e.id === equipmentId)?.model;
  return model?.trim() || null;
}
