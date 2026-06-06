export const USER_PRESENCE_STATUSES = [
  "online",
  "working",
  "break",
  "vacation",
  "absent",
  "busy",
] as const;

export type UserPresenceStatus = (typeof USER_PRESENCE_STATUSES)[number];

export const ACTIVITY_PRESENCE_STATUSES = [
  "online",
  "working",
  "break",
  "busy",
  "absent",
] as const;

export type ActivityPresenceStatus = (typeof ACTIVITY_PRESENCE_STATUSES)[number];

export const DEFAULT_PRESENCE_STATUS: UserPresenceStatus = "absent";

export type VacationPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  note?: string;
};

/** Сброс «на работе» и др., если сотрудник не заходил в систему (мс). */
export const PRESENCE_INACTIVITY_RESET_MS = 24 * 60 * 60 * 1000;

/** Автосброс статуса, если сотрудник забыл сменить его (мс). null — без ограничения. */
export const PRESENCE_STATUS_TTL_MS: Record<UserPresenceStatus, number | null> = {
  working: 8 * 60 * 60 * 1000,
  online: 4 * 60 * 60 * 1000,
  break: 60 * 60 * 1000,
  busy: 2 * 60 * 60 * 1000,
  vacation: null,
  absent: null,
};

export function isActivityStatus(status: string): status is ActivityPresenceStatus {
  return (ACTIVITY_PRESENCE_STATUSES as readonly string[]).includes(status);
}

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isDateWithinPeriod(date: Date, startDate: string, endDate: string): boolean {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  end.setHours(23, 59, 59, 999);
  const ts = date.getTime();
  return ts >= start.getTime() && ts <= end.getTime();
}

export function isOnScheduledVacation(
  periods: VacationPeriod[] | null | undefined,
  date: Date = new Date()
): boolean {
  if (!periods?.length) return false;
  return periods.some((p) => isDateWithinPeriod(date, p.startDate, p.endDate));
}
