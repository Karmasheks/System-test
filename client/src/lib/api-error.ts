export function parseApiErrorMessage(error: unknown, fallback = "Ошибка"): string {
  if (error instanceof Error) {
    const text = error.message;
    const jsonMatch = text.match(/^\d{3}: (.+)$/s);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (typeof parsed?.message === "string") {
          if (parsed.message.includes("API не найден")) {
            return "Сервер не обновлён. Перезапустите npm run dev и попробуйте снова.";
          }
          return parsed.message;
        }
      } catch {
        return jsonMatch[1].slice(0, 200);
      }
    }
    return text || fallback;
  }
  return fallback;
}
