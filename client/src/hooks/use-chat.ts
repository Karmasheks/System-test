import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type ChatMember = {
  id: number;
  name: string;
  avatar: string | null;
  position: string | null;
};

export type ChatConversation = {
  id: number;
  type: string;
  title: string | null;
  displayTitle: string;
  updatedAt: string;
  unreadCount: number;
  members: ChatMember[];
  lastMessage: {
    id: number;
    body: string;
    senderId: number;
    senderName: string;
    createdAt: string;
  } | null;
};

export type ChatMessage = {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  messageKind: string;
  senderName: string;
  senderAvatar: string | null;
};

export function useChatConversations(enabled = true) {
  return useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    enabled,
    refetchInterval: 30000,
    staleTime: 5000,
  });
}

export function useChatUnreadTotal(enabled = true): number {
  const { data: conversations = [] } = useChatConversations(enabled);
  return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
}

export function useChatMessages(conversationId: number | null) {
  return useQuery<{ messages: ChatMessage[]; total: number }>({
    queryKey: ["/api/chat/conversations", conversationId, "messages"],
    enabled: conversationId != null,
    refetchInterval: 5000,
  });
}

export function useChatMutations() {
  const queryClient = useQueryClient();
  const conversationsKey = ["/api/chat/conversations"] as const;

  const invalidate = (conversationId?: number) => {
    queryClient.invalidateQueries({ queryKey: conversationsKey });
    if (conversationId != null) {
      queryClient.invalidateQueries({
        queryKey: ["/api/chat/conversations", conversationId, "messages"],
      });
    }
  };

  const patchConversationUnread = (conversationId: number, unreadCount: number) => {
    queryClient.setQueryData<ChatConversation[]>(conversationsKey, (current) =>
      current?.map((c) => (c.id === conversationId ? { ...c, unreadCount } : c)) ?? current
    );
  };

  const removeConversationFromCache = (conversationId: number) => {
    queryClient.setQueryData<ChatConversation[]>(conversationsKey, (current) =>
      current?.filter((c) => c.id !== conversationId) ?? []
    );
  };

  const createDirect = useMutation({
    mutationFn: async (otherUserId: number) => {
      const res = await apiRequest("POST", "/api/chat/conversations/direct", { otherUserId });
      return res.json() as Promise<ChatConversation>;
    },
    onSuccess: () => invalidate(),
  });

  const createGroup = useMutation({
    mutationFn: async (data: { title: string; memberIds: number[] }) => {
      const res = await apiRequest("POST", "/api/chat/conversations/group", data);
      return res.json() as Promise<ChatConversation>;
    },
    onSuccess: () => invalidate(),
  });

  const sendMessage = useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: number; body: string }) => {
      const res = await apiRequest("POST", `/api/chat/conversations/${conversationId}/messages`, {
        body,
      });
      return res.json() as Promise<ChatMessage>;
    },
    onSuccess: (_, vars) => invalidate(vars.conversationId),
  });

  const markRead = useMutation({
    mutationFn: async (conversationId: number) => {
      await apiRequest("POST", `/api/chat/conversations/${conversationId}/read`, {});
    },
    onSuccess: (_, conversationId) => patchConversationUnread(conversationId, 0),
  });

  const leaveConversation = useMutation({
    mutationFn: async (conversationId: number) => {
      await apiRequest("DELETE", `/api/chat/conversations/${conversationId}`);
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: conversationsKey });
      const previous = queryClient.getQueryData<ChatConversation[]>(conversationsKey);
      removeConversationFromCache(conversationId);
      queryClient.removeQueries({
        queryKey: ["/api/chat/conversations", conversationId, "messages"],
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationsKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: conversationsKey,
        refetchType: "none",
      });
    },
  });

  const editMessage = useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
      body,
    }: {
      conversationId: number;
      messageId: number;
      body: string;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/chat/conversations/${conversationId}/messages/${messageId}`,
        { body }
      );
      return res.json() as Promise<ChatMessage>;
    },
    onSuccess: (_, vars) => invalidate(vars.conversationId),
  });

  const deleteMessage = useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
    }: {
      conversationId: number;
      messageId: number;
    }) => {
      const res = await apiRequest(
        "DELETE",
        `/api/chat/conversations/${conversationId}/messages/${messageId}`
      );
      return res.json() as Promise<ChatMessage>;
    },
    onSuccess: (_, vars) => invalidate(vars.conversationId),
  });

  return {
    createDirect,
    createGroup,
    sendMessage,
    markRead,
    leaveConversation,
    editMessage,
    deleteMessage,
  };
}
