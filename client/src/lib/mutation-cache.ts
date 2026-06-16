import type { QueryClient } from "@tanstack/react-query";
import type { Task, TaskComment, EquipmentComment } from "@shared/schema";

/** Сразу показать новую/обновлённую задачу во всех списках. */
export function upsertTaskInListCaches(queryClient: QueryClient, task: Task) {
  queryClient.setQueriesData<Task[]>({ queryKey: ["/api/tasks"] }, (old) => {
    if (!old) return [task];
    const idx = old.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      const next = [...old];
      next[idx] = { ...next[idx], ...task };
      return next;
    }
    return [task, ...old];
  });
}

export async function invalidateTaskDomain(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"], refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"], refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"], refetchType: "active" }),
  ]);
}

export function appendTaskComment(
  queryClient: QueryClient,
  taskId: number,
  comment: TaskComment
) {
  queryClient.setQueryData<TaskComment[]>(
    ["/api/tasks", taskId, "comments"],
    (old) => [...(old ?? []), comment]
  );
}

export function appendEquipmentComment(
  queryClient: QueryClient,
  equipmentId: string,
  comment: EquipmentComment
) {
  queryClient.setQueryData<EquipmentComment[]>(
    ["/api/equipment", equipmentId, "comments"],
    (old) => [...(old ?? []), comment]
  );
}

export function appendServiceRequestComment(
  queryClient: QueryClient,
  requestId: number,
  comment: Record<string, unknown>
) {
  queryClient.setQueryData(
    ["/api/service-requests", requestId],
    (old: { comments?: unknown[] } | undefined) => {
      if (!old) return old;
      return { ...old, comments: [...(old.comments ?? []), comment] };
    }
  );
}
