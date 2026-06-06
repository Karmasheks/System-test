import { USER_PRESENCE_STATUSES, type UserPresenceStatus } from "@shared/user-presence-constants";

export const PRESENCE_STATUS_ORDER: UserPresenceStatus[] = [
  "working",
  "online",
  "break",
  "busy",
  "vacation",
  "absent",
];

export interface PresenceUser {
  id: number;
  name: string;
  avatar?: string | null;
  status: string;
  activityStatus?: string;
  onVacation?: boolean;
  expiresAt?: string | null;
}

export function getPresenceSortStatus(user: PresenceUser): UserPresenceStatus {
  const activity = (user.activityStatus ?? user.status) as UserPresenceStatus;
  if (user.onVacation && (activity === "absent" || activity === "vacation")) {
    return "vacation";
  }
  if (USER_PRESENCE_STATUSES.includes(activity)) return activity;
  return "absent";
}

export function sortUsersByPresenceStatus<T extends PresenceUser>(users: T[]): T[] {
  return [...users].sort((a, b) => {
    const ai = PRESENCE_STATUS_ORDER.indexOf(getPresenceSortStatus(a));
    const bi = PRESENCE_STATUS_ORDER.indexOf(getPresenceSortStatus(b));
    return (ai === -1 ? PRESENCE_STATUS_ORDER.length : ai) - (bi === -1 ? PRESENCE_STATUS_ORDER.length : bi);
  });
}

export function countUsersByPresenceStatus(users: PresenceUser[]): Record<UserPresenceStatus, number> {
  const counts = Object.fromEntries(USER_PRESENCE_STATUSES.map((s) => [s, 0])) as Record<
    UserPresenceStatus,
    number
  >;
  for (const user of users) {
    const activity = (user.activityStatus ?? user.status) as UserPresenceStatus;
    if (user.onVacation) {
      counts.vacation += 1;
    }
    if (USER_PRESENCE_STATUSES.includes(activity) && activity !== "vacation") {
      counts[activity] += 1;
    } else if (!user.onVacation && activity === "absent") {
      counts.absent += 1;
    }
  }
  return counts;
}
