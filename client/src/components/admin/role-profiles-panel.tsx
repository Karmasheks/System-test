import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PermissionEditor, type PermissionEditorState } from "@/components/admin/permission-editor";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DEFAULT_ROLE_ACCESS_PROFILES,
  MODULE_DEFINITIONS,
  deriveTaskCapabilities,
  isSystemRole,
  roleLabel,
  type AppModule,
  type RoleAccessProfile,
  type AccessLevel,
} from "@shared/permissions-constants";
import {
  isSubdivisionAdminRole,
  parseSubdivisionAdminRoleKey,
} from "@shared/subdivision-admin-roles";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { Label } from "@/components/ui/label";
import { Plus, Settings2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

function toEditorState(profile: RoleAccessProfile): PermissionEditorState {
  return {
    modules: { ...profile.modules },
    hiddenFields: [...profile.hiddenFields],
    hiddenDashboardBlocks: [...profile.hiddenDashboardBlocks],
    taskCapabilities: { ...profile.taskCapabilities },
  };
}

function emptyEditorState(): PermissionEditorState {
  const modules = Object.fromEntries(
    MODULE_DEFINITIONS.map((m) => [m.key, "none" as AccessLevel])
  ) as Record<AppModule, AccessLevel>;
  return { modules, hiddenFields: [], hiddenDashboardBlocks: [], taskCapabilities: deriveTaskCapabilities(modules) };
}

function sortProfiles(profiles: RoleAccessProfile[]): RoleAccessProfile[] {
  return [...profiles].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return a.label.localeCompare(b.label, "ru");
  });
}

