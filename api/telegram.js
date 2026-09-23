import { draftPost } from "../lib/gemini.js";
import { sendMessage, sendTyping } from "../lib/telegram.js";

const HELP = `Send me a note as a text message and I'll reply with a draft post in your voice.

Rough is fine: bullet points, half sentences, numbers you want to use. Mention "newsletter" in the note if you want a newsletter instead of a LinkedIn post.`;

function allowedChats() {
  return (process.env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Telegram calls this URL (the webhook) once for every message sent to the bot.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Meera drafts bot is running.");
  }

  // Reject anything that isn't Telegram. Telegram echoes the secret we gave
  // it in setWebhook on every request.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).send("Unauthorized");
  }

  const message = req.body?.message;
  if (!message?.chat) {
    return res.status(200).send("ignored"); // edits, channel posts, etc.
  }
  const chatId = message.chat.id;

  try {
    // Only Meera (and anyone else listed) can use the bot, so strangers who
    // find it can't spend the Gemini quota.
    const allowed = allowedChats();
    if (allowed.length && !allowed.includes(String(chatId))) {
      await sendMessage(chatId, "Sorry, this bot is private.");
      return res.status(200).send("forbidden chat");
    }
    if (!allowed.length) {
      console.warn(`ALLOWED_CHAT_IDS is empty; chat ${chatId} is using the bot.`);
    }

    const text = (message.text || "").trim();

    if (!text) {
      await sendMessage(chatId, "I can only read text notes for now. Please type the note out.");
      return res.status(200).send("no text");
    }

    if (text.startsWith("/start") || text.startsWith("/help")) {
      const idLine = allowed.length ? "" : `\n\n(Setup: this chat's ID is ${chatId}. Add it to ALLOWED_CHAT_IDS in Vercel.)`;
      await sendMessage(chatId, HELP + idLine);
      return res.status(200).send("help");
    }

    await sendTyping(chatId);
    const draft = await draftPost(text);
    await sendMessage(chatId, draft, message.message_id);
    return res.status(200).send("drafted");
  } catch (err) {
    console.error(err);
    await sendMessage(
      chatId,
      "Something went wrong while drafting that one. Please try again in a minute."
    ).catch(() => {});
    // Still 200: a non-2xx makes Telegram resend the same message repeatedly.
    return res.status(200).send("error");
  }
}
