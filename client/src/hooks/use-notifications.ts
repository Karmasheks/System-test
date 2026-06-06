import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

const NOTIFICATIONS_KEY = ["/api/notifications"] as const;

export function useNotifications(enabled = true) {
  return useQuery<Notification[]>({
    queryKey: [...NOTIFICATIONS_KEY],
    enabled,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications?sync=0");
      return res.json();
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/notifications/${id}/read`);
      return res.json();
    },
    onSuccess: (updated: Notification) => {
      qc.setQueryData<Notification[]>([...NOTIFICATIONS_KEY], (current) =>
        current?.map((n) => (n.id === updated.id ? { ...n, isRead: true } : n)) ?? []
      );
    },
  });
}

async function archiveNotificationRequest(id: number): Promise<Notification> {
  const res = await apiRequest("PATCH", `/api/notifications/${id}/read?archive=1`);
  return res.json();
}

async function archiveAllNotificationsRequest(): Promise<{ dismissed: number }> {
  try {
    const res = await apiRequest("POST", "/api/notifications/dismiss-all");
    return res.json();
  } catch {
    const res = await apiRequest("GET", "/api/notifications?sync=0");
    const list = (await res.json()) as Notification[];
    if (list.length === 0) return { dismissed: 0 };
    await Promise.all(list.map((n) => archiveNotificationRequest(n.id)));
    return { dismissed: list.length };
  }
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: archiveNotificationRequest,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: [...NOTIFICATIONS_KEY] });
      const previous = qc.getQueryData<Notification[]>([...NOTIFICATIONS_KEY]);
      qc.setQueryData<Notification[]>(
        [...NOTIFICATIONS_KEY],
        (current) => current?.filter((n) => n.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData([...NOTIFICATIONS_KEY], context.previous);
      }
    },
    onSuccess: (archived: Notification) => {
      qc.setQueryData<Notification[]>([...NOTIFICATIONS_KEY], (current) =>
        current?.filter((n) => n.id !== archived.id) ?? []
      );
    },
  });
}

export function useDismissAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: archiveAllNotificationsRequest,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: [...NOTIFICATIONS_KEY] });
      const previous = qc.getQueryData<Notification[]>([...NOTIFICATIONS_KEY]);
      qc.setQueryData<Notification[]>([...NOTIFICATIONS_KEY], []);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData([...NOTIFICATIONS_KEY], context.previous);
      }
    },
    onSuccess: () => {
      qc.setQueryData<Notification[]>([...NOTIFICATIONS_KEY], []);
    },
  });
}
