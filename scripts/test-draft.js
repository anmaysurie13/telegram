// Runs one note through the full pipeline (score -> news -> draft) locally,
// without Telegram or the database.
// Usage: npm run test-draft -- "your note here"
import { processNote } from "../lib/pipeline.js";

const note =
  process.argv.slice(2).join(" ") ||
  "Returns from humid cities went down after we changed the moisturiser base. Want to talk about why climate matters for formulation.";

const r = await processNote(note);
console.log(`Note:\n${note}\n`);
console.log(`Score: ${r.score}/10 — ${r.reason}`);
console.log(`Steps run: ${r.steps.join(" -> ")}`);
if (r.status === "drafted") {
  console.log(`Search phrase: ${r.phrase}`);
  console.log(`News: ${r.news ? `${r.news.headline} (${r.news.source}, ${r.news.date})` : r.newsError || "none"}`);
  console.log(`News used in draft: ${r.usedNews}\n\nDraft:\n\n${r.text}`);
}
