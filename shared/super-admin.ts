import type { User } from "./schema";

export function isSuperAdminUser(
  user: Pick<User, "isSuperAdmin"> | null | undefined
): boolean {
  return user?.isSuperAdmin === true;
}

/** Может назначать/отзывать роль admin и права администратора подразделения */
export function canAssignAdminPrivileges(
  actor: Pick<User, "isSuperAdmin"> | null | undefined
): boolean {
  return isSuperAdminUser(actor);
}
