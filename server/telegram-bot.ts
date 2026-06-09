import { storage } from "./storage";
import { log } from "./vite";

const TELEGRAM_API = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.APP_PUBLIC_URL);
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  return token;
}

let cachedBotUsername: string | null = process.env.TELEGRAM_BOT_USERNAME ?? null;

export function getTelegramBotUsername(): string | null {
  return cachedBotUsername;
}

async function telegramApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: T };
  if (!data.ok) {
    throw new Error(data.description ?? `Telegram API ${method} failed`);
  }
  return data.result as T;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!isTelegramConfigured()) return;
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

export async function notifyTelegramUser(
  userId: number,
  title: string,
  message: string
): Promise<void> {
  if (!isTelegramConfigured()) return;
  try {
    const user = await storage.getUser(userId);
    if (!user?.telegramChatId) return;
    const body = message.trim().length > 0 ? `\n\n${message.trim()}` : "";
    await sendTelegramMessage(user.telegramChatId, `🔔 ${title}${body}`);
  } catch (err) {
    console.error("Telegram notify error:", err);
  }
}

function normalizeLinkCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

const HELP_TEXT =
  "Команды:\n" +
  "/start — начать и подключить аккаунт\n" +
  "/status — статус подключения\n" +
  "/help — эта подсказка\n\n" +
  "Подключение: Профиль → Уведомления → Telegram → получить код → отправить код сюда.";

async function reply(chatId: number, text: string): Promise<void> {
  await sendTelegramMessage(String(chatId), text);
}

async function linkAccountByCode(
  chatId: number,
  username: string | undefined,
  code: string
): Promise<void> {
  const normalized = normalizeLinkCode(code);
  if (!/^SL-\d{5}$/.test(normalized)) {
    await reply(
      chatId,
      "Неверный формат кода. Пример: SL-48291\nКод из раздела «Профиль → Уведомления → Telegram»."
    );
    return;
  }

  const user = await storage.getUserByTelegramLinkCode(normalized);
  if (!user) {
    await reply(chatId, "Код не найден. Получите новый код в личном кабинете StarLine.");
    return;
  }

  if (
    user.telegramLinkCodeExpiresAt &&
    user.telegramLinkCodeExpiresAt.getTime() < Date.now()
  ) {
    await reply(chatId, "Код истёк. Получите новый в профиле StarLine (действует 15 минут).");
    return;
  }

  const chatIdStr = String(chatId);
  const existing = await storage.getUserByTelegramChatId(chatIdStr);
  if (existing && existing.id !== user.id) {
    await storage.updateUser(existing.id, {
      telegramChatId: null,
      telegramUsername: null,
      telegramLinkedAt: null,
    });
  }

  await storage.updateUser(user.id, {
    telegramChatId: chatIdStr,
    telegramUsername: username ?? null,
    telegramLinkedAt: new Date(),
    telegramLinkCode: null,
    telegramLinkCodeExpiresAt: null,
  });

  await reply(
    chatId,
    `✅ Аккаунт подключён: ${user.name}\n\nУведомления StarLine будут приходить сюда.`
  );
}

export async function handleTelegramUpdate(update: Record<string, unknown>): Promise<void> {
  const message = update.message as
    | {
        chat?: { id: number };
        text?: string;
        from?: { username?: string };
      }
    | undefined;

  if (!message?.chat?.id || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const username = message.from?.username;

  if (text === "/start" || text.startsWith("/start ")) {
    await reply(
      chatId,
      "Здравствуйте! Это бот StarLine SLMS.\n\n" +
        "1. Откройте сайт → Профиль → Уведомления → Telegram\n" +
        "2. Нажмите «Получить код»\n" +
        "3. Отправьте код сюда (например SL-48291)\n\n" +
        HELP_TEXT
    );
    return;
  }

  if (text === "/help") {
    await reply(chatId, HELP_TEXT);
    return;
  }

  if (text === "/status") {
    const user = await storage.getUserByTelegramChatId(String(chatId));
    if (user) {
      await reply(chatId, `✅ Подключён: ${user.name} (${user.email})`);
    } else {
      await reply(chatId, "❌ Аккаунт не подключён. Отправьте /start и код из профиля.");
    }
    return;
  }

  if (normalizeLinkCode(text).startsWith("SL-")) {
    await linkAccountByCode(chatId, username, text);
    return;
  }

  await reply(
    chatId,
    "Отправьте код из профиля (SL-XXXXX) или /help для помощи."
  );
}

export async function registerTelegramWebhook(): Promise<void> {
  if (!isTelegramConfigured()) {
    log("Telegram: пропуск webhook (нет TELEGRAM_BOT_TOKEN или APP_PUBLIC_URL)");
    return;
  }

  const base = process.env.APP_PUBLIC_URL!.replace(/\/$/, "");
  const url = `${base}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  try {
    const me = await telegramApi<{ username?: string }>("getMe");
    if (me.username) {
      cachedBotUsername = me.username;
    }

    await telegramApi("setWebhook", {
      url,
      allowed_updates: ["message"],
      ...(secret ? { secret_token: secret } : {}),
    });

    log(`Telegram: webhook → ${url} (@${cachedBotUsername ?? "bot"})`);
  } catch (err) {
    console.error("Telegram webhook registration failed:", err);
  }
}

export async function initTelegramBot(): Promise<void> {
  if (!isTelegramConfigured()) return;
  await registerTelegramWebhook();
}
