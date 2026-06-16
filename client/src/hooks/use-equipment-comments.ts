import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { appendEquipmentComment } from "@/lib/mutation-cache";
import type { EquipmentComment } from "@shared/schema";

function commentsKey(equipmentId: string | null) {
  return ["/api/equipment", equipmentId, "comments"] as const;
}

export function useEquipmentComments(equipmentId: string | null) {
  return useQuery<EquipmentComment[]>({
    queryKey: commentsKey(equipmentId),
    enabled: !!equipmentId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/equipment/${equipmentId}/comments`);
      return res.json();
    },
  });
}

export function useEquipmentCommentMutations(equipmentId: string | null) {
  const qc = useQueryClient();

  const invalidate = () => {
    if (equipmentId) {
      qc.invalidateQueries({ queryKey: commentsKey(equipmentId) });
    }
  };

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      if (!equipmentId) throw new Error("Оборудование не выбрано");
      const res = await apiRequest("POST", `/api/equipment/${equipmentId}/comments`, { body });
      return res.json() as Promise<EquipmentComment>;
    },
    onSuccess: (comment) => {
      if (equipmentId) {
        appendEquipmentComment(qc, equipmentId, comment);
      }
      invalidate();
    },
  });

  const updateComment = useMutation({
    mutationFn: async ({ commentId, body }: { commentId: number; body: string }) => {
      const res = await apiRequest("PUT", `/api/equipment/${equipmentId}/comments/${commentId}`, {
        body,
      });
      return res.json() as Promise<EquipmentComment>;
    },
    onSuccess: (comment) => {
      if (equipmentId) {
        qc.setQueryData<EquipmentComment[]>(commentsKey(equipmentId), (old) =>
          old?.map((c) => (c.id === comment.id ? comment : c)) ?? [comment]
        );
      }
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: number) => {
      await apiRequest("DELETE", `/api/equipment/${equipmentId}/comments/${commentId}`);
      return commentId;
    },
    onSuccess: (commentId) => {
      if (equipmentId) {
        qc.setQueryData<EquipmentComment[]>(commentsKey(equipmentId), (old) =>
          old?.filter((c) => c.id !== commentId) ?? []
        );
      }
    },
  });

  return { addComment, updateComment, deleteComment };
}
