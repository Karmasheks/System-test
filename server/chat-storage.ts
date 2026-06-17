import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  chatConversations,
  chatConversationMembers,
  chatMessages,
  users,
  type ChatConversation,
  type ChatMessage,
  type User,
} from "../shared/schema";

export type ChatMemberSummary = Pick<User, "id" | "name" | "avatar" | "position">;

export type ConversationSummary = {
  id: number;
  type: string;
  title: string | null;
  displayTitle: string;
  updatedAt: Date;
  unreadCount: number;
  members: ChatMemberSummary[];
  lastMessage: {
    id: number;
    body: string;
    senderId: number;
    senderName: string;
    createdAt: Date;
  } | null;
};

async function getMembersForConversations(conversationIds: number[]): Promise<Map<number, ChatMemberSummary[]>> {
  const map = new Map<number, ChatMemberSummary[]>();
  if (conversationIds.length === 0) return map;

  const rows = await db
    .select({
      conversationId: chatConversationMembers.conversationId,
      id: users.id,
      name: users.name,
      avatar: users.avatar,
      position: users.position,
    })
    .from(chatConversationMembers)
    .innerJoin(users, eq(users.id, chatConversationMembers.userId))
    .where(
      and(
        inArray(chatConversationMembers.conversationId, conversationIds),
        isNull(chatConversationMembers.leftAt)
      )
    );

  for (const row of rows) {
    const list = map.get(row.conversationId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      position: row.position,
    });
    map.set(row.conversationId, list);
  }
  return map;
}

function formatMessagePreview(
  body: string,
  deletedAt: Date | null | undefined,
  messageKind: string | null | undefined,
  senderName?: string
): string {
  if (messageKind === "leave") {
    return `${senderName ?? "Участник"} покинул диалог и удалил его у себя`;
  }
  if (deletedAt) return "Сообщение удалено";
  return body;
}

function mapMessageRow(row: {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  messageKind: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  senderName: string;
  senderAvatar: string | null;
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: formatMessagePreview(row.body, row.deletedAt, row.messageKind, row.senderName),
    messageKind: row.messageKind,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    senderName: row.senderName,
    senderAvatar: row.senderAvatar,
  };
}

async function getMessageById(messageId: number): Promise<ChatMessage | undefined> {
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  return rows[0];
}

function displayTitleForConversation(
  conversation: ChatConversation,
  members: ChatMemberSummary[],
  viewerId: number
): string {
  if (conversation.type === "group" && conversation.title?.trim()) {
    return conversation.title.trim();
  }
  const others = members.filter((m) => m.id !== viewerId);
  if (others.length === 0) return "Без названия";
  return others.map((m) => m.name).join(", ");
}

export async function isActiveConversationMember(
  conversationId: number,
  userId: number
): Promise<boolean> {
  const rows = await db
    .select({ id: chatConversationMembers.id })
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
        isNull(chatConversationMembers.leftAt)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function isConversationMember(conversationId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: chatConversationMembers.id })
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function listConversationsForUser(userId: number): Promise<ConversationSummary[]> {
  const memberRows = await db
    .select({ conversationId: chatConversationMembers.conversationId })
    .from(chatConversationMembers)
    .where(
      and(eq(chatConversationMembers.userId, userId), isNull(chatConversationMembers.leftAt))
    );

  const conversationIds = memberRows.map((r) => r.conversationId);
  if (conversationIds.length === 0) return [];

  const conversations = await db
    .select()
    .from(chatConversations)
    .where(inArray(chatConversations.id, conversationIds))
    .orderBy(desc(chatConversations.updatedAt));

  const membersMap = await getMembersForConversations(conversationIds);

  const lastMessages = await db
    .select({
      conversationId: chatMessages.conversationId,
      id: chatMessages.id,
      body: chatMessages.body,
      senderId: chatMessages.senderId,
      senderName: users.name,
      createdAt: chatMessages.createdAt,
      deletedAt: chatMessages.deletedAt,
      messageKind: chatMessages.messageKind,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.senderId))
    .where(inArray(chatMessages.conversationId, conversationIds))
    .orderBy(desc(chatMessages.createdAt));

  const lastByConv = new Map<number, ConversationSummary["lastMessage"]>();
  for (const msg of lastMessages) {
    if (!lastByConv.has(msg.conversationId)) {
      lastByConv.set(msg.conversationId, {
        id: msg.id,
        body: formatMessagePreview(msg.body, msg.deletedAt, msg.messageKind, msg.senderName),
        senderId: msg.senderId,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
      });
    }
  }

  const readRows = await db
    .select({
      conversationId: chatConversationMembers.conversationId,
      lastReadAt: chatConversationMembers.lastReadAt,
    })
    .from(chatConversationMembers)
    .where(
      and(eq(chatConversationMembers.userId, userId), inArray(chatConversationMembers.conversationId, conversationIds))
    );

  const readMap = new Map(readRows.map((r) => [r.conversationId, r.lastReadAt]));

  const unreadCounts = await db
    .select({
      conversationId: chatMessages.conversationId,
      count: sql<number>`count(*)::int`,
    })
    .from(chatMessages)
    .where(inArray(chatMessages.conversationId, conversationIds))
    .groupBy(chatMessages.conversationId);

  const unreadMap = new Map<number, number>();
  for (const row of unreadCounts) {
    const lastRead = readMap.get(row.conversationId);
    if (!lastRead) {
      unreadMap.set(row.conversationId, row.count);
      continue;
    }
    const unreadRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, row.conversationId),
          sql`${chatMessages.createdAt} > ${lastRead}`
        )
      );
    unreadMap.set(row.conversationId, unreadRows[0]?.count ?? 0);
  }

  return conversations.map((conversation) => {
    const members = membersMap.get(conversation.id) ?? [];
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      displayTitle: displayTitleForConversation(conversation, members, userId),
      updatedAt: conversation.updatedAt,
      unreadCount: unreadMap.get(conversation.id) ?? 0,
      members,
      lastMessage: lastByConv.get(conversation.id) ?? null,
    };
  });
}

