// Copies voice/voice-instructions.md into the Supabase voice_skill table.
// Usage: npm run seed-voice   (reads .env; re-run after editing the file)
import { isDbConfigured, saveVoiceSkill } from "../lib/db.js";
import { getVoiceFromFile } from "../lib/voice.js";

if (!isDbConfigured()) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");
  process.exit(1);
}
const voice = getVoiceFromFile();
if (!voice) {
  console.error("voice/voice-instructions.md is empty or still the placeholder.");
  process.exit(1);
}
const [row] = await saveVoiceSkill(voice);
console.log(`voice_skill row ${row.id} saved (${voice.length} characters).`);
