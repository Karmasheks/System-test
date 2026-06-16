export function getErrorStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^(\d{3}):/);
  return match ? Number(match[1]) : null;
}

export function isUnauthorizedError(error: unknown): boolean {
  return getErrorStatus(error) === 401;
}

export function isTransientServerError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 503 || status === 500 || status === 502 || status === 504;
}

export function parseApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message;
  if (msg.includes("Unexpected token") && msg.includes("<")) {
    return "Сервер не поддерживает этот запрос. Перезапустите dev-сервер (npm run dev) или задеплойте последнюю версию.";
  }
  const raw = msg.replace(/^\d+:\s*/, "");
  if (raw.trimStart().startsWith("<!")) {
    return "Сервер вернул HTML вместо данных. Перезапустите dev-сервер или обновите деплой.";
  }
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    return parsed.message ?? raw;
  } catch {
    return raw || fallback;
  }
}