export function RoleProfilesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subdivisions = [] } = useSubdivisions();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("technician");
  const [editorState, setEditorState] = useState<PermissionEditorState>(emptyEditorState());
  const [roleLabelInput, setRoleLabelInput] = useState("");
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");

  const { data: profiles = [] } = useQuery<RoleAccessProfile[]>({
    queryKey: ["/api/permissions/roles"],
  });

  const sortedProfiles = sortProfiles(
    profiles.length > 0 ? profiles : DEFAULT_ROLE_ACCESS_PROFILES
  );
  const selectedProfile = sortedProfiles.find((p) => p.role === selectedRole);

  useEffect(() => {
    if (!open) return;
    const profile =
      sortedProfiles.find((p) => p.role === selectedRole) ??
      DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === selectedRole);
    if (profile) {
      setEditorState(toEditorState(profile));
      setRoleLabelInput(profile.label);
    }
  }, [open, selectedRole, sortedProfiles]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      role: string;
      label: string;
      state: PermissionEditorState;
    }) => {
      return apiRequest("PUT", `/api/permissions/roles/${payload.role}`, {
        label: payload.label,
        modules: payload.state.modules,
        hiddenFields: payload.state.hiddenFields,
        hiddenDashboardBlocks: payload.state.hiddenDashboardBlocks,
        taskCapabilities: payload.state.taskCapabilities,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permissions/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/permissions/meta"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Профиль роли сохранён" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { role: string; label: string }) => {
      return apiRequest("POST", "/api/permissions/roles", payload);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/permissions/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/permissions/meta"] });
      setSelectedRole(variables.role);
      setCreateOpen(false);
      setNewRoleKey("");
      setNewRoleLabel("");
      setOpen(true);
      toast({
        title: "Роль создана",
        description: "Настройте права и нажмите «Сохранить профиль»",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (role: string) => {
      return apiRequest("DELETE", `/api/permissions/roles/${role}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permissions/roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/permissions/meta"] });
      setSelectedRole("viewer");
      setDeleteOpen(false);
      toast({ title: "Роль удалена" });
    },
  });

  const loadProfileState = (role: string) => {
    const profile =
      sortedProfiles.find((p) => p.role === role) ??
      DEFAULT_ROLE_ACCESS_PROFILES.find((p) => p.role === role);
    if (profile) {
      setEditorState(toEditorState(profile));
      setRoleLabelInput(profile.label);
    } else {
      setEditorState(emptyEditorState());
      setRoleLabelInput("");
    }
  };

  const openDialog = () => {
    loadProfileState(selectedRole);
    setOpen(true);
  };

  const onRoleChange = (role: string) => {
    setSelectedRole(role);
    loadProfileState(role);
  };

  const handleSave = async () => {
    if (!roleLabelInput.trim()) {
      toast({ title: "Укажите название роли", variant: "destructive" });
      return;
    }
    try {
      await saveMutation.mutateAsync({
        role: selectedRole,
        label: roleLabelInput.trim(),
        state: editorState,
      });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить профиль",
        variant: "destructive",
      });
    }
  };

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        role: newRoleKey.trim(),
        label: newRoleLabel.trim(),
      });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось создать роль",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(selectedRole);
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось удалить роль",
        variant: "destructive",
      });
    }
  };

  const isSubdivisionAdminProfile = isSubdivisionAdminRole(selectedRole);
  const linkedSubdivisionId = parseSubdivisionAdminRoleKey(selectedRole);
  const linkedSubdivisionName =
    linkedSubdivisionId != null
      ? subdivisions.find((s) => s.id === linkedSubdivisionId)?.name ?? `#${linkedSubdivisionId}`
      : null;
  const canDelete =
    selectedProfile &&
    !selectedProfile.isSystem &&
    selectedRole !== "admin" &&
    !isSubdivisionAdminProfile;

  return (
    <>
      <Button variant="outline" onClick={openDialog}>
        <Settings2 className="w-4 h-4 mr-2" />
        Настройки ролей
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Права доступа по ролям</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Профили сохраняются в базе и используются при назначении роли новым сотрудникам.
            Создайте роль здесь — она появится в списке при добавлении пользователя.
          </p>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3 bg-muted/30">
            <div className="space-y-2 flex-1 min-w-[180px]">
              <Label>Роль</Label>
              <Select value={selectedRole} onValueChange={onRoleChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Общие роли</SelectLabel>
                    {sortedProfiles
                      .filter((profile) => !isSubdivisionAdminRole(profile.role))
                      .map((profile) => (
                        <SelectItem key={profile.role} value={profile.role}>
                          {roleLabel(profile.role, profile.label)}
                          {profile.isSystem ? " (системная)" : " (своя)"}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                  {sortedProfiles.some((p) => isSubdivisionAdminRole(p.role)) && (
                    <SelectGroup>
                      <SelectLabel>Администраторы подразделений</SelectLabel>
                      {sortedProfiles
                        .filter((profile) => isSubdivisionAdminRole(profile.role))
                        .map((profile) => (
                          <SelectItem key={profile.role} value={profile.role}>
                            {roleLabel(profile.role, profile.label)}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1 min-w-[180px]">
              <Label>Отображаемое название</Label>
              <Input
                value={roleLabelInput}
                onChange={(e) => setRoleLabelInput(e.target.value)}
                disabled={selectedRole === "admin" || isSubdivisionAdminProfile}
                placeholder="Название в интерфейсе"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Новая роль
            </Button>
            {canDelete && (
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-4 h-4 mr-1" />
                Удалить
              </Button>
            )}
          </div>

          {selectedProfile && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Ключ: {selectedRole}</Badge>
              {selectedProfile.isSystem ? (
                <Badge variant="outline">Системная</Badge>
              ) : (
                <Badge variant="outline">Пользовательская</Badge>
              )}
            </div>
          )}

          {selectedRole === "admin" ? (
            <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md space-y-1">
              <p className="font-medium">Администратор системы</p>
              <p>
                Полный доступ ко всем разделам и подразделениям. Профиль нельзя изменить — это роль
                владельца системы. Для делегирования прав используйте шаблон «Администратор подразделения»
                и назначьте сотруднику управляемые подразделения в карточке пользователя.
              </p>
            </div>
          ) : isSubdivisionAdminProfile ? (
            <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md space-y-1">
              <p className="font-medium">Администратор подразделения: {linkedSubdivisionName}</p>
              <p>
                Роль создаётся автоматически при добавлении подразделения. Права ниже применяются ко
                всем сотрудникам с этой ролью. Чтобы администрировать несколько подразделений, назначьте
                дополнительные в карточке пользователя (вкладка «Права доступа»).
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rounded-md border p-3 bg-muted/20">
              Настройте права роли или примените шаблон. Для точечных исключений включите
              «Индивидуальные права» в карточке сотрудника.
            </p>
          )}
          {selectedRole !== "admin" && (
            <PermissionEditor value={editorState} onChange={setEditorState} />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Закрыть
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending || selectedRole === "admin"}>
              Сохранить профиль
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новая роль</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-key">Ключ (латиница, для системы)</Label>
              <Input
                id="role-key"
                placeholder="shift_supervisor"
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                Только a–z, цифры и _. Нельзя изменить после создания.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-label">Название для пользователей</Label>
              <Input
                id="role-label"
                placeholder="Сменный мастер"
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground rounded-md border p-2 bg-muted/40">
              После создания откроется редактор прав. Начальные права — как у «Наблюдатель»;
              настройте и сохраните профиль, затем назначайте роль сотрудникам.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newRoleKey.trim() || !newRoleLabel.trim()}
            >
              Создать и настроить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить роль?</AlertDialogTitle>
            <AlertDialogDescription>
              Роль «{roleLabel(selectedRole, selectedProfile?.label)}» будет удалена. Это возможно
              только если ни одному пользователю не назначена эта роль.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
