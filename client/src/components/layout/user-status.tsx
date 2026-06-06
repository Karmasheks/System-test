import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { User, Clock, Coffee, Plane, UserX, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { PRESENCE_STATUS_TTL_MS } from "@shared/user-presence-constants";
export interface UserStatus {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const userStatuses: UserStatus[] = [
  {
    id: "online",
    name: "Онлайн",
    icon: <Wifi className="w-3 h-3" />,
    color: "text-green-700 dark:text-green-300",
    bgColor: "bg-green-100 dark:bg-green-950"
  },
  {
    id: "working",
    name: "На работе",
    icon: <User className="w-3 h-3" />,
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-100 dark:bg-blue-950"
  },
  {
    id: "break",
    name: "На перерыве",
    icon: <Coffee className="w-3 h-3" />,
    color: "text-yellow-700 dark:text-yellow-300",
    bgColor: "bg-yellow-100 dark:bg-yellow-950"
  },
  {
    id: "vacation",
    name: "В отпуске",
    icon: <Plane className="w-3 h-3" />,
    color: "text-purple-700 dark:text-purple-300",
    bgColor: "bg-purple-100 dark:bg-purple-950"
  },
  {
    id: "absent",
    name: "Отсутствует",
    icon: <UserX className="w-3 h-3" />,
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-100 dark:bg-red-950"
  },
  {
    id: "busy",
    name: "Занят",
    icon: <Clock className="w-3 h-3" />,
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-100 dark:bg-orange-950"
  }
];

interface UserStatusSelectorProps {
  currentStatus: string;
  activityStatus?: string;
  onVacation?: boolean;
  expiresAt?: string | null;
  onStatusChange: (statusId: string) => void;
  userName: string;
  avatarUrl?: string | null;
}

interface AdminUserStatusSelectorProps {
  userId: number;
  currentStatus: string;
  activityStatus?: string;
  onVacation?: boolean;
  onStatusChange: (userId: number, status: string) => Promise<void>;
  disabled?: boolean;
}

export function getStatusDotColor(statusId: string): string {
  switch (statusId) {
    case "working":
      return "bg-blue-500";
    case "online":
      return "bg-green-500";
    case "break":
      return "bg-yellow-500";
    case "vacation":
      return "bg-purple-500";
    case "busy":
      return "bg-orange-500";
    case "absent":
      return "bg-red-500";
    default:
      return "bg-green-500";
  }
}

function formatExpiryHint(statusId: string, expiresAt?: string | null): string | null {
  const ttl = PRESENCE_STATUS_TTL_MS[statusId as keyof typeof PRESENCE_STATUS_TTL_MS];
  if (ttl == null) return null;
  if (expiresAt) {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    if (remainingMs <= 0) return "Статус скоро будет сброшен автоматически";
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `Автосброс через ${hours} ч ${minutes} мин`;
    return `Автосброс через ${minutes} мин`;
  }
  const hours = Math.floor(ttl / (60 * 60 * 1000));
  const minutes = Math.floor((ttl % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `Статус сбросится автоматически через ${hours} ч`;
  return `Статус сбросится автоматически через ${minutes} мин`;
}

export function getPresenceBadges(
  options: {
    status?: string;
    activityStatus?: string;
    onVacation?: boolean;
    darkMode?: boolean;
  }
) {
  const activity = options.activityStatus ?? options.status ?? "absent";
  const onVacation = options.onVacation ?? false;
  const darkMode = options.darkMode ?? false;

  if (onVacation && activity !== "absent" && activity !== "vacation") {
    return (
      <div className="flex flex-wrap gap-1">
        {getStatusBadge("vacation", darkMode)}
        {getStatusBadge(activity, darkMode)}
      </div>
    );
  }

  if (onVacation || activity === "vacation" || options.status === "vacation") {
    return getStatusBadge("vacation", darkMode);
  }

  return getStatusBadge(activity, darkMode);
}

export function UserStatusSelector({
  currentStatus,
  activityStatus,
  onVacation = false,
  expiresAt,
  onStatusChange,
  userName,
  avatarUrl,
}: UserStatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const handleStatusChange = (statusId: string) => {
    onStatusChange(statusId);
    setIsOpen(false);
    
    const status = userStatuses.find(s => s.id === statusId);
    toast({
      title: "Статус обновлен",
      description: `Ваш статус изменен на "${status?.name}"`,
    });
  };

  const selectedActivity = activityStatus ?? currentStatus;
  const dotStatus =
    onVacation && (selectedActivity === "absent" || selectedActivity === "vacation")
      ? "vacation"
      : selectedActivity;
  const expiryHint = formatExpiryHint(selectedActivity, expiresAt);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start p-2 h-auto hover:bg-gray-800 text-gray-100">
          <div className="flex items-center space-x-2 w-full">
            <div className="relative shrink-0">
              <UserAvatar
                name={userName}
                avatarUrl={avatarUrl}
                className="h-8 w-8"
                fallbackClassName="text-xs bg-gray-700 text-white"
              />
              <div
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900",
                  getStatusDotColor(dotStatus)
                )}
              />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-medium text-white truncate">{userName}</div>
              <div className="mt-0.5">
                {getPresenceBadges({
                  status: currentStatus,
                  activityStatus: selectedActivity,
                  onVacation,
                  darkMode: true,
                })}
              </div>
              {expiryHint && (
                <p className="text-[10px] text-gray-400 mt-1 truncate" title={expiryHint}>
                  {expiryHint}
                </p>
              )}
            </div>
          </div>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Изменить статус</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {onVacation && (
            <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-purple-50 dark:bg-purple-950/30">
              У вас запланирован отпуск. Вы можете указать текущую активность (на работе, онлайн и т.д.) — статус «В отпуске» сохранится автоматически.
            </p>
          )}
          <div className="space-y-2">
            {userStatuses.map((status) => (
              <Button
                key={status.id}
                variant={selectedActivity === status.id || (status.id === "vacation" && onVacation && selectedActivity === "absent") ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => handleStatusChange(status.id)}
              >
                <div className="flex items-center space-x-3">
                  <span className={status.color}>{status.icon}</span>
                  <span>{status.name}</span>
                </div>
              </Button>
            ))}
          </div>
          {expiryHint && (
            <p className="text-xs text-muted-foreground">{expiryHint}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminUserStatusSelector({
  userId,
  currentStatus,
  activityStatus,
  onVacation = false,
  onStatusChange,
  disabled = false,
}: AdminUserStatusSelectorProps) {
  const [value, setValue] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setValue(currentStatus);
  }, [currentStatus, userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onStatusChange(userId, value);
      toast({
        title: "Статус обновлён",
        description: "Статус сотрудника изменён администратором",
      });
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось изменить статус",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>{getPresenceBadges({ status: currentStatus, activityStatus, onVacation })}</div>
      <div className="flex gap-2">
        <Select value={value} onValueChange={setValue} disabled={disabled || saving}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Выберите статус" />
          </SelectTrigger>
          <SelectContent>
            {userStatuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                {status.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSave} disabled={disabled || saving || value === currentStatus}>
          {saving ? "..." : "Сохранить"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Администратор может исправить статус, если сотрудник забыл его сменить. Для «На работе», «Онлайн» и других активных статусов действует автоматический сброс по таймеру.
      </p>
    </div>
  );
}

export function getStatusBadge(statusId: string, darkMode: boolean = false) {
  const status = userStatuses.find(s => s.id === statusId) || userStatuses[0];
  
  if (darkMode) {
    // Цвета для темного фона боковой панели
    const darkColors = {
      'online': 'bg-green-500/20 text-green-300',
      'working': 'bg-blue-500/20 text-blue-300',
      'break': 'bg-yellow-500/20 text-yellow-300',
      'vacation': 'bg-purple-500/20 text-purple-300',
      'absent': 'bg-red-500/20 text-red-300',
      'busy': 'bg-orange-500/20 text-orange-300'
    };
    
    const colorClass = darkColors[status.id as keyof typeof darkColors] || darkColors.online;
    
    return (
      <Badge className={`${colorClass} border-0 text-xs`}>
        {status.icon}
        <span className="ml-1">{status.name}</span>
      </Badge>
    );
  }
  
  return (
    <Badge className={`${status.bgColor} ${status.color} border-0`}>
      {status.icon}
      <span className="ml-1">{status.name}</span>
    </Badge>
  );
}

export { userStatuses };