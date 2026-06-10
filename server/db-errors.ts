/** Ошибки сети/БД — не путать с невалидным JWT. */
export function isDatabaseConnectivityError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: string; message?: string; errno?: string };
  const code = String(err.code ?? err.errno ?? "");
  const message = String(err.message ?? error);
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "EPIPE" ||
    code === "ECONNABORTED" ||
    code === "CONNECT_TIMEOUT" ||
    message.includes("CONNECT_TIMEOUT") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND") ||
    /connect.*timeout/i.test(message) ||
    /connection.*terminated/i.test(message)
  );
}

export const DB_UNAVAILABLE_MESSAGE =
  "База данных временно недоступна. Попробуйте обновить страницу через минуту.";
