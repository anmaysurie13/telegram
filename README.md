# Meera Drafts Bot

Meera sends a note to a Telegram bot. The bot scores the note, finds a related news story, drafts a post in her voice, and replies in the same chat. She replies APPROVE or REJECT, and every note and draft is kept in Supabase.

```
note ──▶ 1. Gemini scores it 0-10 ──(below 6)──▶ "Not drafted — score N/10" (note saved)
                    │ 6 or more
                    ▼
         2. Gemini picks a search phrase ──▶ Google News (RSS, no key) ──▶ top story
                    ▼
         3. Gemini drafts: note + voice guide + story (used only if it fits)
                    ▼
         4. Draft sent to Telegram (+ NEWS SOURCE block if the story was used)
            note + draft saved in Supabase, draft status = pending
                    ▼
         5. Reply APPROVE / REJECT ──▶ draft status = approved / rejected
```

## Files

| File | What it does |
|---|---|
| `api/telegram.js` | The webhook Telegram calls for each message. Checks the sender, runs the pipeline, saves results, handles APPROVE/REJECT. |
| `lib/pipeline.js` | Score → news → draft, and the NEWS SOURCE block. The pass mark (`MIN_SCORE = 6`) is here. |
| `lib/gemini.js` | Gemini calls: `scoreNote`, `extractNewsKeywords`, `draftPost`. |
| `lib/news.js` | `fetchNews`: Google News search through its public RSS feed. |
| `lib/db.js` | Supabase: `saveNote`, `saveDraft`, `findPendingDraft`, `updateDraftStatus`, voice skill. |
| `supabase/schema.sql` | Creates the `notes`, `drafts` and `voice_skill` tables. Run once in Supabase. |
| `scripts/seed-voice.js` | Copies the voice guide file into the `voice_skill` table. |
| `lib/telegram.js` | Sends messages back to Telegram and splits long drafts over 4096 characters. |
| `lib/voice.js` | Loads the voice guide (Supabase first, then the file) and the drafting task instructions. |
| `voice/voice-instructions.md` | **Paste Meera's voice guide here.** |
| `scripts/set-webhook.js` | Connects the bot to your Vercel URL. Run once after deploying. |
| `scripts/webhook-info.js` | Shows Telegram's view of the webhook and its last error. |
| `scripts/test-draft.js` | Runs one note through score → news → draft locally, without Telegram or the database. |
| `vercel.json` | Allows up to 60s per request and bundles the `voice/` folder. |
| `.env.example` | The environment variables you need. |

There are no npm dependencies. Everything uses Node's built-in `fetch` (Node 20+).

## Setup

### 1. Create the bot
In Telegram, message **@BotFather**, send `/newbot`, and follow the prompts. Copy the token it gives you.

### 2. Get a Gemini API key
Go to https://aistudio.google.com/apikey and create a key.

### 3. Add the voice instructions
Replace the contents of `voice/voice-instructions.md` with the full voice guide. The bot won't draft anything while the placeholder is still in that file.

### 4. Fill in `.env` (for the local scripts)
```bash
cp .env.example .env
```
Fill in `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, and `TELEGRAM_WEBHOOK_SECRET`. For the secret, make up any long random string using letters, numbers, `_` and `-`.

Optional: check that Gemini and the voice guide work before deploying:
```bash
npm run test-draft -- "23% of returns last year came from humid cities. Want to explain why."
```

### 5. Deploy to Vercel
Push this folder to GitHub and import it at https://vercel.com/new. No build settings are needed. Alternatively, run `npx vercel` in this folder.

In **Project → Settings → Environment Variables**, add:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional, defaults to `gemini-3.6-flash`)
- `ALLOWED_CHAT_IDS` (leave empty for now)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see step 8)

Redeploy after adding the variables so they take effect.

### 6. Connect Telegram to Vercel
Put your deployment URL in `.env` as `PUBLIC_URL` (for example `https://meera-drafts-bot.vercel.app`), then run:
```bash
npm run set-webhook
```

### 7. Lock the bot to Meera
Have Meera send `/start` to the bot. It replies with her chat ID. Add that ID to `ALLOWED_CHAT_IDS` in Vercel and redeploy. After that, the bot ignores everyone else, so strangers can't use up your Gemini quota.

### 8. Set up Supabase
1. Create a project at https://supabase.com.
2. In **SQL Editor → New query**, paste the contents of `supabase/schema.sql` and click **Run**.
3. From **Project Settings → API**, copy the Project URL and the `service_role` key into `.env` and into Vercel as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy.
4. Load the voice guide into the `voice_skill` table:
   ```bash
   npm run seed-voice
   ```

Until Supabase is set up, the bot still scores and drafts, but tells you each result was not saved, and APPROVE/REJECT can't be recorded.

## Using it
Meera sends a note as a normal text message. The note is scored first: reminders, to-dos and half-thoughts score low and are not drafted, and the bot says why. A note that passes gets a draft as a reply. If the draft uses a news story, a NEWS SOURCE block with the headline, publication, date and link is added at the end, and she should check that story before publishing. Replying APPROVE or REJECT to the draft (or sending it on its own, for the latest pending draft) records her decision. By default it writes a LinkedIn post. If the note mentions "newsletter", it writes a newsletter. If the note is missing data the post needs, the draft marks the spot with `[DATA NEEDED: …]` so nothing gets made up.

## Troubleshooting
- **The bot doesn't reply.** Run `npm run webhook-info` and look at `last_error_message`. Also check **Vercel → Project → Logs**.
- **It replies "Something went wrong".** The Vercel logs show the real error. Common causes are a wrong Gemini key, a model name that no longer exists (set `GEMINI_MODEL` to a current one), or a missing voice file.
- **Changing the voice.** Edit `voice/voice-instructions.md`, then run `npm run seed-voice` (the bot reads the Supabase copy first) and redeploy.
- **Too many or too few notes passing.** Adjust `SCORING_PROMPT` in `lib/gemini.js` or `MIN_SCORE` in `lib/pipeline.js`.
- **Changing the task** (post length, format, and so on). Edit the `TASK` text in `lib/voice.js`.
