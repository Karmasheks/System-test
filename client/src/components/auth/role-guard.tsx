import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { roleLabel, type AppModule } from "@shared/permissions-constants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Lock } from "lucide-react";

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showMessage?: boolean;
}

export function RoleGuard({ allowedRoles, children, fallback, showMessage = true }: RoleGuardProps) {
  const { user } = useAuth();

  if (!user) {
    return fallback || (showMessage ? (
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          Необходимо войти в систему для доступа к этому разделу.
        </AlertDescription>
      </Alert>
    ) : null);
  }

  if (!allowedRoles.includes(user.role)) {
    return fallback || (showMessage ? (
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          У вас недостаточно прав для доступа к этому разделу. 
          Текущая роль: {getRoleDisplayName(user.role)}. 
          Обратитесь к администратору для получения дополнительных прав.
        </AlertDescription>
      </Alert>
    ) : null);
  }

  return <>{children}</>;
}

// Компонент для скрытия элементов интерфейса на основе ролей
interface RoleBasedProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function RoleBased({ allowedRoles, children }: RoleBasedProps) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}

// Хук для проверки прав доступа
export function usePermissions() {
  const { user } = useAuth();
  const { canViewModule, canEditModule, isFieldVisible, isAdmin } = useAccessControl();

  const hasRole = (role: string) => user?.role === role;

  const hasAnyRole = (roles: string[]) => user != null && roles.includes(user.role);

  const canViewModuleAccess = (module: AppModule) => canViewModule(module);

  const canEditModuleAccess = (module: AppModule) => canEditModule(module);

  return {
    hasRole,
    hasAnyRole,
    canView: () => !!user,
    canEdit: () => isAdmin || canEditModule("tasks"),
    canCreate: () => isAdmin || canEditModule("tasks"),
    canDelete: () => isAdmin || hasAnyRole(["admin", "operator"]),
    canManageUsers: () => isAdmin,
    canManageSystem: () => isAdmin,
    canViewModule: canViewModuleAccess,
    canEditModule: canEditModuleAccess,
    isFieldVisible,
    currentRole: user?.role || "guest",
  };
}

export function getRoleDisplayName(role: string): string {
  return roleLabel(role?.trim() || "viewer");
}

export function getRoleDescription(role: string): string {
  switch (role) {
    case "admin":
      return "Полный доступ ко всем функциям системы";
    case "operator":
      return "Может выполнять осмотры, создавать отчеты, управлять оборудованием";
    case "engineer":
      return "Может просматривать данные, выполнять ежедневные осмотры";
    case "technician":
      return "Выполнение задач и осмотров, просмотр склада и оборудования";
    case "viewer":
      return "Только просмотр данных без возможности изменений";
    default:
      return "Права задаются профилем роли в настройках администратора";
  }
}