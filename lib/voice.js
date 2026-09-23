import { readFileSync } from "node:fs";
import path from "node:path";

const VOICE_FILE = path.join(process.cwd(), "voice", "voice-instructions.md");
const PLACEHOLDER = "VOICE_INSTRUCTIONS_PLACEHOLDER";

// What the bot is asking Gemini to do. The voice file says HOW she writes;
// this says WHAT to produce from a note.
const TASK = `You turn rough notes from Meera Pillai, founder of Skinstinct, into a
ready-to-review draft post written in her voice.

Rules for this task:
- Follow the voice guide below exactly. It overrides any habit of yours.
- Default to a LinkedIn post unless the note asks for a newsletter or another format.
- Use only facts, numbers, studies and anecdotes that appear in the note. Never invent
  any. Where the post needs data the note does not give, write [DATA NEEDED: what].
- Reply with the draft only: no preamble, no title, no explanation, no Markdown
  formatting, no options. Plain text that can be pasted straight into LinkedIn.`;

let cached;

export function getSystemPrompt() {
  if (cached) return cached;

  let voice = "";
  try {
    voice = readFileSync(VOICE_FILE, "utf8").trim();
  } catch {
    // Fall through to the env var below.
  }
  if (!voice || voice.includes(PLACEHOLDER)) {
    voice = (process.env.VOICE_INSTRUCTIONS || "").trim();
  }
  if (!voice) {
    throw new Error(
      "Voice instructions are missing. Paste them into voice/voice-instructions.md and redeploy."
    );
  }

  cached = `${TASK}\n\n===== VOICE GUIDE =====\n\n${voice}`;
  return cached;
}
