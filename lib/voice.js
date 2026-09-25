import { readFileSync } from "node:fs";
import path from "node:path";
import { isDbConfigured, getVoiceSkill } from "./db.js";

const VOICE_FILE = path.join(process.cwd(), "voice", "voice-instructions.md");
const PLACEHOLDER = "VOICE_INSTRUCTIONS_PLACEHOLDER";

// What the bot is asking the model to do. The voice guide says HOW she writes;
// this says WHAT to produce from a note.
const TASK = `You turn rough notes from Meera Pillai, founder of Skinstinct, into a
ready-to-review draft post written in her voice.

Rules for this task:
- Follow the voice guide below exactly. It overrides any habit of yours.
- Default to a LinkedIn post unless the note asks for a newsletter or another format.
- Use only facts, numbers, studies and anecdotes that appear in the note (or in the news
  item, if one is given and you use it). Never invent any. Where the post needs data the
  note does not give, write [DATA NEEDED: what].
- The draft is the post only: no preamble, no title, no explanation, no Markdown
  formatting, no options. Plain text that can be pasted straight into LinkedIn.
- Write in paragraphs of 3-6 sentences, separated by a blank line.`;

export function getVoiceFromFile() {
  let voice = "";
  try {
    voice = readFileSync(VOICE_FILE, "utf8").trim();
  } catch {
    // Fall through to the env var below.
  }
  if (!voice || voice.includes(PLACEHOLDER)) {
    voice = (process.env.VOICE_INSTRUCTIONS || "").trim();
  }
  return voice;
}

// Voice guide source, in order: Supabase voice_skill table, then the file in
// the repo, then the VOICE_INSTRUCTIONS env var.
export async function getSystemPrompt() {
  let voice = "";
  if (isDbConfigured()) {
    try {
      voice = (await getVoiceSkill()) || "";
    } catch (err) {
      console.error("Could not load voice_skill from Supabase, using the file:", err.message);
    }
  }
  if (!voice) voice = getVoiceFromFile();
  if (!voice) {
    throw new Error("Voice instructions are missing. Paste them into voice/voice-instructions.md and redeploy.");
  }
  return `${TASK}\n\n===== VOICE GUIDE =====\n\n${voice}`;
}
