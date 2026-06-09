import type { User } from "@shared/schema";

/** Поля пользователя для API (без пароля и секретов Telegram). */
export function serializeUserForClient(
  user: User,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const {
    password: _pw,
    telegramChatId: _chat,
    telegramLinkCode: _code,
    telegramLinkCodeExpiresAt: _exp,
    ...safe
  } = user;
  return {
    ...safe,
    telegramLinked: Boolean(user.telegramChatId),
    ...extra,
  };
}
