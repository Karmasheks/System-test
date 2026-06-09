/**
 * Регистрация webhook Telegram.
 * npm run telegram:webhook
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const base = process.env.APP_PUBLIC_URL?.replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !base) {
  console.error("Нужны TELEGRAM_BOT_TOKEN и APP_PUBLIC_URL в .env");
  process.exit(1);
}

const url = `${base}/api/telegram/webhook`;

const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const meData = await meRes.json();
if (!meData.ok) {
  console.error("getMe:", meData.description);
  process.exit(1);
}
console.log("Бот:", meData.result.username);

const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    allowed_updates: ["message"],
    ...(secret ? { secret_token: secret } : {}),
  }),
});
const setData = await setRes.json();
if (!setData.ok) {
  console.error("setWebhook:", setData.description);
  process.exit(1);
}

console.log("Webhook:", url);
console.log("Готово.");
