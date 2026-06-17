import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserAvatar } from "@/components/user-avatar";
import { ChatUnreadBadge } from "@/components/chat-unread-badge";
import { MessageSquare, Pencil, Plus, Send, Trash2, Users } from "lucide-react";
import {
  useChatConversations,
  useChatMessages,
  useChatMutations,
  chatMessagesQueryKey,
  type ChatConversation,
  type ChatMessage,
} from "@/hooks/use-chat";
import { matchesListSearch } from "@/lib/list-search";
import { ListSearchInput } from "@/components/list-search-input";
import { SubdivisionFilterSelect } from "@/components/subdivision-filter-select";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { useAccessControl } from "@/hooks/use-access-control";
import { userWorkSubdivisionIds } from "@/lib/user-subdivisions";
import { parseApiErrorMessage } from "@/lib/api-error";
import { formatChatDateTime } from "@/lib/chat-datetime";

type UserListItem = {
  id: number;
  name: string;
  avatar: string | null;
  position: string | null;
  subdivisionId: number | null;
  extraSubdivisionIds?: number[] | null;
};

function userMatchesSubdivision(user: UserListItem, subdivisionId: number | null): boolean {
  if (subdivisionId == null) return true;
  return userWorkSubdivisionIds(user.subdivisionId, user.extraSubdivisionIds).includes(subdivisionId);
}

