import {
  DEFAULT_PRESENCE_STATUS,
  isActivityStatus,
  isOnScheduledVacation,
  PRESENCE_INACTIVITY_RESET_MS,
  PRESENCE_STATUS_TTL_MS,
  type ActivityPresenceStatus,
  type UserPresenceStatus,
  type VacationPeriod,
} from "./user-presence-constants";

const TIMED_PRESENCE_STATUSES: UserPresenceStatus[] = ["working", "online", "break", "busy"];

export interface PresenceSourceUser {
  presenceStatus?: string | null;
  presenceUpdatedAt?: Date | string | null;
  presenceExpiresAt?: Date | string | null;
  lastLoginAt?: Date | string | null;
  vacationPeriods?: VacationPeriod[] | null;
}

export interface ResolvedPresence {
  status: UserPresenceStatus;
  activityStatus: ActivityPresenceStatus;
  onVacation: boolean;
  lastSeen: string | null;
  expiresAt: string | null;
  storedStatus: UserPresenceStatus;
}

export function normalizeVacationPeriods(periods: VacationPeriod[] | null | undefined): VacationPeriod[] {
  return Array.isArray(periods) ? periods : [];
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function computePresenceExpiresAt(
  status: UserPresenceStatus,
  from: Date = new Date()
): Date | null {
  const ttl = PRESENCE_STATUS_TTL_MS[status];
  if (ttl == null) return null;
  return new Date(from.getTime() + ttl);
}

export function isPresenceExpired(user: PresenceSourceUser, now: Date = new Date()): boolean {
  const stored = (user.presenceStatus ?? DEFAULT_PRESENCE_STATUS) as UserPresenceStatus;
  if (!TIMED_PRESENCE_STATUSES.includes(stored)) return false;

  const nowMs = now.getTime();

  const lastLogin = toDate(user.lastLoginAt);
  if (lastLogin && nowMs - lastLogin.getTime() > PRESENCE_INACTIVITY_RESET_MS) {
    return true;
  }

  const updatedAt = toDate(user.presenceUpdatedAt);
  if (!lastLogin && updatedAt && nowMs - updatedAt.getTime() > PRESENCE_INACTIVITY_RESET_MS) {
    return true;
  }

  const expiresAt = toDate(user.presenceExpiresAt);
  if (expiresAt && expiresAt.getTime() <= nowMs) {
    return true;
  }

  if (!expiresAt && updatedAt) {
    const ttl = PRESENCE_STATUS_TTL_MS[stored];
    if (ttl != null && nowMs - updatedAt.getTime() > ttl) {
      return true;
    }
  }

  return false;
}

export function resolveStoredActivityStatus(
  presenceStatus: string | null | undefined
): ActivityPresenceStatus {
  const status = (presenceStatus ?? DEFAULT_PRESENCE_STATUS) as UserPresenceStatus;
  if (status === "vacation") return "absent";
  if (isActivityStatus(status)) return status as ActivityPresenceStatus;
  return "absent";
}

export function resolvePresence(user: PresenceSourceUser, now: Date = new Date()): ResolvedPresence {
  const periods = normalizeVacationPeriods(user.vacationPeriods);
  const scheduledVacation = isOnScheduledVacation(periods, now);
  const storedStatus = (user.presenceStatus ?? DEFAULT_PRESENCE_STATUS) as UserPresenceStatus;
  const manualVacation = storedStatus === "vacation";
  const onVacation = scheduledVacation || manualVacation;

  let activityStatus = resolveStoredActivityStatus(storedStatus);
  let expiresAt = toDate(user.presenceExpiresAt);

  if (isPresenceExpired(user, now)) {
    activityStatus = "absent";
    expiresAt = null;
  }

  let status: UserPresenceStatus = activityStatus;
  if (onVacation && activityStatus === "absent") {
    status = "vacation";
  }

  return {
    status,
    activityStatus,
    onVacation,
    lastSeen: toDate(user.presenceUpdatedAt)?.toISOString() ?? null,
    expiresAt: expiresAt?.toISOString() ?? null,
    storedStatus,
  };
}

export function buildPresenceUpdate(
  status: UserPresenceStatus,
  options?: { clearExpiry?: boolean }
): {
  presenceStatus: UserPresenceStatus;
  presenceUpdatedAt: Date;
  presenceExpiresAt: Date | null;
} {
  const now = new Date();
  const expiresAt = options?.clearExpiry === true ? null : computePresenceExpiresAt(status, now);
  return {
    presenceStatus: status,
    presenceUpdatedAt: now,
    presenceExpiresAt: expiresAt,
  };
}

export function buildExpiredPresenceUpdate(): {
  presenceStatus: "absent";
  presenceUpdatedAt: Date;
  presenceExpiresAt: null;
} {
  return {
    presenceStatus: "absent",
    presenceUpdatedAt: new Date(),
    presenceExpiresAt: null,
  };
}
