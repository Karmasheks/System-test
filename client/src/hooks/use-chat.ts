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

export type ChatMessagesPage = {
  messages: ChatMessage[];
  total: number;
};

export function chatMessagesQueryKey(conversationId: number): string {
  return `/api/chat/conversations/${conversationId}/messages`;
}

function normalizeMessagesResponse(data: unknown): ChatMessagesPage {
  if (Array.isArray(data)) {
    return { messages: [], total: 0 };
  }
  if (data && typeof data === "object" && "messages" in data) {
    const record = data as { messages?: ChatMessage[]; total?: number };
    const messages = Array.isArray(record.messages) ? record.messages : [];
    return { messages, total: record.total ?? messages.length };
  }
  return { messages: [], total: 0 };
}

export function useChatMessages(conversationId: number | null) {
  const url = conversationId != null ? chatMessagesQueryKey(conversationId) : null;

  return useQuery<ChatMessagesPage>({
    queryKey: [url],
    enabled: url != null,
    queryFn: async () => {
      const res = await apiRequest("GET", url!);
      return normalizeMessagesResponse(await res.json());
    },
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

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

export function useChatMutations() {
  const queryClient = useQueryClient();
  const conversationsKey = ["/api/chat/conversations"] as const;

  const patchConversationLastMessage = (conversationId: number, message: ChatMessage) => {
    queryClient.setQueryData<ChatConversation[]>(conversationsKey, (current) =>
      current?.map((c) => {
        if (c.id !== conversationId) return c;
        const shouldUpdatePreview =
          !c.lastMessage || c.lastMessage.id === message.id || message.id >= c.lastMessage.id;
        return {
          ...c,
          updatedAt: message.createdAt,
          lastMessage: shouldUpdatePreview
            ? {
                id: message.id,
                body: message.body,
                senderId: message.senderId,
                senderName: message.senderName,
                createdAt: message.createdAt,
              }
            : c.lastMessage,
        };
      }) ?? current
    );
  };

  const patchMessageInCache = (conversationId: number, message: ChatMessage) => {
    const messagesKey = [chatMessagesQueryKey(conversationId)];
    queryClient.setQueryData<ChatMessagesPage>(messagesKey, (current) => {
      if (!current) {
        return { messages: [message], total: 1 };
      }
      const index = current.messages.findIndex((m) => m.id === message.id);
      if (index === -1) {
        return {
          messages: [...current.messages, message],
          total: current.total + 1,
        };
      }
      const messages = [...current.messages];
      messages[index] = message;
      return { ...current, messages };
    });
    patchConversationLastMessage(conversationId, message);
  };

  const invalidate = (conversationId?: number) => {
    queryClient.invalidateQueries({ queryKey: conversationsKey });
    if (conversationId != null) {
      queryClient.invalidateQueries({
        queryKey: [chatMessagesQueryKey(conversationId)],
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
    onSuccess: (message, vars) => patchMessageInCache(vars.conversationId, message),
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
        queryKey: [chatMessagesQueryKey(conversationId)],
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
    onSuccess: (message, vars) => patchMessageInCache(vars.conversationId, message),
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
    onSuccess: (message, vars) => patchMessageInCache(vars.conversationId, message),
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