export async function findDirectConversation(userA: number, userB: number): Promise<number | null> {
  if (userA === userB) return null;

  const aRows = await db
    .select({ conversationId: chatConversationMembers.conversationId })
    .from(chatConversationMembers)
    .innerJoin(chatConversations, eq(chatConversations.id, chatConversationMembers.conversationId))
    .where(
      and(eq(chatConversationMembers.userId, userA), eq(chatConversations.type, "direct"))
    );

  if (aRows.length === 0) return null;

  const bRows = await db
    .select({ conversationId: chatConversationMembers.conversationId })
    .from(chatConversationMembers)
    .where(and(eq(chatConversationMembers.userId, userB), inArray(chatConversationMembers.conversationId, aRows.map((r) => r.conversationId))));

  if (bRows.length === 0) return null;

  for (const row of bRows) {
    const members = await db
      .select({ userId: chatConversationMembers.userId })
      .from(chatConversationMembers)
      .where(eq(chatConversationMembers.conversationId, row.conversationId));
    if (members.length === 2) return row.conversationId;
  }
  return null;
}

export async function createDirectConversation(
  creatorId: number,
  otherUserId: number
): Promise<ConversationSummary> {
  const existingId = await findDirectConversation(creatorId, otherUserId);
  if (existingId) {
    const [member] = await db
      .select()
      .from(chatConversationMembers)
      .where(
        and(
          eq(chatConversationMembers.conversationId, existingId),
          eq(chatConversationMembers.userId, creatorId)
        )
      )
      .limit(1);

    if (member?.leftAt) {
      await db
        .update(chatConversationMembers)
        .set({ leftAt: null, joinedAt: new Date() })
        .where(
          and(
            eq(chatConversationMembers.conversationId, existingId),
            eq(chatConversationMembers.userId, creatorId)
          )
        );
    }

    const list = await listConversationsForUser(creatorId);
    const found = list.find((c) => c.id === existingId);
    if (found) return found;
  }

  const [conversation] = await db
    .insert(chatConversations)
    .values({
      type: "direct",
      createdById: creatorId,
      updatedAt: new Date(),
    })
    .returning();

  await db.insert(chatConversationMembers).values([
    { conversationId: conversation.id, userId: creatorId, role: "member" },
    { conversationId: conversation.id, userId: otherUserId, role: "member" },
  ]);

  const list = await listConversationsForUser(creatorId);
  const found = list.find((c) => c.id === conversation.id);
  if (!found) {
    throw new Error("Не удалось создать диалог");
  }
  return found;
}

export async function createGroupConversation(
  creatorId: number,
  title: string,
  memberIds: number[]
): Promise<ConversationSummary> {
  const uniqueMembers = Array.from(new Set([creatorId, ...memberIds.filter((id) => id > 0)]));
  if (uniqueMembers.length < 2) {
    throw new Error("Укажите хотя бы одного участника");
  }

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Укажите название группы");
  }

  const [conversation] = await db
    .insert(chatConversations)
    .values({
      type: "group",
      title: trimmedTitle,
      createdById: creatorId,
      updatedAt: new Date(),
    })
    .returning();

  await db.insert(chatConversationMembers).values(
    uniqueMembers.map((userId) => ({
      conversationId: conversation.id,
      userId,
      role: userId === creatorId ? "admin" : "member",
    }))
  );

  const list = await listConversationsForUser(creatorId);
  const found = list.find((c) => c.id === conversation.id);
  if (!found) {
    throw new Error("Не удалось создать группу");
  }
  return found;
}

