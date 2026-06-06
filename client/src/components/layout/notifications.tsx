import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Bell, Calendar, Wrench, AlertTriangle, FileText, CheckSquare, ClipboardList, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useRemarksData } from '@/hooks/use-remarks-data';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task } from '@/types/api';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import {
  useNotifications,
  useMarkNotificationRead,
  useDismissNotification,
  useDismissAllNotifications,
} from '@/hooks/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { useEquipmentApi } from '@/hooks/use-equipment-api';
import { toast } from '@/hooks/use-toast';
import type { Notification as DbNotification } from '@shared/schema';

interface Notification {
  id: string;
  type: 'maintenance' | 'remark' | 'task' | 'warning' | 'info' | 'service_request' | 'warehouse' | 'task_comment';
  title: string;
  description: string;
  link?: string;
  equipmentId?: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  dbId?: number;
  isUnread?: boolean;
  isLocal?: boolean;
  repeatableDismiss?: boolean;
}

const DISMISSED_KEY = 'dismissed-local-notifications';
const REPEAT_AFTER_MS = 4 * 60 * 60 * 1000;

type DismissedEntry = { id: string; at: number; repeat?: boolean };

function loadDismissed(): DismissedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveDismissed(entries: DismissedEntry[]) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(entries));
}

function isEntryActive(entry: DismissedEntry): boolean {
  if (!entry.repeat) return true;
  return Date.now() - entry.at < REPEAT_AFTER_MS;
}

function isLocallyDismissed(id: string, hiddenIds: Set<string>): boolean {
  if (hiddenIds.has(id)) return true;
  const entry = loadDismissed().find((e) => e.id === id);
  if (!entry) return false;
  if (entry.repeat && Date.now() - entry.at >= REPEAT_AFTER_MS) return false;
  return true;
}

function dismissLocalNotification(id: string, repeatable: boolean) {
  const list = loadDismissed().filter((e) => e.id !== id);
  list.push({ id, at: Date.now(), repeat: repeatable });
  saveDismissed(list);
}

function dismissAllLocalNotifications(ids: string[]) {
  const existing = loadDismissed().filter((e) => isEntryActive(e));
  const now = Date.now();
  const mergedMap = new Map(existing.map((e) => [e.id, e]));
  for (const id of ids) {
    mergedMap.set(id, {
      id,
      at: now,
      repeat:
        id.startsWith('maintenance-task-') || id.startsWith('maintenance-overdue-task-'),
    });
  }
  saveDismissed([...mergedMap.values()]);
}

function parseTaskCommentMessage(message: string) {
  try {
    const parsed = JSON.parse(message) as { commentId?: number; text?: string };
    if (parsed?.text) {
      return { commentId: parsed.commentId, text: parsed.text };
    }
  } catch {
    // plain text
  }
  return { text: message };
}

function resolveDbNotificationLink(n: DbNotification): string {
  if (n.taskId) {
    if (n.type === 'task_comment') {
      const parsed = parseTaskCommentMessage(n.message || '');
      const commentQuery = parsed.commentId ? `&comment=${parsed.commentId}` : '';
      return `/tasks?task=${n.taskId}${commentQuery}`;
    }
    return `/tasks?task=${n.taskId}`;
  }
  if (n.serviceRequestId) {
    return `/service-requests/${n.serviceRequestId}`;
  }
  if (n.warehousePartId) {
    return '/warehouse';
  }
  return '/tasks';
}

function mapDbNotificationType(type: string): Notification['type'] {
  if (type === 'task_comment') return 'task_comment';
  if (type.startsWith('task_')) return 'task';
  if (type.startsWith('warehouse_')) return 'warehouse';
  if (type.startsWith('service_request')) return 'service_request';
  return 'info';
}

function getDbDescription(n: DbNotification): string {
  if (n.type === 'task_comment') {
    return parseTaskCommentMessage(n.message || '').text;
  }
  return n.message || '';
}

