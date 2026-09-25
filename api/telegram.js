import { processNote, MIN_SCORE } from "../lib/pipeline.js";
import { sendMessage, sendTyping } from "../lib/telegram.js";
import { isDbConfigured, saveNote, saveDraft, findPendingDraft, updateDraftStatus } from "../lib/db.js";

const HELP = `Send me a note as a text message and I'll reply with a draft post in your voice.

Rough is fine: bullet points, half sentences, numbers you want to use. Mention "newsletter" in the note if you want a newsletter instead of a LinkedIn post.

Notes are scored first. Reminders and half-thoughts are not drafted.

Reply APPROVE or REJECT to a draft to record your decision.`;

const NOT_SAVED = "Not saved: the database isn't set up yet (DATABASE_URL).";

function allowedChats() {
  return (process.env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Saves to Supabase without letting a database problem lose the Telegram
// reply. Returns { row } on success, or { error } describing why it wasn't saved.
async function trySave(fn) {
  if (!isDbConfigured()) return { error: NOT_SAVED };
  try {
    return { row: await fn() };
  } catch (err) {
    console.error(err);
    return { error: "Not saved: the database returned an error. Check the Vercel logs." };
  }
}

async function handleDecision(chatId, decision, replyToMessageId) {
  if (!isDbConfigured()) {
    await sendMessage(chatId, `Couldn't record ${decision}. ${NOT_SAVED}`);
    return "decision: no db";
  }
  const status = decision === "APPROVE" ? "approved" : "rejected";
  const pending = await findPendingDraft({ chatId, replyToMessageId });
  if (!pending) {
    await sendMessage(chatId, "There's no pending draft to update.");
    return "decision: none pending";
  }
  await updateDraftStatus(pending.id, status);
  console.log(JSON.stringify({ event: "draft_status", at: new Date().toISOString(), draftId: pending.id, status }));
  await sendMessage(chatId, `Draft #${pending.id} marked ${status}.`);
  return `decision: ${status}`;
}

async function handleNote(chatId, text, messageId) {
  await sendTyping(chatId);
  const result = await processNote(text);

  const note = await trySave(() =>
    saveNote({ content: text, score: result.score, scoreReason: result.reason })
  );

  if (result.status === "rejected") {
    const lines = [
      `Not drafted — score ${result.score}/10. ${result.reason}`,
      "Add the main idea, experience, or takeaway and try again.",
    ];
    if (note.error) lines.push("", note.error);
    await sendMessage(chatId, lines.join("\n"), messageId);
    return "rejected";
  }

  const draftMessageId = await sendMessage(chatId, result.text, messageId);

  const draft = note.row
    ? await trySave(() =>
        saveDraft({ noteId: note.row.id, chatId, telegramMessageId: draftMessageId, content: result.text })
      )
    : { error: note.error };

  const footer = [`Score ${result.score}/10 (pass mark ${MIN_SCORE}).`];
  if (result.newsError) footer.push("News search failed, so this draft uses the note only.");
  else if (!result.news) footer.push("No news result found, so this draft uses the note only.");
  else if (!result.usedNews) footer.push("A news item was found but didn't fit, so it wasn't used.");
  footer.push(draft.row ? `Saved as draft #${draft.row.id} (pending). Reply APPROVE or REJECT.` : draft.error);
  await sendMessage(chatId, footer.join("\n"));
  return "drafted";
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
    // find it can't spend the API quota.
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

    const decision = text.toUpperCase().replace(/[.!\s]+$/, "");
    if (decision === "APPROVE" || decision === "REJECT") {
      const outcome = await handleDecision(chatId, decision, message.reply_to_message?.message_id);
      return res.status(200).send(outcome);
    }

    return res.status(200).send(await handleNote(chatId, text, message.message_id));
  } catch (err) {
    console.error(err);
    await sendMessage(chatId, "Something went wrong with that one, so nothing was drafted or updated. Please try again in a minute.").catch(() => {});
    // Still 200: a non-2xx makes Telegram resend the same message repeatedly.
    return res.status(200).send("error");
  }
}
