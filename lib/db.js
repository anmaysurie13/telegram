// Supabase persistence over a direct Postgres connection (DATABASE_URL).
// Server-side only: the connection string contains the database password and
// must never reach Telegram, logs, or the repo.
import pg from "pg";

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

let pool;
function db() {
  if (!isDbConfigured()) throw new Error("DATABASE_URL is not set.");
  // One small pool per warm serverless instance. On Vercel, use Supabase's
  // transaction pooler (port 6543), which is built for short-lived connections.
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  return pool;
}

async function one(sql, params) {
  const { rows } = await db().query(sql, params);
  return rows[0] || null;
}

export async function saveNote({ content, score, scoreReason }) {
  return one(
    "insert into public.notes (content, score, score_reason) values ($1, $2, $3) returning *",
    [content, score, scoreReason]
  );
}

export async function saveDraft({ noteId, chatId, telegramMessageId, content }) {
  return one(
    `insert into public.drafts (note_id, chat_id, telegram_message_id, content, status)
     values ($1, $2, $3, $4, 'pending') returning *`,
    [noteId, chatId, telegramMessageId, content]
  );
}

// The draft being replied to if the reply points at one, otherwise the most
// recent pending draft in that chat.
export async function findPendingDraft({ chatId, replyToMessageId }) {
  if (replyToMessageId) {
    const row = await one(
      `select id, status, telegram_message_id from public.drafts
       where chat_id = $1 and status = 'pending' and telegram_message_id = $2 limit 1`,
      [chatId, replyToMessageId]
    );
    if (row) return row;
  }
  return one(
    `select id, status, telegram_message_id from public.drafts
     where chat_id = $1 and status = 'pending' order by created_at desc limit 1`,
    [chatId]
  );
}

// Only moves drafts that are still pending, so a decided draft can't be
// flipped by a stray reply. Nothing is ever deleted.
export async function updateDraftStatus(id, status) {
  const row = await one(
    "update public.drafts set status = $2 where id = $1 and status = 'pending' returning *",
    [id, status]
  );
  if (!row) throw new Error(`Draft ${id} was not pending, so its status was not changed.`);
  return row;
}

export async function getDraft(id) {
  return one("select * from public.drafts where id = $1", [id]);
}

export async function getVoiceSkill() {
  const row = await one("select content from public.voice_skill order by updated_at desc limit 1");
  return row?.content || null;
}

export async function saveVoiceSkill(content) {
  const existing = await one("select id from public.voice_skill order by updated_at desc limit 1");
  return existing
    ? one("update public.voice_skill set content = $2 where id = $1 returning *", [existing.id, content])
    : one("insert into public.voice_skill (content) values ($1) returning *", [content]);
}

// Lets scripts exit cleanly.
export async function closeDb() {
  await pool?.end();
  pool = undefined;
}
