export type HoursMinutes = {
  hours: number;
  minutes: number;
};

/** Разбивает сохранённые часы на целые часы и минуты. */
export function actualHoursToHoursMinutes(hours: number | null | undefined): HoursMinutes {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) {
    return { hours: 0, minutes: 0 };
  }
  const totalMinutes = Math.round(hours * 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/** Собирает длительность из полей «часы» и «минуты». */
export function hoursMinutesToActualHours(hours: number, minutes: number): number {
  const h = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
  const m = Number.isFinite(minutes) ? Math.max(0, Math.min(59, Math.floor(minutes))) : 0;
  const totalMinutes = h * 60 + m;
  if (totalMinutes <= 0) {
    throw new Error("Укажите время больше нуля");
  }
  return totalMinutes / 60;
}

/** Нормализует часы до точности в минутах. */
export function normalizeActualHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Некорректное значение часов");
  }
  const minutes = Math.round(hours * 60);
  if (minutes <= 0) {
    throw new Error("Время должно быть больше нуля");
  }
  return minutes / 60;
}

export function formatActualHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const { hours: h, minutes: m } = actualHoursToHoursMinutes(hours);
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}