export async function listMessages(
  conversationId: number,
  userId: number,
  page = 1,
  limit = 50
): Promise<{ messages: (ChatMessage & { senderName: string; senderAvatar: string | null })[]; total: number }> {
  if (!await isActiveConversationMember(conversationId, userId)) {
    throw new Error("Диалог не найден");
  }

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safePage = Math.max(page, 1);
  const offset = (safePage - 1) * safeLimit;

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId));
  const total = totalRows[0]?.count ?? 0;

  const rows = await db
    .select({
      id: chatMessages.id,
      conversationId: chatMessages.conversationId,
      senderId: chatMessages.senderId,
      body: chatMessages.body,
      messageKind: chatMessages.messageKind,
      createdAt: chatMessages.createdAt,
      editedAt: chatMessages.editedAt,
      deletedAt: chatMessages.deletedAt,
      senderName: users.name,
      senderAvatar: users.avatar,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.senderId))
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(safeLimit)
    .offset(offset);

  return {
    messages: rows.map((r) => mapMessageRow(r)),
    total,
  };
}

export async function sendMessage(
  conversationId: number,
  senderId: number,
  body: string
): Promise<ChatMessage & { senderName: string; senderAvatar: string | null }> {
  if (!await isActiveConversationMember(conversationId, senderId)) {
    throw new Error("Диалог не найден");
  }

  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Введите сообщение");
  }

  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      senderId,
      body: trimmed,
    })
    .returning();

  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));

  await markConversationRead(conversationId, senderId);

  const sender = await db
    .select({ name: users.name, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);

  return {
    ...message,
    messageKind: message.messageKind,
    body: formatMessagePreview(message.body, message.deletedAt, message.messageKind, sender[0]?.name),
    senderName: sender[0]?.name ?? "",
    senderAvatar: sender[0]?.avatar ?? null,
  };
}

export async function updateMessage(
  messageId: number,
  userId: number,
  body: string
): Promise<ChatMessage & { senderName: string; senderAvatar: string | null }> {
  const message = await getMessageById(messageId);
  if (!message) {
    throw new Error("Сообщение не найдено");
  }
  if (message.senderId !== userId) {
    throw new Error("Можно редактировать только свои сообщения");
  }
  if (message.deletedAt) {
    throw new Error("Удалённое сообщение не редактируется");
  }
  if (message.messageKind === "leave") {
    throw new Error("Системное сообщение не редактируется");
  }
  if (!await isActiveConversationMember(message.conversationId, userId)) {
    throw new Error("Диалог не найден");
  }

  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Введите сообщение");
  }

  const [updated] = await db
    .update(chatMessages)
    .set({ body: trimmed, editedAt: new Date() })
    .where(eq(chatMessages.id, messageId))
    .returning();

  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, message.conversationId));

  const sender = await db
    .select({ name: users.name, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    ...updated,
    messageKind: updated.messageKind,
    body: updated.body,
    senderName: sender[0]?.name ?? "",
    senderAvatar: sender[0]?.avatar ?? null,
  };
}

export async function deleteMessage(
  messageId: number,
  userId: number
): Promise<ChatMessage & { senderName: string; senderAvatar: string | null }> {
  const message = await getMessageById(messageId);
  if (!message) {
    throw new Error("Сообщение не найдено");
  }
  if (message.senderId !== userId) {
    throw new Error("Можно удалять только свои сообщения");
  }
  if (message.messageKind === "leave") {
    throw new Error("Системное сообщение не удаляется");
  }
  if (!await isActiveConversationMember(message.conversationId, userId)) {
    throw new Error("Диалог не найден");
  }

  const [updated] = await db
    .update(chatMessages)
    .set({ deletedAt: new Date() })
    .where(eq(chatMessages.id, messageId))
    .returning();

  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, message.conversationId));

  const sender = await db
    .select({ name: users.name, avatar: users.avatar })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    ...updated,
    messageKind: updated.messageKind,
    body: formatMessagePreview(updated.body, updated.deletedAt, updated.messageKind, sender[0]?.name),
    senderName: sender[0]?.name ?? "",
    senderAvatar: sender[0]?.avatar ?? null,
  };
}

export async function leaveConversation(conversationId: number, userId: number): Promise<void> {
  const [member] = await db
    .select()
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId)
      )
    )
    .limit(1);

  if (!member) {
    throw new Error("Диалог не найден");
  }
  if (member.leftAt) {
    return;
  }

  await db
    .update(chatConversationMembers)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId)
      )
    );

  try {
    await db.insert(chatMessages).values({
      conversationId,
      senderId: userId,
      body: "",
      messageKind: "leave",
    });
  } catch (error) {
    console.error("leaveConversation: failed to insert leave message", error);
  }

  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));
}

export async function markConversationRead(conversationId: number, userId: number): Promise<void> {
  await db
    .update(chatConversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
        isNull(chatConversationMembers.leftAt)
      )
    );
}
