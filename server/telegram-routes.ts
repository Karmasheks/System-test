import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import {
  getTelegramBotUsername,
  handleTelegramUpdate,
  isTelegramConfigured,
} from "./telegram-bot";

function generateTelegramLinkCode(): string {
  const n = Math.floor(10000 + Math.random() * 90000);
  return `SL-${n}`;
}

type AuthMiddleware = (req: Request, res: Response, next: Function) => void;

export function registerTelegramRoutes(app: Express, authenticate: AuthMiddleware): void {
  app.get("/api/telegram/health", (_req, res) => {
    res.json({
      configured: isTelegramConfigured(),
      botUsername: getTelegramBotUsername() ?? process.env.TELEGRAM_BOT_USERNAME ?? null,
    });
  });

  app.post("/api/telegram/webhook", (req, res) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const header = req.header("X-Telegram-Bot-Api-Secret-Token");
      if (header !== secret) {
        console.warn("Telegram webhook: неверный secret_token");
        return res.status(403).end();
      }
    }

    // Telegram ждёт быстрый 200 — обработка в фоне (медленная БД не должна вызывать timeout)
    res.status(200).end();

    void (async () => {
      try {
        await handleTelegramUpdate(req.body as Record<string, unknown>);
      } catch (err) {
        console.error("Telegram webhook error:", err);
      }
    })();
  });

  app.get("/api/auth/telegram", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });

      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const botUsername = getTelegramBotUsername() ?? process.env.TELEGRAM_BOT_USERNAME ?? null;

      return res.json({
        configured: isTelegramConfigured(),
        linked: Boolean(user.telegramChatId),
        telegramUsername: user.telegramUsername ?? null,
        botUsername,
        botUrl: botUsername ? `https://t.me/${botUsername}` : null,
        pendingCode: user.telegramLinkCode ?? null,
        pendingCodeExpiresAt: user.telegramLinkCodeExpiresAt?.toISOString() ?? null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка";
      return res.status(500).json({ message });
    }
  });

  app.post("/api/auth/telegram/link-code", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });

      if (!isTelegramConfigured()) {
        return res.status(503).json({ message: "Telegram не настроен на сервере" });
      }

      const code = generateTelegramLinkCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await storage.updateUser(req.user.id, {
        telegramLinkCode: code,
        telegramLinkCodeExpiresAt: expiresAt,
      });

      const botUsername = getTelegramBotUsername() ?? process.env.TELEGRAM_BOT_USERNAME ?? null;

      return res.json({
        code,
        expiresAt: expiresAt.toISOString(),
        botUsername,
        botUrl: botUsername ? `https://t.me/${botUsername}` : null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка";
      return res.status(500).json({ message });
    }
  });

  app.post("/api/auth/telegram/unlink", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });

      await storage.updateUser(req.user.id, {
        telegramChatId: null,
        telegramUsername: null,
        telegramLinkedAt: null,
        telegramLinkCode: null,
        telegramLinkCodeExpiresAt: null,
      });

      return res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ошибка";
      return res.status(500).json({ message });
    }
  });
}
