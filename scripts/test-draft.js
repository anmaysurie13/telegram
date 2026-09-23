// Tries the Gemini + voice step locally, without Telegram.
// Usage: npm run test-draft -- "your note here"
import { draftPost } from "../lib/gemini.js";

const note =
  process.argv.slice(2).join(" ") ||
  "Returns from humid cities went down after we changed the moisturiser base. Want to talk about why climate matters for formulation.";

console.log(`Note:\n${note}\n\nDraft:\n`);
console.log(await draftPost(note));
