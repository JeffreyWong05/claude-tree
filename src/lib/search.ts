import type { Turn } from "@/lib/types";

/**
 * In-app message search, run locally (no Claude tokens).
 * Understands two kinds of query, in everyday wording:
 *   - what an answer LOOKS like: "a chart with links", "step-by-step directions", "code", "screenshot"
 *   - what it's ABOUT: any other words, matched as keywords (prefix, light stemming, "quoted phrases")
 * "I want to find messages with a chart with links" → must contain a table and a link.
 */

export type Feature = "table" | "links" | "steps" | "bullets" | "code" | "images" | "files" | "headings";

export const FEATURE_LABEL: Record<Feature, string> = {
  table: "📊 table/chart",
  links: "🔗 links",
  steps: "🔢 steps",
  bullets: "• list",
  code: "‹› code",
  images: "🖼 image",
  files: "📎 file",
  headings: "§ sections",
};

/** Everyday words → the feature they ask for. Multi-word phrases are matched first. */
const FEATURE_WORDS: [Feature, string[]][] = [
  ["steps", ["step-by-step", "step by step", "steps", "step", "directions", "instructions", "walkthrough", "walk through", "how to", "how-to", "guide", "procedure", "numbered", "tutorial"]],
  ["table", ["chart", "charts", "table", "tables", "grid", "matrix", "spreadsheet", "comparison table", "tabular"]],
  ["links", ["link", "links", "url", "urls", "hyperlink", "hyperlinks", "sources", "references", "citations"]],
  ["code", ["code", "snippet", "snippets", "command", "commands", "script", "scripts"]],
  ["images", ["image", "images", "screenshot", "screenshots", "picture", "pictures", "photo", "photos"]],
  ["files", ["file", "files", "pdf", "attachment", "attachments", "csv"]],
  ["bullets", ["bullet", "bullets", "bulleted", "list", "lists"]],
  ["headings", ["headings", "sections", "outline"]],
];

/** Words that describe the search itself, not what to find. */
const FILLER = new Set(
  (
    "i i'm want wanted to find search look looking for show me get give see message messages prompt prompts reply replies " +
    "answer answers response responses chat where which that with without a an the of in on at and or any some " +
    "provides provide provided includes include including contains contain containing has have had having " +
    "is are was were be been it its this those these about from by did do does you your my claude there"
  ).split(" "),
);

export interface ParsedQuery {
  features: Feature[];
  terms: string[];
  phrases: string[];
}

export function parseQuery(raw: string): ParsedQuery {
  let q = ` ${raw.toLowerCase()} `;
  const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter(Boolean);
  q = q.replace(/"[^"]*"/g, " ");
  const features = new Set<Feature>();
  for (const [feature, words] of FEATURE_WORDS) {
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|[^a-z])${w.replace(/[-/]/g, "\\$&")}(?=[^a-z]|$)`, "g");
      if (re.test(q)) {
        features.add(feature);
        q = q.replace(re, " ");
      }
    }
  }
  const terms = q
    .split(/[^a-z0-9'+#.-]+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((w) => w.length > 1 && !FILLER.has(w))
    .map(stem);
  return { features: [...features], terms: [...new Set(terms)], phrases };
}

/** Very light stemming so "charts"/"charting" and "deploy"/"deployed" meet. */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function detectFeatures(text: string): Set<Feature> {
  const f = new Set<Feature>();
  if (/^\s*\|.*\|\s*$/m.test(text) && /\|\s*:?-{3,}/.test(text)) f.add("table");
  if (/```mermaid|```chart/i.test(text)) f.add("table");
  if (/https?:\/\/\S+|\]\([^)]+\)/.test(text)) f.add("links");
  if ((text.match(/^\s*\d+[.)]\s+\S/gm)?.length ?? 0) >= 2 || /\bstep\s+\d/i.test(text)) f.add("steps");
  if ((text.match(/^\s*[-*•]\s+\S/gm)?.length ?? 0) >= 3) f.add("bullets");
  if (/```/.test(text)) f.add("code");
  if (/^#{1,4}\s+\S/m.test(text)) f.add("headings");
  return f;
}

/** Where a feature first appears in a text, so a shape-only result's snippet shows the table/steps/link itself. */
const FEATURE_ANCHOR: Partial<Record<Feature, RegExp>> = {
  table: /^\s*\|.*\|\s*$/m,
  links: /https?:\/\/\S+|\]\([^)]+\)/,
  steps: /^\s*\d+[.)]\s+\S|\bstep\s+\d/im,
  bullets: /^\s*[-*•]\s+\S/m,
  code: /```/,
  headings: /^#{1,4}\s+\S/m,
};

/** How strongly a message shows a feature (rows / steps / links, capped), for ranking. */
const FEATURE_COUNT: Partial<Record<Feature, RegExp>> = {
  table: /^\s*\|.*\|\s*$/gm,
  links: /https?:\/\/\S+|\]\([^)]+\)/g,
  steps: /^\s*\d+[.)]\s+\S/gm,
  bullets: /^\s*[-*•]\s+\S/gm,
  code: /```/g,
};

function featureStrength(text: string, f: Feature): number {
  const re = FEATURE_COUNT[f];
  return re ? Math.min(text.match(re)?.length ?? 0, 12) : 1;
}

