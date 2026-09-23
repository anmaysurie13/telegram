// Shows where Telegram is sending messages and the last delivery error, if any.
// Usage: npm run webhook-info
const res = await fetch(
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`
);
console.log(JSON.stringify(await res.json(), null, 2));
