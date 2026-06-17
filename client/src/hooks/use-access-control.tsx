import { useAuth } from "@/hooks/use-auth";
import {
  canCreateTasks as checkCanCreateTasks,
  canEditLevel,
  canProcessTasksCap,
  canViewCreatedTasks as checkCanViewCreatedTasks,
  canViewEmployeePresence as checkCanViewEmployeePresence,
  canViewLevel,
  isDashboardBlockVisible as checkDashboardBlockVisible,
  type AppModule,
  type DashboardBlock,
  type EffectivePermissions,
  type SensitiveField,
} from "@shared/permissions-constants";
import {
  canAccessSubdivision,
  canManageSubdivisionId,
  type SubdivisionScope,
} from "@shared/subdivision-scope";
import type { User } from "@shared/schema";

export type AuthUser = User & {
  effectivePermissions?: EffectivePermissions;
};

export function useAccessControl() {
  const { user } = useAuth() as { user: AuthUser | null };

  const permissions = user?.effectivePermissions;
  const taskCaps = permissions?.taskCapabilities;

  const canViewModule = (module: AppModule): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return canViewLevel(permissions?.modules[module]);
  };

  const canEditModule = (module: AppModule): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return canEditLevel(permissions?.modules[module]);
  };

  const isFieldVisible = (field: SensitiveField): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return !(permissions?.hiddenFields ?? []).includes(field);
  };

  const isDashboardBlockVisible = (block: DashboardBlock): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return checkDashboardBlockVisible(permissions?.hiddenDashboardBlocks, block);
  };

  const canCreateTasks = (): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (taskCaps) return checkCanCreateTasks(taskCaps);
    return canEditModule("tasks");
  };

  const canViewCreatedTasks = (): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (taskCaps) return checkCanViewCreatedTasks(taskCaps);
    return canEditModule("tasks");
  };

  const canProcessTasks = (): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (taskCaps) return canProcessTasksCap(taskCaps);
    return canEditModule("tasks");
  };

  const canAccessTasksSection = (): boolean =>
    canViewModule("tasks") ||
    canViewModule("service_requests") ||
    canCreateTasks() ||
    canViewCreatedTasks();

  const canConvertTaskToServiceRequest = (): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return permissions?.taskCapabilities?.convertToServiceRequest ?? false;
  };

  const canViewEmployeePresence = (): boolean => checkCanViewEmployeePresence(user?.role);

  const subdivisionScope = (): SubdivisionScope | null =>
    permissions?.subdivisionScope ?? null;

  const canAccessSubdivisionId = (subdivisionId: number | null | undefined): boolean => {
    const scope = subdivisionScope();
    if (!scope) return true;
    return canAccessSubdivision(scope, subdivisionId);
  };

  const isSystemAdmin = (): boolean =>
    user?.role === "admin" || !!permissions?.isSystemAdmin;

  const isSubdivisionAdmin = (): boolean => !!permissions?.isSubdivisionAdmin;

  const isSuperAdmin = (): boolean => !!permissions?.isSuperAdmin;

  const canAssignAdminPrivileges = (): boolean => isSuperAdmin();

  const canManageUsers = (): boolean => {
    if (!user) return false;
    if (isSystemAdmin()) return true;
    return isSubdivisionAdmin() && canEditModule("users");
  };

  const canManageSubdivision = (subdivisionId: number | null | undefined): boolean => {
    if (!user) return false;
    return canManageSubdivisionId(
      {
        role: user.role,
        managedSubdivisionIds: permissions?.managedSubdivisionIds ?? user.managedSubdivisionIds,
      },
      subdivisionId
    );
  };

  return {
    permissions,
    subdivisionScope,
    canAccessSubdivisionId,
    isSystemAdmin,
    isSubdivisionAdmin,
    isSuperAdmin,
    canAssignAdminPrivileges,
    canManageUsers,
    canManageSubdivision,
    canViewModule,
    canEditModule,
    canCreateTasks,
    canViewCreatedTasks,
    canProcessTasks,
    canAccessTasksSection,
    canConvertTaskToServiceRequest,
    canViewEmployeePresence,
    isFieldVisible,
    isDashboardBlockVisible,
    isAdmin: user?.role === "admin",
  };
}

/** Скрытое значение для конфиденциальных полей */
export function maskSensitiveValue(visible: boolean, value: string | number | null | undefined, mask = "••••••"): string {
  if (visible) {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }
  return mask;
}
