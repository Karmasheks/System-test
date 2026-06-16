import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TaskLink } from "@shared/schema";

export function useTaskLinks(taskId: number | null | undefined) {
  return useQuery<TaskLink[]>({
    queryKey: ["/api/tasks", taskId, "links"],
    enabled: taskId != null,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${taskId}/links`);
      return res.json();
    },
  });
}

export function useTaskLinkMutations(taskId: number | null | undefined) {
  const qc = useQueryClient();

  const invalidate = () => {
    if (taskId != null) {
      qc.invalidateQueries({ queryKey: ["/api/tasks", taskId, "links"] });
    }
  };

  const addLink = useMutation({
    mutationFn: async (body: { title: string; description?: string; url: string }) => {
      if (taskId == null) throw new Error("Задача не выбрана");
      const res = await apiRequest("POST", `/api/tasks/${taskId}/links`, body);
      return res.json();
    },
    onSuccess: invalidate,
  });

  const removeLink = useMutation({
    mutationFn: async (linkId: number) => {
      if (taskId == null) throw new Error("Задача не выбрана");
      await apiRequest("DELETE", `/api/tasks/${taskId}/links/${linkId}`);
    },
    onSuccess: invalidate,
  });

  return { addLink, removeLink };
}
