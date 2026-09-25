// Google News search through its public RSS feed (no API key needed).
const RSS = "https://news.google.com/rss/search";

function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}

async function search(query) {
  const url = `${RSS}?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (meera-drafts-bot)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Google News returned ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}

// Returns the top result as { headline, source, date, summary, url }, or null.
export async function fetchNews(phrase) {
  // Prefer the last 90 days so the angle is timely; widen if nothing comes back.
  let items = await search(`${phrase} when:90d`);
  if (!items.length) items = await search(phrase);
  if (!items.length) return null;

  const item = items[0];
  const source = tag(item, "source");
  let headline = tag(item, "title");
  // Google appends " - Publication" to titles.
  if (source && headline.endsWith(` - ${source}`)) headline = headline.slice(0, -(source.length + 3));
  const pub = new Date(tag(item, "pubDate"));
  const date = isNaN(pub) ? "date unknown" : pub.toISOString().slice(0, 10);

  // The RSS description normally just repeats the headline and source, so
  // there is usually no article text to summarise. Say so rather than invent one.
  const description = tag(item, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const extra = description.replace(headline, "").replace(source, "").trim();
  const summary = extra.length > 20 ? extra : "No summary available from Google News; only the headline is known.";

  return { headline, source: source || "unknown", date, summary, url: tag(item, "link") };
}