export function NotificationsDropdown() {
  const { user } = useAuth();
  const { equipment } = useEquipmentApi();
  const { remarks } = useRemarksData();
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
    enabled: !!user,
  });
  const { data: dbNotifications = [] } = useNotifications(!!user);
  const markRead = useMarkNotificationRead();
  const dismissDb = useDismissNotification();
  const dismissAllDb = useDismissAllNotifications();
  const queryClient = useQueryClient();
  const [hiddenLocalIds, setHiddenLocalIds] = useState<Set<string>>(() => {
    const active = loadDismissed().filter(isEntryActive);
    return new Set(active.map((e) => e.id));
  });
  const seenDbIdsRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!user) return;

    const syncReminders = async () => {
      try {
        const res = await apiRequest('GET', '/api/notifications?sync=1');
        const list = await res.json();
        queryClient.setQueryData(['/api/notifications'], list);
      } catch {
        // ignore background sync errors
      }
    };

    syncReminders();
    const timer = window.setInterval(syncReminders, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [user, queryClient]);

  useEffect(() => {
    const handleDataChange = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    };

    window.addEventListener('remarksUpdated', handleDataChange);
    window.addEventListener('remarkStatusChanged', handleDataChange);
    window.addEventListener('taskCommentAdded', handleDataChange);
    window.addEventListener('taskUpdated', handleDataChange);

    return () => {
      window.removeEventListener('remarksUpdated', handleDataChange);
      window.removeEventListener('remarkStatusChanged', handleDataChange);
      window.removeEventListener('taskCommentAdded', handleDataChange);
      window.removeEventListener('taskUpdated', handleDataChange);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!user) return;

    if (seenDbIdsRef.current === null) {
      seenDbIdsRef.current = new Set(dbNotifications.map((n) => n.id));
      return;
    }

    const fresh = dbNotifications.filter(
      (n) => !seenDbIdsRef.current!.has(n.id) && !n.isRead
    );

    for (const n of fresh) {
      seenDbIdsRef.current!.add(n.id);
      toast({
        title: n.title || 'Новое уведомление',
        description: getDbDescription(n),
        duration: 5000,
      });
    }

    for (const n of dbNotifications) {
      seenDbIdsRef.current!.add(n.id);
    }
  }, [dbNotifications, user]);

  const generateLocalNotifications = useCallback((): Notification[] => {
    const notifications: Notification[] = [];
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    tasks
      .filter(
        (task) =>
          task.taskType === 'maintenance' &&
          task.dueDate &&
          task.status !== 'completed' &&
          task.status !== 'cancelled'
      )
      .forEach((task) => {
        const scheduledDate = new Date(task.dueDate!);
        const daysUntil = Math.ceil(
          (scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const equipmentItem = equipment.find((eq) => eq.id === task.equipmentId);
        const equipmentName =
          equipmentItem?.name ?? task.equipmentId ?? 'Оборудование';
        const typeLabel = task.maintenanceType || 'ТО';

        if (scheduledDate <= nextWeek && scheduledDate >= today) {
          const id = `maintenance-task-${task.id}`;
          if (isLocallyDismissed(id, hiddenLocalIds)) return;
          notifications.push({
            id,
            type: 'maintenance',
            title: 'Требуется ТО',
            description: `${equipmentName} - ${typeLabel} через ${daysUntil} дн.`,
            link: `/tasks?task=${task.id}`,
            equipmentId: task.equipmentId ?? undefined,
            priority: daysUntil <= 3 ? 'high' : 'medium',
            createdAt: today,
            isLocal: true,
            repeatableDismiss: true,
          });
        } else if (scheduledDate < today) {
          const id = `maintenance-overdue-task-${task.id}`;
          if (isLocallyDismissed(id, hiddenLocalIds)) return;
          notifications.push({
            id,
            type: 'warning',
            title: 'Просрочено ТО',
            description: `${equipmentName} - ${typeLabel} просрочено на ${Math.abs(daysUntil)} дн.`,
            link: `/tasks?task=${task.id}`,
            equipmentId: task.equipmentId ?? undefined,
            priority: 'high',
            createdAt: today,
            isLocal: true,
            repeatableDismiss: true,
          });
        }
      });

    remarks.forEach((remark) => {
      if (remark.status === 'open' || remark.status === 'in_progress') {
        const id = `remark-${remark.id}`;
        if (isLocallyDismissed(id, hiddenLocalIds)) return;

        const priority =
          remark.priority === 'critical' ? 'high' : remark.priority === 'high' ? 'medium' : 'low';

        const linkedTaskId = (remark as { linkedTaskId?: number }).linkedTaskId;
        notifications.push({
          id,
          type: 'remark',
          title: remark.status === 'in_progress' ? 'Замечание в работе' : 'Открытое замечание',
          description: `${remark.equipmentName} - ${(remark.description ?? '').substring(0, 50)}${(remark.description?.length ?? 0) > 50 ? '...' : ''}`,
          link: linkedTaskId ? `/tasks?task=${linkedTaskId}` : '/tasks',
          equipmentId: remark.equipmentId,
          priority,
          createdAt: new Date(remark.createdAt),
          isLocal: true,
        });
      }
    });

    equipment.forEach((item) => {
      if (item.status === 'maintenance') {
        const id = `equipment-maintenance-${item.id}`;
        if (isLocallyDismissed(id, hiddenLocalIds)) return;
        notifications.push({
          id,
          type: 'warning',
          title: 'Оборудование на ТО',
          description: `${item.name} - находится на техобслуживании`,
          link: '/equipment',
          equipmentId: item.id,
          priority: 'medium',
          createdAt: today,
          isLocal: true,
        });
      } else if (item.status === 'inactive') {
        const id = `equipment-inactive-${item.id}`;
        if (isLocallyDismissed(id, hiddenLocalIds)) return;
        notifications.push({
          id,
          type: 'warning',
          title: 'Оборудование не активно',
          description: `${item.name} - требует проверки`,
          link: '/equipment',
          equipmentId: item.id,
          priority: 'high',
          createdAt: today,
          isLocal: true,
        });
      }
    });

    return notifications;
  }, [equipment, remarks, tasks, hiddenLocalIds]);

  const dbMapped: Notification[] = useMemo(
    () =>
      dbNotifications.map((n) => ({
        id: `db-${n.id}`,
        dbId: n.id,
        isUnread: !n.isRead,
        type: mapDbNotificationType(n.type),
        title: n.title || 'Уведомление',
        description: getDbDescription(n),
        link: resolveDbNotificationLink(n),
        equipmentId: n.equipmentId ?? undefined,
        priority:
          n.priority === 'high' || n.priority === 'urgent'
            ? 'high'
            : n.priority === 'low'
              ? 'low'
              : 'medium',
        createdAt: new Date(n.createdAt),
      })),
    [dbNotifications]
  );

  const notifications = useMemo(() => {
    const merged = [...dbMapped, ...generateLocalNotifications()];
    return merged.sort((a, b) => {
      if (a.isUnread && !b.isUnread) return -1;
      if (!a.isUnread && b.isUnread) return 1;
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [dbMapped, generateLocalNotifications]);

  const unreadCount = notifications.filter((n) => n.isUnread).length;
  const highPriorityCount = notifications.filter((n) => n.priority === 'high').length;

  const hideLocal = useCallback((id: string, repeatable: boolean) => {
    dismissLocalNotification(id, repeatable);
    setHiddenLocalIds((prev) => new Set(prev).add(id));
  }, []);

  const handleDismiss = (e: React.MouseEvent, notification: Notification) => {
    e.preventDefault();
    e.stopPropagation();

    if (notification.dbId) {
      dismissDb.mutate(notification.dbId);
      return;
    }

    hideLocal(notification.id, notification.repeatableDismiss ?? false);
  };

  const handleDismissAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const localItems = notifications.filter((n) => n.isLocal);
    if (localItems.length > 0) {
      dismissAllLocalNotifications(localItems.map((n) => n.id));
      setHiddenLocalIds((prev) => {
        const next = new Set(prev);
        for (const item of localItems) next.add(item.id);
        return next;
      });
    }

    dismissAllDb.mutate();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'maintenance':
        return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'remark':
        return <FileText className="w-4 h-4 text-yellow-500" />;
      case 'task':
      case 'task_comment':
        return <CheckSquare className="w-4 h-4 text-green-500" />;
      case 'service_request':
        return <ClipboardList className="w-4 h-4 text-indigo-500" />;
      case 'warehouse':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Wrench className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-700 dark:text-red-300';
      case 'medium':
        return 'text-amber-700 dark:text-amber-300';
      default:
        return 'text-foreground';
    }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-gray-200 hover:text-white hover:bg-gray-800">
          <Bell className="h-5 w-5" />
          {notifications.length > 0 && (
            <Badge
              variant={highPriorityCount > 0 ? 'destructive' : 'secondary'}
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 0
                ? unreadCount > 99
                  ? '99+'
                  : unreadCount
                : notifications.length > 99
                  ? '99+'
                  : notifications.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-96 overflow-y-auto bg-popover text-popover-foreground"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Уведомления</span>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && <Badge variant="outline">{notifications.length}</Badge>}
            {notifications.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleDismissAll}
                disabled={dismissAllDb.isPending}
              >
                Очистить все
              </Button>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Нет уведомлений</p>
          </div>
        ) : (
          <div className="py-1">
            {notifications.map((notification) => (
              <div key={notification.id} className="relative w-full border-b border-border/40 last:border-0">
                <Link
                  href={notification.link || '#'}
                  className={`w-full p-3 pr-9 flex items-start gap-3 hover:bg-accent cursor-pointer block ${notification.isUnread ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}
                  onClick={() => {
                    if (notification.dbId && notification.isUnread) {
                      markRead.mutate(notification.dbId);
                    }
                  }}
                >
                  <div className="flex-shrink-0 mt-1">{getNotificationIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-sm font-medium ${getPriorityColor(notification.priority)}`}>
                        {notification.title}
                      </p>
                      <Badge
                        variant={
                          notification.priority === 'high'
                            ? 'destructive'
                            : notification.priority === 'medium'
                              ? 'default'
                              : 'secondary'
                        }
                        className="ml-1 text-xs shrink-0"
                      >
                        {notification.priority === 'high'
                          ? 'Срочно'
                          : notification.priority === 'medium'
                            ? 'Важно'
                            : 'Обычное'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{notification.description}</p>
                    {notification.equipmentId && (
                      <p className="text-xs text-muted-foreground/80 mt-1">ID: {notification.equipmentId}</p>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  className="absolute top-2 right-2 p-1 rounded hover:bg-muted text-muted-foreground z-10"
                  title="Убрать уведомление"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => handleDismiss(e, notification)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
