import { scoreNote, extractNewsKeywords, draftPost } from "./gemini.js";
import { fetchNews } from "./news.js";
import { getSystemPrompt } from "./voice.js";

export const MIN_SCORE = 6;

const RULE = "─────────────────────────────────";

export function newsSourceBlock(news) {
  return [
    RULE,
    `NEWS SOURCE: ${news.headline}`,
    `FROM: ${news.source} · ${news.date}`,
    `LINK: ${news.url}`,
    "⚠ Check this before publishing — you are the author of this claim",
    RULE,
  ].join("\n");
}

function log(event, data) {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...data }));
}

// Runs one note through B1.1 (score) and, if it passes, B1.2 (news + draft).
// Returns what happened, including `steps` (which calls were made) so tests
// can confirm that rejected notes never reach news search or drafting.
export async function processNote(note) {
  const steps = [];

  // B1.1 — score before anything else. A scoring failure stops the run: the
  // note is never drafted unscored.
  steps.push("score");
  const { score, reason } = await scoreNote(note);
  log("note_scored", { note, score, reason });

  if (score < MIN_SCORE) {
    return { status: "rejected", score, reason, steps };
  }

  // B1.2 — news angle. Failures here are not fatal: the draft is written from
  // the note alone and the failure is reported back.
  let phrase = null;
  let news = null;
  let newsError = null;
  try {
    steps.push("keywords");
    phrase = await extractNewsKeywords(note);
    steps.push("news");
    news = await fetchNews(phrase);
  } catch (err) {
    newsError = err.message;
    console.error("News step failed, drafting without news:", err);
  }
  log("news_lookup", { phrase, news, newsError });

  steps.push("draft");
  const systemPrompt = await getSystemPrompt();
  const { draft, usedNews } = await draftPost(note, { systemPrompt, news });
  const text = usedNews ? `${draft}\n\n${newsSourceBlock(news)}` : draft;
  log("drafted", { score, usedNews, length: text.length });

  return { status: "drafted", score, reason, phrase, news, newsError, usedNews, text, steps };
}