function subdivisionLabel(
  user: UserListItem,
  subdivisionName: (id: number | null | undefined) => string
): string {
  const ids = userWorkSubdivisionIds(user.subdivisionId, user.extraSubdivisionIds);
  if (ids.length === 0) return "Подразделение не указано";
  return ids.map((id) => subdivisionName(id)).join(", ");
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { isSystemAdmin, permissions } = useAccessControl();
  const { data: subdivisions = [] } = useSubdivisions();
  const search = useSearch();
  const conversationFromUrl = useMemo(() => {
    const params = new URLSearchParams(search);
    const raw = params.get("conversation");
    const id = raw ? parseInt(raw, 10) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [search]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: conversations = [], isLoading } = useChatConversations();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [userSubdivisionFilter, setUserSubdivisionFilter] = useState("all");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [deleteConversationOpen, setDeleteConversationOpen] = useState(false);
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const systemAdmin = isSystemAdmin();
  const managedSubdivisionIds = permissions?.managedSubdivisionIds ?? [];

  const availableSubdivisions = useMemo(() => {
    if (systemAdmin) return subdivisions;
    if (managedSubdivisionIds.length > 0) {
      const allowed = new Set(managedSubdivisionIds);
      return subdivisions.filter((s) => allowed.has(s.id));
    }
    const workIds = userWorkSubdivisionIds(user?.subdivisionId, user?.extraSubdivisionIds);
    if (workIds.length > 0) {
      const allowed = new Set(workIds);
      return subdivisions.filter((s) => allowed.has(s.id));
    }
    return subdivisions;
  }, [subdivisions, systemAdmin, managedSubdivisionIds, user?.subdivisionId, user?.extraSubdivisionIds]);

  const showUserSubdivisionFilter = systemAdmin || availableSubdivisions.length > 1;
  const userFilterSubdivisionId =
    userSubdivisionFilter === "all" ? null : Number(userSubdivisionFilter);

  const subdivisionName = (id: number | null | undefined) =>
    subdivisions.find((s) => s.id === id)?.name ?? (id ? `#${id}` : "—");

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;
  const {
    data: messagesData,
    isLoading: messagesLoading,
    isFetching: messagesFetching,
    isError: messagesError,
    error: messagesQueryError,
  } = useChatMessages(selectedId);
  const messages = messagesData?.messages ?? [];
  const { createDirect, createGroup, sendMessage, markRead, leaveConversation, editMessage, deleteMessage } =
    useChatMutations();

  const {
    data: allUsers = [],
    isLoading: usersLoading,
    isError: usersError,
  } = useQuery<UserListItem[]>({
    queryKey: ["/api/users/list"],
  });

  const otherUsers = useMemo(
    () => allUsers.filter((u) => u.id !== user?.id),
    [allUsers, user?.id]
  );

  const pickableUsers = useMemo(() => {
    let list = otherUsers.filter((u) => userMatchesSubdivision(u, userFilterSubdivisionId));
    if (userSearch.trim()) {
      list = list.filter((u) =>
        matchesListSearch(userSearch, [
          u.name,
          u.position ?? "",
          subdivisionLabel(u, subdivisionName),
          String(u.id),
        ])
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [otherUsers, userFilterSubdivisionId, userSearch, subdivisions]);

  const filteredConversations = useMemo(() => {
    if (!listSearch.trim()) return conversations;
    return conversations.filter((c) =>
      matchesListSearch(listSearch, [
        c.displayTitle,
        c.lastMessage?.body ?? "",
        c.lastMessage?.senderName ?? "",
      ])
    );
  }, [conversations, listSearch]);

  const resetUserPickerState = () => {
    setUserSearch("");
    setGroupTitle("");
    setGroupMemberIds([]);
  };

  useEffect(() => {
    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return Array.isArray(key) && key[0] === "/api/chat/conversations" && key.length === 3;
      },
    });
  }, [queryClient]);

  useEffect(() => {
    if (conversationFromUrl != null) {
      setSelectedId(conversationFromUrl);
      return;
    }
    if (selectedId == null && conversations.length > 0) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId, conversationFromUrl]);

  useEffect(() => {
    if (selectedId == null || messagesLoading) return;
    markRead.mutate(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark read when opening dialog or new messages arrive
  }, [selectedId, messagesLoading, messagesData?.messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!selectedId || !messageText.trim()) return;
    try {
      await sendMessage.mutateAsync({ conversationId: selectedId, body: messageText });
      setMessageText("");
    } catch (error) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось отправить сообщение"),
        variant: "destructive",
      });
    }
  };

  const handleCreateDirect = async (otherUserId: number) => {
    if (createDirect.isPending) return;
    try {
      const conversation = await createDirect.mutateAsync(otherUserId);
      setSelectedId(conversation.id);
      setNewDialogOpen(false);
      resetUserPickerState();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось создать диалог"),
        variant: "destructive",
      });
    }
  };

  const handleCreateGroup = async () => {
    if (createGroup.isPending) return;
    try {
      const conversation = await createGroup.mutateAsync({
        title: groupTitle,
        memberIds: groupMemberIds,
      });
      setSelectedId(conversation.id);
      setGroupDialogOpen(false);
      resetUserPickerState();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось создать группу"),
        variant: "destructive",
      });
    }
  };

  const toggleGroupMember = (id: number) => {
    setGroupMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleLeaveConversation = async () => {
    if (!selectedId) return;
    const leavingId = selectedId;
    const nextId = conversations.find((c) => c.id !== leavingId)?.id ?? null;
    setSelectedId(nextId);
    setDeleteConversationOpen(false);
    try {
      await leaveConversation.mutateAsync(leavingId);
      toast({ title: "Диалог удалён у вас" });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось удалить диалог"),
        variant: "destructive",
      });
    }
  };

  const startEditMessage = (msg: ChatMessage) => {
    if (msg.deletedAt) return;
    setEditingMessageId(msg.id);
    setEditingMessageText(msg.body);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
  };

  const saveEditMessage = async () => {
    if (!selectedId || editingMessageId == null || !editingMessageText.trim()) return;
    try {
      await editMessage.mutateAsync({
        conversationId: selectedId,
        messageId: editingMessageId,
        body: editingMessageText,
      });
      cancelEditMessage();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось изменить сообщение"),
        variant: "destructive",
      });
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedId || !deleteMessageTarget) return;
    try {
      await deleteMessage.mutateAsync({
        conversationId: selectedId,
        messageId: deleteMessageTarget.id,
      });
      setDeleteMessageTarget(null);
      if (editingMessageId === deleteMessageTarget.id) cancelEditMessage();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось удалить сообщение"),
        variant: "destructive",
      });
    }
  };

  const renderUserPickerList = (mode: "direct" | "group") => (
    <div className="space-y-3 min-w-0 w-full">
      <ListSearchInput
        value={userSearch}
        onChange={setUserSearch}
        placeholder="Поиск сотрудника..."
        className="w-full min-w-0"
      />
      {showUserSubdivisionFilter && (
        <SubdivisionFilterSelect
          value={userSubdivisionFilter}
          onChange={setUserSubdivisionFilter}
          subdivisions={availableSubdivisions}
          showAll={systemAdmin || availableSubdivisions.length > 1}
          label="Подразделение"
          className="w-full min-w-0"
        />
      )}
      <div className="max-h-64 overflow-y-auto overflow-x-hidden space-y-1 rounded-md border w-full min-w-0">
        {usersLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Загрузка сотрудников...</p>
        ) : usersError ? (
          <p className="p-4 text-sm text-destructive">Не удалось загрузить список сотрудников</p>
        ) : pickableUsers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Сотрудники не найдены</p>
        ) : mode === "direct" ? (
          pickableUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-md p-2 hover:bg-muted text-left disabled:opacity-50"
              disabled={createDirect.isPending}
              onClick={() => handleCreateDirect(u.id)}
            >
              <UserAvatar name={u.name} avatarUrl={u.avatar} className="h-8 w-8 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium leading-snug break-words">{u.name}</p>
                {u.position && (
                  <p className="text-xs text-muted-foreground leading-snug break-words">{u.position}</p>
                )}
                <p className="text-xs text-muted-foreground leading-snug break-words">
                  {subdivisionLabel(u, subdivisionName)}
                </p>
              </div>
            </button>
          ))
        ) : (
          pickableUsers.map((u) => (
            <label
              key={u.id}
              className="flex items-start gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={groupMemberIds.includes(u.id)}
                onCheckedChange={() => toggleGroupMember(u.id)}
                className="mt-1 shrink-0"
              />
              <UserAvatar name={u.name} avatarUrl={u.avatar} className="h-8 w-8 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium leading-snug break-words">{u.name}</p>
                {u.position && (
                  <p className="text-xs text-muted-foreground leading-snug break-words">{u.position}</p>
                )}
                <p className="text-xs text-muted-foreground leading-snug break-words">
                  {subdivisionLabel(u, subdivisionName)}
                </p>
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Сообщения</title>
      </Helmet>

      <main className="flex-1 overflow-hidden p-4 sm:p-6">
        <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col rounded-lg border bg-card shadow-sm lg:flex-row">
          <aside className="flex w-full flex-col border-b lg:w-80 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <div className="flex items-center gap-2 font-semibold">
                <MessageSquare className="h-5 w-5" />
                Сообщения
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setNewDialogOpen(true)}
                  title="Новый диалог"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setGroupDialogOpen(true)}
                  title="Новая группа"
                >
                  <Users className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-3 border-b">
              <ListSearchInput value={listSearch} onChange={setListSearch} placeholder="Поиск диалогов..." />
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Загрузка...</p>
              ) : filteredConversations.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Нет диалогов</p>
              ) : (
                filteredConversations.map((conversation) => (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === selectedId}
                    onClick={() => {
                      setSelectedId(conversation.id);
                      markRead.mutate(conversation.id);
                      void queryClient.invalidateQueries({
                        queryKey: [chatMessagesQueryKey(conversation.id)],
                      });
                    }}
                  />
                ))
              )}
            </div>
          </aside>

          <section className="flex flex-1 flex-col min-w-0">
            {selectedConversation ? (
              <>
                <div className="border-b p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-multiline">{selectedConversation.displayTitle}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedConversation.type === "group"
                        ? `${selectedConversation.members.length} участников`
                        : "Личный диалог"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    title="Удалить у себя"
                    onClick={() => setDeleteConversationOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
                  {messagesLoading || (messagesFetching && messages.length === 0) ? (
                    <p className="text-sm text-muted-foreground">Загрузка сообщений...</p>
                  ) : messagesError ? (
                    <p className="text-sm text-destructive">
                      {parseApiErrorMessage(messagesQueryError, "Не удалось загрузить сообщения")}
                    </p>
                  ) : messages.length === 0 ? (
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>Нет сообщений. Напишите первое.</p>
                      {selectedConversation?.lastMessage && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            queryClient.invalidateQueries({
                              queryKey: [chatMessagesQueryKey(selectedId!)],
                            })
                          }
                        >
                          Обновить историю
                        </Button>
                      )}
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <ChatMessageBubble
                        key={msg.id}
                        msg={msg}
                        isOwn={msg.senderId === user?.id}
                        isEditing={editingMessageId === msg.id}
                        editingText={editingMessageText}
                        onEditingTextChange={setEditingMessageText}
                        onStartEdit={() => startEditMessage(msg)}
                        onCancelEdit={cancelEditMessage}
                        onSaveEdit={saveEditMessage}
                        onDelete={() => setDeleteMessageTarget(msg)}
                        editPending={editMessage.isPending}
                      />
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="border-t p-3 flex gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Введите сообщение..."
                    rows={2}
                    className="min-h-[44px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button onClick={handleSend} disabled={!messageText.trim() || sendMessage.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
                Выберите диалог или создайте новый
              </div>
            )}
          </section>
        </div>
      </main>

      <Dialog
        open={newDialogOpen}
        onOpenChange={(open) => {
          setNewDialogOpen(open);
          if (!open) resetUserPickerState();
        }}
        modal
      >
        <DialogContent className="max-w-md w-[calc(100%-2rem)] overflow-hidden" blockOutsideClose>
          <DialogHeader>
            <DialogTitle>Новый диалог</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 overflow-hidden">{renderUserPickerList("direct")}</div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={groupDialogOpen}
        onOpenChange={(open) => {
          setGroupDialogOpen(open);
          if (!open) resetUserPickerState();
        }}
        modal
      >
        <DialogContent className="max-w-md w-[calc(100%-2rem)] overflow-hidden" blockOutsideClose>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 min-w-0 overflow-hidden">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Название группы"
              />
            </div>
            <div className="space-y-2">
              <Label>Участники</Label>
              {renderUserPickerList("group")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Отмена</Button>
            <Button
              onClick={handleCreateGroup}
              disabled={!groupTitle.trim() || groupMemberIds.length === 0 || createGroup.isPending}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConversationOpen} onOpenChange={setDeleteConversationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить диалог у себя?</AlertDialogTitle>
            <AlertDialogDescription>
              Диалог скроется только в вашем списке. У других участников останется история, и они
              увидят сообщение, что вы покинули диалог и удалили его у себя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить у себя
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteMessageTarget != null}
        onOpenChange={(open) => !open && setDeleteMessageTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сообщение?</AlertDialogTitle>
            <AlertDialogDescription>
              Сообщение будет помечено как удалённое для всех участников диалога.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMessage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChatMessageBubble({
  msg,
  isOwn,
  isEditing,
  editingText,
  onEditingTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  editPending,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  isEditing: boolean;
  editingText: string;
  onEditingTextChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  editPending: boolean;
}) {
  const isDeleted = !!msg.deletedAt;
  const isEdited = !!msg.editedAt && !isDeleted;
  const isLeave = msg.messageKind === "leave";

  if (isLeave) {
    return (
      <div className="flex justify-center py-1">
        <p className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full text-center">
          {msg.body}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 group ${isOwn ? "flex-row-reverse" : ""}`}>
      <UserAvatar
        name={msg.senderName}
        avatarUrl={msg.senderAvatar}
        className="h-8 w-8 shrink-0"
      />
      <div className={`max-w-[75%] ${isOwn ? "text-right" : ""}`}>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editingText}
              onChange={(e) => onEditingTextChange(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={onCancelEdit}>Отмена</Button>
              <Button size="sm" onClick={onSaveEdit} disabled={!editingText.trim() || editPending}>
                Сохранить
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`rounded-lg px-3 py-2 text-sm relative ${
                isOwn ? "bg-primary text-primary-foreground" : "bg-background border"
              } ${isDeleted ? "opacity-70" : ""}`}
            >
              {!isOwn && (
                <p className="text-[10px] font-medium opacity-70 mb-0.5">{msg.senderName}</p>
              )}
              <p
                className={`whitespace-pre-wrap break-words ${
                  isDeleted ? "italic text-muted-foreground" : ""
                }`}
              >
                {msg.body}
              </p>
              {isOwn && !isDeleted && (
                <div className="flex gap-1 mt-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    onClick={onStartEdit}
                    title="Редактировать"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    onClick={onDelete}
                    title="Удалить"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {formatChatDateTime(msg.createdAt)}
              {isEdited && <span className="ml-1">· изменено</span>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ConversationListItem({
  conversation,
  active,
  onClick,
}: {
  conversation: ChatConversation;
  active: boolean;
  onClick: () => void;
}) {
  const preview = conversation.lastMessage?.body ?? "Нет сообщений";
  const otherMember = conversation.members[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-2 border-b p-3 text-left hover:bg-muted/50 ${
        active ? "bg-muted" : ""
      }`}
    >
      <UserAvatar
        name={conversation.displayTitle}
        avatarUrl={otherMember?.avatar}
        className="h-9 w-9 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-multiline text-sm">{conversation.displayTitle}</p>
          <ChatUnreadBadge count={conversation.unreadCount} />
        </div>
        <p className="text-xs text-muted-foreground text-multiline">{preview}</p>
      </div>
    </button>
  );
}
