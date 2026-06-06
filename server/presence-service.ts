import type { User } from "@shared/schema";
import { storage } from "./storage";
import {
  buildExpiredPresenceUpdate,
  isPresenceExpired,
  resolvePresence,
  type ResolvedPresence,
} from "@shared/presence-utils";
import { notifyPresenceUpdated } from "./presence-events";

export {
  buildExpiredPresenceUpdate,
  buildPresenceUpdate,
  isPresenceExpired,
  resolvePresence,
  type ResolvedPresence,
} from "@shared/presence-utils";

/** Сбрасывает просроченные статусы в БД (на работе без входа > 24 ч и т.п.). */
export async function expireStalePresenceUsers(): Promise<number> {
  const allUsers = await storage.getAllUsers();
  let updated = 0;
  for (const user of allUsers.filter((u) => u.isActive)) {
    if (!isPresenceExpired(user)) continue;
    const row = await storage.updateUser(user.id, buildExpiredPresenceUpdate());
    if (row) {
      notifyPresenceUpdated(user.id);
      updated += 1;
    }
  }
  return updated;
}

export function toPresenceApiRow(user: User, resolved: ResolvedPresence) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    department: user.department,
    position: user.position,
    status: resolved.status,
    activityStatus: resolved.activityStatus,
    onVacation: resolved.onVacation,
    lastSeen: resolved.lastSeen,
    expiresAt: resolved.expiresAt,
  };
}
