import { getSystemPrompt } from "./voice.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function draftPost(note) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: getSystemPrompt() }] },
      contents: [{ role: "user", parts: [{ text: `Note from Meera:\n\n${note}` }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${data?.error?.message || res.statusText}`);
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();

  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || "unknown";
    throw new Error(`Gemini returned no text (reason: ${reason}).`);
  }
  return text;
}
