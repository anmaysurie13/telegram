// Points the Telegram bot at the deployed Vercel function.
// Usage: npm run set-webhook   (reads .env)
const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, PUBLIC_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN || !PUBLIC_URL) {
  console.error("Set TELEGRAM_BOT_TOKEN and PUBLIC_URL in .env first.");
  process.exit(1);
}

const url = `${PUBLIC_URL.replace(/\/+$/, "")}/api/telegram`;
const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    allowed_updates: ["message"],
    drop_pending_updates: true,
    ...(TELEGRAM_WEBHOOK_SECRET ? { secret_token: TELEGRAM_WEBHOOK_SECRET } : {}),
  }),
});
const data = await res.json();
console.log(data.ok ? `Webhook set to ${url}` : `Failed: ${data.description}`);
if (!data.ok) process.exit(1);
