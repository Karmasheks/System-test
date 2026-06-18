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

export type ChatMessageSender = {
  id: number;
  name: string;
  avatar: string | null;
};

export function isPendingChatMessage(message: ChatMessage): boolean {
  return message.id < 0;
}

export function chatMessagesQueryKey(conversationId: number): string {
  return `/api/chat/conversations/${conversationId}/messages`;
}

/** Диалоги, для которых клиент уже отправил mark-read — не показывать stale unread с сервера. */
const pendingReadConversations = new Set<number>();

function applyPendingRead(conversations: ChatConversation[]): ChatConversation[] {
  if (pendingReadConversations.size === 0) return conversations;
  return conversations.map((c) =>
    pendingReadConversations.has(c.id) ? { ...c, unreadCount: 0 } : c
  );
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

function mergeMessagePages(
  current: ChatMessagesPage | undefined,
  incoming: ChatMessagesPage
): ChatMessagesPage {
  if (!current) return incoming;

  const pending = current.messages.filter((m) => isPendingChatMessage(m));
  const byId = new Map<number, ChatMessage>();
  for (const msg of incoming.messages) {
    byId.set(msg.id, msg);
  }
  for (const msg of current.messages) {
    if (!isPendingChatMessage(msg) && !byId.has(msg.id)) {
      byId.set(msg.id, msg);
    }
  }

  const messages = [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const mergedPending = pending.filter(
    (p) => !messages.some((m) => m.body === p.body && m.senderId === p.senderId && !isPendingChatMessage(m))
  );

  return {
    messages: [...messages, ...mergedPending],
    total: Math.max(incoming.total, messages.length + mergedPending.length),
  };
}

export function useChatMessages(conversationId: number | null) {
  const url = conversationId != null ? chatMessagesQueryKey(conversationId) : null;
  const queryClient = useQueryClient();

  return useQuery<ChatMessagesPage>({
    queryKey: [url],
    enabled: url != null,
    queryFn: async () => {
      const res = await apiRequest("GET", url!);
      const incoming = normalizeMessagesResponse(await res.json());
      const current = queryClient.getQueryData<ChatMessagesPage>([url!]);
      return mergeMessagePages(current, incoming);
    },
    refetchInterval: 2500,
    staleTime: 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function useChatConversations(enabled = true) {
  return useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    enabled,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/chat/conversations");
      const data = (await res.json()) as ChatConversation[];
      for (const c of data) {
        if (c.unreadCount === 0) pendingReadConversations.delete(c.id);
      }
      return applyPendingRead(data);
    },
    refetchInterval: 15000,
    staleTime: 3000,
    refetchOnWindowFocus: true,
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
    queryClient.setQueryData<ChatConversation[]>(conversationsKey, (current) => {
      if (!current) return current;
      const index = current.findIndex((c) => c.id === conversationId);
      if (index === -1) return current;

      const c = current[index];
      const shouldUpdatePreview =
        !c.lastMessage || c.lastMessage.id === message.id || message.id >= c.lastMessage.id;
      const updated: ChatConversation = {
        ...c,
        updatedAt: message.createdAt,
        unreadCount: 0,
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

      const rest = current.filter((_, i) => i !== index);
      return [updated, ...rest];
    });
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

  const replacePendingMessage = (
    conversationId: number,
    tempId: number,
    message: ChatMessage
  ) => {
    const messagesKey = [chatMessagesQueryKey(conversationId)];
    queryClient.setQueryData<ChatMessagesPage>(messagesKey, (current) => {
      if (!current) {
        return { messages: [message], total: 1 };
      }
      const index = current.messages.findIndex((m) => m.id === tempId);
      if (index === -1) {
        const exists = current.messages.some((m) => m.id === message.id);
        return exists
          ? current
          : {
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

  const upsertConversationInCache = (conversation: ChatConversation) => {
    queryClient.setQueryData<ChatConversation[]>(conversationsKey, (current) => {
      const list = current ?? [];
      const index = list.findIndex((c) => c.id === conversation.id);
      if (index === -1) {
        return [{ ...conversation, unreadCount: 0 }, ...list];
      }
      const item = { ...list[index], ...conversation, unreadCount: 0 };
      const rest = list.filter((_, i) => i !== index);
      return [item, ...rest];
    });
  };

  const prepareConversationOpen = (conversation: ChatConversation) => {
    upsertConversationInCache(conversation);
    const messagesKey = [chatMessagesQueryKey(conversation.id)];
    if (!queryClient.getQueryData(messagesKey)) {
      queryClient.setQueryData<ChatMessagesPage>(messagesKey, { messages: [], total: 0 });
    }
  };

  const createDirect = useMutation({
    mutationFn: async (otherUserId: number) => {
      const res = await apiRequest("POST", "/api/chat/conversations/direct", { otherUserId });
      return res.json() as Promise<ChatConversation>;
    },
    onSuccess: (conversation) => {
      prepareConversationOpen(conversation);
    },
  });

  const createGroup = useMutation({
    mutationFn: async (data: { title: string; memberIds: number[] }) => {
      const res = await apiRequest("POST", "/api/chat/conversations/group", data);
      return res.json() as Promise<ChatConversation>;
    },
    onSuccess: (conversation) => {
      prepareConversationOpen(conversation);
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      conversationId,
      body,
    }: {
      conversationId: number;
      body: string;
      sender: ChatMessageSender;
    }) => {
      const res = await apiRequest("POST", `/api/chat/conversations/${conversationId}/messages`, {
        body,
      });
      return res.json() as Promise<ChatMessage>;
    },
    onMutate: async ({ conversationId, body, sender }) => {
      const messagesKey = [chatMessagesQueryKey(conversationId)];
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData<ChatMessagesPage>(messagesKey);
      const tempId = -Date.now();
      const optimistic: ChatMessage = {
        id: tempId,
        conversationId,
        senderId: sender.id,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        messageKind: "user",
        senderName: sender.name,
        senderAvatar: sender.avatar,
      };
      patchMessageInCache(conversationId, optimistic);
      return { previous, tempId, conversationId };
    },
    onSuccess: (message, _vars, context) => {
      if (context?.tempId != null) {
        replacePendingMessage(context.conversationId, context.tempId, message);
      } else {
        patchMessageInCache(message.conversationId, message);
      }
    },
    onError: (_err, { conversationId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData([chatMessagesQueryKey(conversationId)], context.previous);
      }
    },
  });

  const markRead = useMutation({
    mutationFn: async (conversationId: number) => {
      await apiRequest("POST", `/api/chat/conversations/${conversationId}/read`, {});
      return conversationId;
    },
    onMutate: async (conversationId) => {
      pendingReadConversations.add(conversationId);
      await queryClient.cancelQueries({ queryKey: conversationsKey });
      const previous = queryClient.getQueryData<ChatConversation[]>(conversationsKey);
      patchConversationUnread(conversationId, 0);
      return { previous };
    },
    onSuccess: (conversationId) => {
      patchConversationUnread(conversationId, 0);
    },
    onError: (_err, conversationId, context) => {
      pendingReadConversations.delete(conversationId);
      if (context?.previous) {
        queryClient.setQueryData(conversationsKey, context.previous);
      } else {
        void queryClient.invalidateQueries({ queryKey: conversationsKey });
      }
    },
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