/** Search index for one message (a prompt plus Claude's reply). Build once per conversation. */
export interface IndexedTurn {
  index: number;
  user: string;
  assistant: string;
  userLower: string;
  assistantLower: string;
  features: Set<Feature>;
  /** Which side each feature came from, for the result badge. */
  featureSide: Map<Feature, "You" | "Claude">;
}

export function buildIndex(turns: Turn[]): IndexedTurn[] {
  return turns.map((t) => {
    const fromUser = detectFeatures(t.user);
    const fromClaude = detectFeatures(t.assistant);
    const featureSide = new Map<Feature, "You" | "Claude">();
    for (const f of fromClaude) featureSide.set(f, "Claude");
    for (const f of fromUser) if (!featureSide.has(f)) featureSide.set(f, "You");
    const shared = t.attachments.filter((a) => a.kind !== "screenshot");
    if (shared.some((a) => a.preview === "image")) featureSide.set("images", "You");
    if (shared.some((a) => a.preview !== "image")) featureSide.set("files", "You");
    if (t.attachments.some((a) => a.kind === "screenshot") && !featureSide.has("images")) featureSide.set("images", "Claude");
    return {
      index: t.index,
      user: t.user,
      assistant: t.assistant,
      userLower: t.user.toLowerCase(),
      assistantLower: t.assistant.toLowerCase(),
      features: new Set(featureSide.keys()),
      featureSide,
    };
  });
}

export interface SearchHit {
  index: number;
  score: number;
  /** Where the best keyword match is, for the snippet. */
  side: "You" | "Claude";
  snippet: string;
  matchedFeatures: { feature: Feature; side: "You" | "Claude" }[];
  /** Words to highlight in the snippet. */
  highlight: string[];
}

function countWord(haystack: string, term: string): number {
  // Prefix match at a word start: "chart" finds "charts", "deploy" finds "deployment".
  const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
  return haystack.match(re)?.length ?? 0;
}

/** ~180 characters around the first hit, on word boundaries, markdown symbols removed. */
function snippetAround(text: string, lower: string, needles: string[], anchor = -1): string {
  // Readable text: no markdown symbols or table divider rows ("|---|---|").
  const plain = (s: string) => s.replace(/:?-{3,}:?/g, " ").replace(/[*_`#>|]+/g, " ").replace(/\s+/g, " ").trim();
  let at = anchor;
  for (const n of needles) {
    const i = lower.indexOf(n);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return plain(text).slice(0, 180);
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 70)));
  const piece = plain(text.slice(start, start + 260));
  return `${start > 0 ? "… " : ""}${piece.slice(0, 180)}${piece.length > 180 ? " …" : ""}`;
}

export function search(index: IndexedTurn[], raw: string, limit = 50): { query: ParsedQuery; hits: SearchHit[] } {
  const query = parseQuery(raw);
  const { features, terms, phrases } = query;
  if (!features.length && !terms.length && !phrases.length) return { query, hits: [] };

  // Rarer words count more (inverse document frequency).
  const docsWith = (t: string) => index.filter((d) => countWord(d.userLower, t) || countWord(d.assistantLower, t)).length;
  const idf = new Map(terms.map((t) => [t, Math.log(1 + index.length / (1 + docsWith(t)))]));

  const hits: SearchHit[] = [];
  for (const d of index) {
    // Answer-shape requests are requirements: "a chart with links" needs both.
    if (!features.every((f) => d.features.has(f))) continue;
    if (!phrases.every((p) => d.userLower.includes(p) || d.assistantLower.includes(p))) continue;

    let score = phrases.length * 6;
    for (const f of features) {
      score += 3 + featureStrength(d.featureSide.get(f) === "You" ? d.user : d.assistant, f) * 0.3;
    }
    let userWeight = 0;
    let claudeWeight = 0;
    let matchedTerms = 0;
    for (const t of terms) {
      const inUser = countWord(d.userLower, t);
      const inClaude = countWord(d.assistantLower, t);
      if (!inUser && !inClaude) continue;
      matchedTerms++;
      // Your own words weigh more: you remember what you asked.
      const w = idf.get(t)! * (2 * Math.min(inUser, 3) + Math.min(inClaude, 5) * 0.6);
      score += w;
      userWeight += inUser;
      claudeWeight += inClaude;
    }
    // With keywords, every word must appear somewhere in the message (like Discord's search).
    if (terms.length && matchedTerms < terms.length) continue;
    if (score <= 0) continue;

    const needles = [...phrases, ...terms];
    const side: "You" | "Claude" =
      needles.length === 0 ? (features.some((f) => d.featureSide.get(f) === "You") ? "You" : "Claude") : userWeight >= claudeWeight && userWeight > 0 ? "You" : "Claude";
    // Shape-only searches: center the snippet on the table/steps/link that matched.
    const text = side === "You" ? d.user : d.assistant;
    const anchorRe = needles.length === 0 && features.length ? FEATURE_ANCHOR[features[0]] : undefined;
    const anchor = anchorRe ? text.search(anchorRe) : -1;
    const snippet = snippetAround(text, side === "You" ? d.userLower : d.assistantLower, needles, anchor);
    hits.push({
      index: d.index,
      score,
      side,
      snippet,
      matchedFeatures: features.map((f) => ({ feature: f, side: d.featureSide.get(f)! })),
      highlight: needles,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.index - b.index);
  return { query, hits: hits.slice(0, limit) };
}
