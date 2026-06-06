import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlusCircle, FileEdit, Trash2, Eye, UserPlus, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { getPresenceBadges, AdminUserStatusSelector } from "@/components/layout/user-status";
import { DEFAULT_PRESENCE_STATUS } from "@shared/user-presence-constants";
import { resolvePresence } from "@shared/presence-utils";
import { useUserStatus } from "@/hooks/use-user-status";
import { VacationPeriodsEditor } from "@/components/user/vacation-periods-editor";
import type { VacationPeriod } from "@shared/user-presence-constants";
import { apiRequest } from "@/lib/queryClient";
import { maskSensitiveValue, useAccessControl } from "@/hooks/use-access-control";
import { PermissionEditor, type PermissionEditorState } from "@/components/admin/permission-editor";
import { RoleProfilesPanel } from "@/components/admin/role-profiles-panel";
import { SubdivisionsPanel } from "@/components/admin/subdivisions-panel";
import { SubdivisionAccessEditor } from "@/components/admin/subdivision-access-editor";
import { SubdivisionPicker } from "@/components/subdivision-picker";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { normalizeExtraSubdivisionIds } from "@shared/subdivision-scope";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_ROLE_ACCESS_PROFILES,
  MODULE_DEFINITIONS,
  deriveTaskCapabilities,
  normalizeTaskCapabilities,
  roleLabel,
  resolveRoleProfileLabel,
  type AccessLevel,
  type AppModule,
  type RoleAccessProfile,
} from "@shared/permissions-constants";

