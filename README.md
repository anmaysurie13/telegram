# Meera Drafts Bot

Meera sends a note to a Telegram bot. The bot sends that note to Gemini along with her voice instructions and replies in the same chat with a draft post.

```
Meera (Telegram) ──note──▶ Telegram ──webhook──▶ Vercel: /api/telegram
                                                      │
                                                      ├─▶ Gemini (note + voice guide)
                                                      │
Meera (Telegram) ◀──draft── Telegram ◀──sendMessage───┘
```

## Files

| File | What it does |
|---|---|
| `api/telegram.js` | The webhook Telegram calls for each message. Checks the sender, calls Gemini, replies. |
| `lib/gemini.js` | Calls the Gemini API. |
| `lib/telegram.js` | Sends messages back to Telegram and splits long drafts over 4096 characters. |
| `lib/voice.js` | Loads the voice instructions and the task instructions sent to Gemini. |
| `voice/voice-instructions.md` | **Paste Meera's voice guide here.** |
| `scripts/set-webhook.js` | Connects the bot to your Vercel URL. Run once after deploying. |
| `scripts/webhook-info.js` | Shows Telegram's view of the webhook and its last error. |
| `scripts/test-draft.js` | Tests a draft locally without Telegram. |
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

Redeploy after adding the variables so they take effect.

### 6. Connect Telegram to Vercel
Put your deployment URL in `.env` as `PUBLIC_URL` (for example `https://meera-drafts-bot.vercel.app`), then run:
```bash
npm run set-webhook
```

### 7. Lock the bot to Meera
Have Meera send `/start` to the bot. It replies with her chat ID. Add that ID to `ALLOWED_CHAT_IDS` in Vercel and redeploy. After that, the bot ignores everyone else, so strangers can't use up your Gemini quota.

## Using it
Meera sends a note as a normal text message. Rough bullet points are fine. The bot shows "typing…" and replies to her message with the draft. By default it writes a LinkedIn post. If the note mentions "newsletter", it writes a newsletter. If the note is missing data the post needs, the draft marks the spot with `[DATA NEEDED: …]` so nothing gets made up.

## Troubleshooting
- **The bot doesn't reply.** Run `npm run webhook-info` and look at `last_error_message`. Also check **Vercel → Project → Logs**.
- **It replies "Something went wrong".** The Vercel logs show the real error. Common causes are a wrong Gemini key, a model name that no longer exists (set `GEMINI_MODEL` to a current one), or a missing voice file.
- **Changing the voice.** Edit `voice/voice-instructions.md` and redeploy.
- **Changing the task** (post length, format, and so on). Edit the `TASK` text in `lib/voice.js`.
