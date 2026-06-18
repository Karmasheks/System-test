import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { AuthenticatedUser } from "./routes";
import { storage } from "./storage";
import {
  createDirectConversation,
  createGroupConversation,
  leaveConversation,
  deleteMessage,
  listConversationsForUser,
  listMessages,
  markConversationRead,
  sendMessage,
  updateMessage,
} from "./chat-storage";

const createDirectSchema = z.object({
  otherUserId: z.coerce.number().int().positive(),
});

const createGroupSchema = z.object({
  title: z.string().min(1, "Укажите название"),
  memberIds: z.array(z.coerce.number().int().positive()).min(1, "Укажите участников"),
});

const sendMessageSchema = z.object({
  body: z.string().min(1, "Введите сообщение"),
});

const editMessageSchema = z.object({
  body: z.string().min(1, "Введите сообщение"),
});

export function registerChatRoutes(
  app: Express,
  authenticate: (req: Request, res: Response, next: () => void) => void
): void {
  app.get("/api/chat/conversations", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const conversations = await listConversationsForUser(user.id);
      res.json(conversations);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ошибка";
      res.status(500).json({ message });
    }
  });

  app.post("/api/chat/conversations/direct", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const { otherUserId } = createDirectSchema.parse(req.body);

      if (otherUserId === user.id) {
        return res.status(400).json({ message: "Нельзя создать диалог с самим собой" });
      }

      const other = await storage.getUser(otherUserId);
      if (!other || !other.isActive) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      const conversation = await createDirectConversation(user.id, otherUserId);
      res.status(201).json(conversation);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "Некорректные данные" });
      }
      const message = error instanceof Error ? error.message : "Ошибка";
      res.status(500).json({ message });
    }
  });

  app.post("/api/chat/conversations/group", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const { title, memberIds } = createGroupSchema.parse(req.body);

      const uniqueMemberIds = [...new Set(memberIds.filter((id) => id !== user.id))];
      for (const memberId of uniqueMemberIds) {
        const member = await storage.getUser(memberId);
        if (!member || !member.isActive) {
          return res.status(400).json({ message: `Пользователь #${memberId} не найден` });
        }
      }

      const conversation = await createGroupConversation(user.id, title, uniqueMemberIds);
      res.status(201).json(conversation);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "Некорректные данные" });
      }
      const message = error instanceof Error ? error.message : "Ошибка";
      res.status(400).json({ message });
    }
  });

  app.get("/api/chat/conversations/:id/messages", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const conversationId = parseInt(req.params.id, 10);
      const page = parseInt(String(req.query.page ?? "1"), 10);
      const limit = parseInt(String(req.query.limit ?? "50"), 10);

      const result = await listMessages(conversationId, user.id, page, limit);
      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ошибка";
      const status = message === "Диалог не найден" ? 404 : 500;
      res.status(status).json({ message });
    }
  });

  app.post("/api/chat/conversations/:id/messages", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const conversationId = parseInt(req.params.id, 10);
      const { body } = sendMessageSchema.parse(req.body);

      const message = await sendMessage(conversationId, user.id, body);
      res.status(201).json(message);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "Некорректные данные" });
      }
      const message = error instanceof Error ? error.message : "Ошибка";
      const status = message === "Диалог не найден" ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.post("/api/chat/conversations/:id/read", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const conversationId = parseInt(req.params.id, 10);
      await markConversationRead(conversationId, user.id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ошибка";
      res.status(500).json({ message });
    }
  });

  app.delete("/api/chat/conversations/:id", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const conversationId = parseInt(req.params.id, 10);
      await leaveConversation(conversationId, user.id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ошибка";
      const status = message === "Диалог не найден" ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.patch("/api/chat/conversations/:id/messages/:messageId", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const messageId = parseInt(req.params.messageId, 10);
      const { body } = editMessageSchema.parse(req.body);
      const message = await updateMessage(messageId, user.id, body);
      res.json(message);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message ?? "Некорректные данные" });
      }
      const message = error instanceof Error ? error.message : "Ошибка";
      const status =
        message === "Сообщение не найдено" || message === "Диалог не найден" ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.delete("/api/chat/conversations/:id/messages/:messageId", authenticate, async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const messageId = parseInt(req.params.messageId, 10);
      const message = await deleteMessage(messageId, user.id);
      res.json(message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ошибка";
      const status =
        message === "Сообщение не найдено" || message === "Диалог не найден" ? 404 : 400;
      res.status(status).json({ message });
    }
  });
}
