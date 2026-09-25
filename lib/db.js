// Supabase persistence through its REST API (PostgREST). Server-side only:
// uses the service role key, which must never reach Telegram or the browser.

export function isDbConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  if (!isDbConfigured()) throw new Error("Supabase is not configured.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    signal: AbortSignal.timeout(8_000),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path.split("?")[0]} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function saveNote({ content, score, scoreReason }) {
  const [row] = await rest("notes", {
    method: "POST",
    prefer: "return=representation",
    body: { content, score, score_reason: scoreReason },
  });
  return row;
}

export async function saveDraft({ noteId, chatId, telegramMessageId, content }) {
  const [row] = await rest("drafts", {
    method: "POST",
    prefer: "return=representation",
    body: {
      note_id: noteId,
      chat_id: chatId,
      telegram_message_id: telegramMessageId,
      content,
      status: "pending",
    },
  });
  return row;
}

// The draft being replied to if the reply points at one, otherwise the most
// recent pending draft in that chat.
export async function findPendingDraft({ chatId, replyToMessageId }) {
  const base = `drafts?select=id,status,telegram_message_id&chat_id=eq.${chatId}&status=eq.pending`;
  if (replyToMessageId) {
    const [row] = await rest(`${base}&telegram_message_id=eq.${replyToMessageId}&limit=1`);
    if (row) return row;
  }
  const [row] = await rest(`${base}&order=created_at.desc&limit=1`);
  return row || null;
}

// Only moves drafts that are still pending, so a decided draft can't be
// flipped by a stray reply. Nothing is ever deleted.
export async function updateDraftStatus(id, status) {
  const [row] = await rest(`drafts?id=eq.${id}&status=eq.pending`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { status },
  });
  if (!row) throw new Error(`Draft ${id} was not pending, so its status was not changed.`);
  return row;
}

export async function getDraft(id) {
  const [row] = await rest(`drafts?select=*&id=eq.${id}`);
  return row || null;
}

export async function getVoiceSkill() {
  const [row] = await rest("voice_skill?select=content&order=updated_at.desc&limit=1");
  return row?.content || null;
}

export async function saveVoiceSkill(content) {
  const [existing] = await rest("voice_skill?select=id&order=updated_at.desc&limit=1");
  const opts = { prefer: "return=representation", body: { content } };
  if (existing) return rest(`voice_skill?id=eq.${existing.id}`, { method: "PATCH", ...opts });
  return rest("voice_skill", { method: "POST", ...opts });
}
