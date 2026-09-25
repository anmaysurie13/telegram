const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// One call to Gemini. With `schema`, Gemini returns JSON matching it and the
// parsed object is returned; otherwise the plain text is returned.
async function generate({ system, user, schema, temperature = 0.7 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${data?.error?.message || res.statusText}`);
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || "").join("").trim();
  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || "unknown";
    throw new Error(`Gemini returned no text (reason: ${reason}).`);
  }
  if (!schema) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ---------- B1.1: scoring ----------

const SCORING_PROMPT = `You are a strict editor deciding whether a founder's note has enough
substance to be turned into a LinkedIn post. Most quick notes do NOT. Be strict: when in
doubt, score lower. A note only passes if a writer could draft a full post from it without
guessing what the point is.

Score from 0 to 10:
10  = highly substantive: a clear, specific idea with evidence, experience or a takeaway.
7-9 = strong: a complete idea with enough concrete substance to write from.
6   = acceptable: one complete, specific idea with a clear point. The minimum to draft.
4-5 = weak or incomplete: a topic is named but there is no clear point, lesson, example or
      evidence. A writer would have to invent the substance.
0-3 = not draft-worthy: a reminder, to-do, logistics, a meeting or call note, a fragment, an
      abandoned or trailing thought, a bare topic ("maybe talk about X"), or anything with
      no idea in it.

Score 0-3, for example: "Call Rahul tomorrow", "Need to finish this later",
"Maybe talk about AI...", "Buy tickets", "Don't forget meeting at 4",
"Thinking about how we".
Score 6 or more only for: a substantive observation, a complete idea, a meaningful
experience with a lesson, or a developed thought.

Length is not substance. A long note that rambles without a point still scores low.

Return the score as an integer and the reason as ONE short sentence (under 25 words) that
tells the author what is present or missing.`;

const SCORE_SCHEMA = {
  type: "OBJECT",
  properties: { score: { type: "INTEGER" }, reason: { type: "STRING" } },
  required: ["score", "reason"],
};

export async function scoreNote(note) {
  const out = await generate({
    system: SCORING_PROMPT,
    user: `Note:\n"""\n${note}\n"""`,
    schema: SCORE_SCHEMA,
    temperature: 0,
  });
  const score = Math.round(Number(out.score));
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new Error(`Gemini returned an invalid score: ${JSON.stringify(out)}`);
  }
  return { score, reason: String(out.reason || "").trim() };
}

// ---------- B1.2: news keywords ----------

const KEYWORDS_SCHEMA = {
  type: "OBJECT",
  properties: { phrase: { type: "STRING" } },
  required: ["phrase"],
};

export async function extractNewsKeywords(note) {
  const out = await generate({
    system: `Extract 3 to 5 search terms from the note that would find a related, current news
story on Google News. Prefer the industry topic over company-internal details (no batch
numbers, internal names or people). Return them as one short search phrase of 3-5 words,
lowercase, no quotes, no punctuation, no search operators.`,
    user: `Note:\n"""\n${note}\n"""`,
    schema: KEYWORDS_SCHEMA,
    temperature: 0,
  });
  const phrase = String(out.phrase || "").replace(/["']/g, "").trim();
  if (!phrase) throw new Error("Gemini returned an empty search phrase.");
  return phrase;
}

// ---------- Drafting ----------

const DRAFT_SCHEMA = {
  type: "OBJECT",
  properties: {
    draft: { type: "STRING" },
    used_news: { type: "BOOLEAN" },
  },
  required: ["draft", "used_news"],
};

function newsBlock(news) {
  if (!news) return "News item: none available. Write from the note alone and set used_news to false.";
  return `News item (from Google News):
Headline: ${news.headline}
Publication: ${news.source}
Date: ${news.date}
Summary: ${news.summary}
URL: ${news.url}

If this news item is genuinely relevant, use it to make the post timely. If it doesn't fit naturally, ignore it.
Only state what the headline itself says about the story; do not add details about it that
are not given here. Do not put the URL or a source line in the draft. Set used_news to true
only if the draft references this news item; otherwise false.`;
}

// Returns { draft, usedNews }. `systemPrompt` is the task + voice guide.
export async function draftPost(note, { systemPrompt, news = null }) {
  const out = await generate({
    system: systemPrompt,
    user: `Note from Meera:\n\n${note}\n\n---\n${newsBlock(news)}\n\nReturn the post text in "draft".`,
    schema: DRAFT_SCHEMA,
  });
  const draft = String(out.draft || "").trim();
  if (!draft) throw new Error("Gemini returned an empty draft.");
  return { draft, usedNews: Boolean(news && out.used_news) };
}