export default function Users() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { isFieldVisible } = useAccessControl();
  const showUserEmails = isFieldVisible("user_emails");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { updateUserStatus } = useUserStatus();
  const queryClient = useQueryClient();

  // Состояния для диалогов
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Состояние формы для добавления/редактирования
  const [formData, setFormData] = useState({
    id: 0,
    name: "",
    email: "",
    role: "viewer",
    department: "",
    subdivisionId: "",
    extraSubdivisionIds: [] as number[],
    viewAllSubdivisions: false,
    position: "",
    avatar: "",
    password: "",
    useCustomPermissions: false,
  });
  const [adminVacationPeriods, setAdminVacationPeriods] = useState<VacationPeriod[]>([]);
  const [permissionState, setPermissionState] = useState<PermissionEditorState>(() => {
    const modules = Object.fromEntries(
      MODULE_DEFINITIONS.map((m) => [m.key, "none" as AccessLevel])
    ) as Record<AppModule, AccessLevel>;
    return {
      modules,
      hiddenFields: [],
      hiddenDashboardBlocks: [],
      taskCapabilities: deriveTaskCapabilities(modules),
    };
  });

  const { data: subdivisions = [] } = useSubdivisions();

  const subdivisionName = (id: number | null | undefined) =>
    id ? subdivisions.find((s) => s.id === id)?.name ?? `#${id}` : "Не указано";

  const { data: roleProfiles = [] } = useQuery<RoleAccessProfile[]>({
    queryKey: ["/api/permissions/roles"],
    enabled: !!user && user.role === "admin",
  });

  // Получение данных пользователей из API
  const { data: usersList = [], isLoading: usersLoading, error: usersError, refetch } = useQuery({
    queryKey: ['/api/users'],
    enabled: !!user && user.role === 'admin',
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const getUserPresenceView = (record: any) => resolvePresence(record);

  const updateVacationPeriodsMutation = useMutation({
    mutationFn: async ({ id, periods }: { id: number; periods: VacationPeriod[] }) => {
      return apiRequest("PUT", `/api/users/${id}/vacation-periods`, { periods });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/presence"] });
    },
  });

  // Мутации для работы с пользователями
  const createUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      return apiRequest('POST', '/api/users', userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, userData }: { id: number, userData: any }) => {
      return apiRequest('PUT', `/api/users/${id}`, userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    }
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: unknown }) => {
      return apiRequest("PUT", `/api/users/${id}/permissions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const buildPermissionStateForUser = (userRecord: any): PermissionEditorState => {
    const roleProfile =
      roleProfiles.find((p) => p.role === (userRecord.role?.trim() || "viewer")) ??
      DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === (userRecord.role?.trim() || "viewer")) ??
      DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === "viewer")!;
    const modules = { ...roleProfile.modules };
    let hiddenFields = [...roleProfile.hiddenFields];
    let hiddenDashboardBlocks = [...roleProfile.hiddenDashboardBlocks];
    let taskCapabilities = { ...roleProfile.taskCapabilities };
    if (userRecord.useCustomPermissions && userRecord.permissionOverrides) {
      if (userRecord.permissionOverrides.modules) {
        Object.assign(modules, userRecord.permissionOverrides.modules);
      }
      if (userRecord.permissionOverrides.hiddenFields) {
        hiddenFields = userRecord.permissionOverrides.hiddenFields;
      }
      if (userRecord.permissionOverrides.hiddenDashboardBlocks) {
        hiddenDashboardBlocks = userRecord.permissionOverrides.hiddenDashboardBlocks;
      }
      if (userRecord.permissionOverrides.taskCapabilities) {
        taskCapabilities = normalizeTaskCapabilities(
          {
            ...taskCapabilities,
            ...userRecord.permissionOverrides.taskCapabilities,
          },
          modules
        );
      }
    }
    return { modules, hiddenFields, hiddenDashboardBlocks, taskCapabilities };
  };

  const sortedRoleProfiles = [...(roleProfiles.length > 0 ? roleProfiles : DEFAULT_ROLE_ACCESS_PROFILES)].sort(
    (a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return a.label.localeCompare(b.label, "ru");
    }
  );

  const getRoleDisplayLabel = (roleKey: string) =>
    resolveRoleProfileLabel(roleKey, sortedRoleProfiles);

  const isKnownRoleKey = (roleKey: string) =>
    sortedRoleProfiles.some((p) => p.role === (roleKey?.trim() || "viewer"));

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    }
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated()) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Обработчики для форм
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddUser = async () => {
    try {
      await createUserMutation.mutateAsync({
        name: formData.name,
        email: formData.email,
        role: formData.role,
        department: formData.department,
        subdivisionId: formData.subdivisionId ? Number(formData.subdivisionId) : null,
        extraSubdivisionIds: formData.extraSubdivisionIds,
        viewAllSubdivisions: formData.viewAllSubdivisions,
        position: formData.position,
        avatar: formData.avatar.trim() || null,
        password: formData.password
      });
      
      toast({
        title: "Пользователь добавлен",
        description: `${formData.name} успешно добавлен в систему`,
      });
      
      setAddDialogOpen(false);
      setFormData({
        id: 0,
        name: "",
        email: "",
        role: "viewer",
        department: "",
        subdivisionId: "",
        extraSubdivisionIds: [],
        viewAllSubdivisions: false,
        position: "",
        avatar: "",
        password: "",
        useCustomPermissions: false,
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось добавить пользователя",
        variant: "destructive"
      });
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;
    
    try {
      await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        userData: {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          department: formData.department,
          subdivisionId: formData.subdivisionId ? Number(formData.subdivisionId) : null,
          extraSubdivisionIds: formData.extraSubdivisionIds,
          viewAllSubdivisions: formData.viewAllSubdivisions,
          position: formData.position,
          ...(formData.avatar.trim() ? { avatar: formData.avatar.trim() } : {}),
          ...(formData.password && { password: formData.password })
        }
      });

      if (formData.useCustomPermissions) {
        await updatePermissionsMutation.mutateAsync({
          id: selectedUser.id,
          data: {
            useCustomPermissions: true,
            permissionOverrides: {
              modules: permissionState.modules,
              hiddenFields: permissionState.hiddenFields,
              hiddenDashboardBlocks: permissionState.hiddenDashboardBlocks,
              taskCapabilities: permissionState.taskCapabilities,
            },
          },
        });
      } else {
        await updatePermissionsMutation.mutateAsync({
          id: selectedUser.id,
          data: {
            useCustomPermissions: false,
            permissionOverrides: null,
          },
        });
      }

      await updateVacationPeriodsMutation.mutateAsync({
        id: selectedUser.id,
        periods: adminVacationPeriods,
      });
      
      toast({
        title: "Пользователь обновлен",
        description: `Данные ${formData.name} успешно обновлены`,
      });
      
      setEditDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить пользователя",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      await deleteUserMutation.mutateAsync(selectedUser.id);
      
      toast({
        title: "Пользователь удален",
        description: `${selectedUser?.name} удален из системы`,
      });
      
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить пользователя",
        variant: "destructive"
      });
    }
  };

  const handleViewUser = (user: any) => {
    setSelectedUser(user);
    setViewDialogOpen(true);
  };

  const handleEditDialogOpen = (userItem: any) => {
    setSelectedUser(userItem);
    setFormData({
      id: userItem.id,
      name: userItem.name,
      email: userItem.email,
      role: userItem.role?.trim() || "viewer",
      department: userItem.department || "",
      subdivisionId: userItem.subdivisionId ? String(userItem.subdivisionId) : "",
      extraSubdivisionIds: normalizeExtraSubdivisionIds(userItem.extraSubdivisionIds),
      viewAllSubdivisions: !!userItem.viewAllSubdivisions,
      position: userItem.position || "",
      avatar: "",
      password: "",
      useCustomPermissions: !!userItem.useCustomPermissions,
    });
    setAdminVacationPeriods(userItem.vacationPeriods ?? []);
    setPermissionState(buildPermissionStateForUser(userItem));
    setEditDialogOpen(true);
  };

  const handleRoleChange = (role: string) => {
    setFormData((prev) => ({ ...prev, role }));
    if (!formData.useCustomPermissions) {
      const profile =
        roleProfiles.find((p) => p.role === role) ??
        DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === role) ??
        DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === "viewer")!;
      setPermissionState({
        modules: { ...profile.modules },
        hiddenFields: [...profile.hiddenFields],
        hiddenDashboardBlocks: [...profile.hiddenDashboardBlocks],
        taskCapabilities: { ...profile.taskCapabilities },
      });
    }
  };

  const handleDeleteDialogOpen = (user: any) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "operator":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "engineer":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300";
      case "technician":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300";
      case "viewer":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      default:
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
    }
  };

  const getRoleDisplayName = (role: string) => getRoleDisplayLabel(role);

  const roleSelectOptions = (() => {
    const options = sortedRoleProfiles;
    const extra = formData.role?.trim();
    if (extra && !options.some((p) => p.role === extra)) {
      return [
        ...options,
        {
          role: extra,
          label: getRoleDisplayLabel(extra),
          isSystem: false,
          modules: DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === "viewer")!.modules,
          hiddenFields: [],
          hiddenDashboardBlocks: [],
          taskCapabilities: DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === "viewer")!
            .taskCapabilities,
        },
      ];
    }
    return options;
  })();

  // Проверка доступа для не-админов
  if (user.role !== 'admin') {
    return (
      <>
        <Helmet>
          <title>Управление пользователями | Система мониторинга</title>
        </Helmet>
        <main className="p-6">
          <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Доступ запрещен
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                У вас нет прав для просмотра этой страницы. Только администраторы могут управлять пользователями.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Управление пользователями | Система мониторинга</title>
      </Helmet>

      <main className="p-4 lg:p-6 min-w-0">
        <div className="w-full min-w-0 mx-auto">
              <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white shrink-0">Управление пользователями</h1>
                <div className="flex flex-wrap gap-2 lg:gap-3">
                  <Button 
                    onClick={() => refetch()} 
                    variant="outline"
                    disabled={usersLoading}
                    className="bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
                    Обновить
                  </Button>
                  <Button 
                    onClick={() => setAddDialogOpen(true)}
                    className="bg-primary-600 hover:bg-primary-700 text-white"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Добавить пользователя
                  </Button>
                  <SubdivisionsPanel />
                  <RoleProfilesPanel />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-gray-800">
                {usersLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                    <span className="ml-2 text-gray-600 dark:text-gray-400">Загрузка пользователей...</span>
                  </div>
                ) : usersError ? (
                  <div className="flex items-center justify-center p-8">
                    <span className="text-red-600 dark:text-red-400">Ошибка загрузки пользователей</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="min-w-[960px] w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                          Пользователь
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                          Роль
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                          Статус
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                          Отдел
                        </th>
                        <th className="sticky right-0 z-10 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300 bg-gray-50 dark:bg-gray-700 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                      {Array.isArray(usersList) && usersList.map((item: any) => (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 group">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center min-w-[180px]">
                              <UserAvatar
                                name={item.name}
                                avatarUrl={item.avatar}
                                className="h-10 w-10 shrink-0"
                              />
                              <div className="ml-3 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {item.name}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                  {item.position || "Сотрудник"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900 dark:text-white max-w-[200px]">
                            <span className="block truncate" title={item.email}>
                              {maskSensitiveValue(showUserEmails, item.email)}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <Badge className={getRoleBadgeColor(item.role)}>
                              {getRoleDisplayName(item.role)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {(() => {
                              const presence = getUserPresenceView(item);
                              return getPresenceBadges({
                                status: presence.status,
                                activityStatus: presence.activityStatus,
                                onVacation: presence.onVacation,
                              });
                            })()}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900 dark:text-white max-w-[140px]">
                            <span className="block truncate">
                              {subdivisionName(item.subdivisionId)}
                              {item.viewAllSubdivisions ? " · все цеха" : ""}
                            </span>
                          </td>
                          <td className="sticky right-0 z-10 px-4 py-4 whitespace-nowrap bg-white dark:bg-gray-800 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)] group-hover:bg-gray-50 dark:group-hover:bg-gray-700">
                            <div className="flex space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewUser(item)}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditDialogOpen(item)}
                                className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                              >
                                <FileEdit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteDialogOpen(item)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
        </div>
      </main>

      {/* Диалоги */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Добавить пользователя</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Имя</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="role" className="text-right pt-2">Роль</Label>
              <div className="col-span-3 space-y-1">
                <Select value={formData.role} onValueChange={handleRoleChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedRoleProfiles.map((profile) => (
                      <SelectItem key={profile.role} value={profile.role}>
                        {roleLabel(profile.role, profile.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Роли из «Настройки прав доступа»; созданные вручную сохраняются в базе.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">Подразделение</Label>
              <div className="col-span-3">
                <SubdivisionPicker
                  value={formData.subdivisionId}
                  onChange={(id) => setFormData((p) => ({ ...p, subdivisionId: id }))}
                  label=""
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="position" className="text-right">Должность</Label>
              <Input
                id="position"
                name="position"
                value={formData.position}
                onChange={handleInputChange}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="avatar" className="text-right">Аватар</Label>
              <Input
                id="avatar"
                name="avatar"
                value={formData.avatar}
                onChange={handleInputChange}
                className="col-span-3"
                placeholder="https://example.com/avatar.jpg"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleAddUser}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedUser(null);
            setFormData((prev) => ({ ...prev, avatar: "", password: "" }));
          }
        }}
      >
        <DialogContent
          key={selectedUser?.id ?? "edit-user"}
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Редактировать пользователя</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Основное</TabsTrigger>
              <TabsTrigger value="presence">Статус и отпуск</TabsTrigger>
              <TabsTrigger value="access">Права доступа</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-4 pt-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-right">Имя</Label>
                <Input
                  id="edit-name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-email" className="text-right">Email</Label>
                <Input
                  id="edit-email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-role" className="text-right">Роль</Label>
                <Select value={formData.role} onValueChange={handleRoleChange}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleSelectOptions.map((profile) => (
                      <SelectItem key={profile.role} value={profile.role}>
                        {roleLabel(profile.role, profile.label)}
                        {!isKnownRoleKey(profile.role) ? " (нет в справочнике)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">Подразделение</Label>
                <div className="col-span-3">
                  <SubdivisionPicker
                    value={formData.subdivisionId}
                    onChange={(id) => setFormData((p) => ({ ...p, subdivisionId: id }))}
                    label=""
                    required={formData.role !== "admin"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-position" className="text-right">Должность</Label>
                <Input
                  id="edit-position"
                  name="position"
                  value={formData.position}
                  onChange={handleInputChange}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-avatar" className="text-right pt-2">Аватар</Label>
                <div className="col-span-3 space-y-2">
                  <div className="flex items-center gap-3 rounded-md border p-2 bg-muted/30">
                    <UserAvatar
                      name={formData.name || selectedUser?.name || "?"}
                      avatarUrl={selectedUser?.avatar}
                      className="h-10 w-10"
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedUser?.avatar
                        ? "Сейчас задан пользовательский аватар"
                        : "Сейчас используются инициалы"}
                    </span>
                  </div>
                  <Input
                    id="edit-avatar"
                    name="editAvatarUrl"
                    value={formData.avatar}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, avatar: e.target.value }))
                    }
                    className="col-span-3"
                    autoComplete="off"
                    placeholder="Новая ссылка (оставьте пустым, чтобы не менять)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-password" className="text-right">Новый пароль</Label>
                <Input
                  id="edit-password"
                  name="editNewPassword"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="col-span-3"
                  autoComplete="new-password"
                  placeholder="Оставьте пустым, чтобы не менять"
                />
              </div>
            </TabsContent>
            <TabsContent value="presence" className="space-y-6 pt-4">
              {selectedUser && (
                <AdminUserStatusSelector
                  userId={selectedUser.id}
                  currentStatus={selectedUser.presenceStatus ?? DEFAULT_PRESENCE_STATUS}
                  activityStatus={getUserPresenceView(selectedUser).activityStatus}
                  onVacation={getUserPresenceView(selectedUser).onVacation}
                  onStatusChange={async (userId, status) => {
                    await updateUserStatus(userId, status);
                    await refetch();
                  }}
                />
              )}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-base">Периоды отпуска</Label>
                <VacationPeriodsEditor
                  periods={adminVacationPeriods}
                  onChange={setAdminVacationPeriods}
                />
              </div>
            </TabsContent>
            <TabsContent value="access" className="space-y-4 pt-4">
              <SubdivisionAccessEditor
                primarySubdivisionId={formData.subdivisionId}
                onPrimaryChange={(id) => setFormData((p) => ({ ...p, subdivisionId: id }))}
                extraSubdivisionIds={formData.extraSubdivisionIds}
                onExtraChange={(ids) => setFormData((p) => ({ ...p, extraSubdivisionIds: ids }))}
                viewAllSubdivisions={formData.viewAllSubdivisions}
                onViewAllChange={(v) => setFormData((p) => ({ ...p, viewAllSubdivisions: v }))}
                isAdminRole={formData.role === "admin"}
              />
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="custom-permissions"
                  checked={formData.useCustomPermissions}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setFormData((prev) => ({ ...prev, useCustomPermissions: enabled }));
                    if (!enabled && selectedUser) {
                      setPermissionState(buildPermissionStateForUser({
                        ...selectedUser,
                        role: formData.role,
                        useCustomPermissions: false,
                        permissionOverrides: null,
                      }));
                    }
                  }}
                />
                <div>
                  <Label htmlFor="custom-permissions" className="cursor-pointer font-medium">
                    Индивидуальные права (отличные от роли)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Если выключено — применяется профиль роли «{getRoleDisplayLabel(formData.role)}». Для новых сотрудников используйте роль «Наблюдатель» и включите индивидуальные права, чтобы разрешить создание задач и просмотр созданных ими.
                  </p>
                </div>
              </div>
              <PermissionEditor
                value={permissionState}
                onChange={setPermissionState}
                disabled={!formData.useCustomPermissions || formData.role === "admin"}
              />
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleEditUser}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удалить пользователя</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Вы уверены, что хотите удалить пользователя <strong>{selectedUser?.name}</strong>? 
              Это действие нельзя отменить.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог просмотра */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Информация о пользователе</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center space-x-4">
              <UserAvatar
                name={selectedUser?.name}
                avatarUrl={selectedUser?.avatar}
                className="h-16 w-16"
                fallbackClassName="text-lg"
              />
              <div>
                <h3 className="font-semibold text-lg">{selectedUser?.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedUser?.position || "Сотрудник"}</p>
                <div className="mt-2">
                  {(() => {
                    const presence = getUserPresenceView(selectedUser ?? {});
                    return getPresenceBadges({
                      status: presence.status,
                      activityStatus: presence.activityStatus,
                      onVacation: presence.onVacation,
                    });
                  })()}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-sm font-medium">Email:</Label>
                <p className="text-sm">{selectedUser?.email}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Роль:</Label>
                <Badge className={getRoleBadgeColor(selectedUser?.role || '')}>
                  {getRoleDisplayName(selectedUser?.role || '')}
                </Badge>
              </div>
              <div>
                <Label className="text-sm font-medium">Отдел:</Label>
                <p className="text-sm">{selectedUser?.department || "Не указан"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Автосброс статуса:</Label>
                <p className="text-sm">
                  {getUserPresenceView(selectedUser ?? {}).expiresAt
                    ? new Date(getUserPresenceView(selectedUser ?? {}).expiresAt!).toLocaleString("ru-RU")
                    : "—"}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Статус обновлён:</Label>
                <p className="text-sm">
                  {selectedUser?.presenceUpdatedAt
                    ? new Date(selectedUser.presenceUpdatedAt).toLocaleString("ru-RU")
                    : "—"}
                </p>
              </div>
              {selectedUser && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-2 block">Изменить статус</Label>
                  <AdminUserStatusSelector
                    userId={selectedUser.id}
                    currentStatus={selectedUser.presenceStatus ?? DEFAULT_PRESENCE_STATUS}
                    activityStatus={getUserPresenceView(selectedUser).activityStatus}
                    onVacation={getUserPresenceView(selectedUser).onVacation}
                    onStatusChange={async (userId, status) => {
                      await updateUserStatus(userId, status);
                      await refetch();
                    }}
                  />
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">Дата создания:</Label>
                <p className="text-sm">{selectedUser?.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString('ru-RU') : "Не указана"}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}