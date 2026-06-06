/** ISO week string, e.g. 2026-W21 */
export function getIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday 09:00 local time for ISO week string (for calendar / plannedDate) */
export function isoWeekToMonday(isoWeek: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/i.exec(isoWeek.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (week < 1 || week > 53) return null;

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 9, 0, 0, 0);
}

export function resolvePlannedDate(plannedWeek?: string | null, plannedDate?: Date | null): Date | null {
  if (plannedDate) return plannedDate;
  if (plannedWeek) return isoWeekToMonday(plannedWeek);
  return null;
}
