import type { TopicTree, Turn } from "@/lib/types";

const MAX_WORDS = 4;

/** Words that carry little meaning in a 2-4 word label. */
const STOPWORDS = new Set(
  (
    "a an the and or but if so then than that this these those it its it's is are was were be been being am " +
    "i i'm i've i'd me my we our you your he she they them their there here what which who whom whose " +
    "do does did doing done have has had having will would should could can may might must shall " +
    "to of in on at by for with about from into onto as up down out over under again also just only very " +
    "really quite too some any all each every both more most much many such own same other " +
    "not no yes ok okay hey hi hello please thanks thank great perfect fine sure well now still even " +
    "want wanted wants like need needs make makes made let let's get got go going way thing things " +
    "how why when where while because since though although whether one sort kind something anything"
  ).split(" "),
);

/**
 * Free, instant label for a prompt: the first few meaningful words of its first meaningful sentence.
 * Placeholder until a rebuild asks Claude for real summaries.
 */
export function fallbackLabel(text: string): string {
  const clean = text
    .replace(/<\/?[a-z_-]+(\s[^>]*)?>/gi, " ") // wrapper tags such as <pasted_content id="…">
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*_#>\[\]()]/g, " ");
  const sentences = clean.split(/(?<=[.!?\n])\s+/);
  for (const sentence of sentences) {
    const words = sentence
      .split(/\s+/)
      .map((w) => w.replace(/^[^\w/.-]+|[^\w/.-]+$/g, ""))
      .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
    if (words.length < 2 && sentences.length > 1) continue;
    if (words.length === 0) continue;
    const label = words.slice(0, MAX_WORDS).join(" ").replace(/[.,!?;:]+$/, "");
    return label[0].toUpperCase() + label.slice(1) + (words.length > MAX_WORDS ? "…" : "");
  }
  return clean.trim().split(/\s+/).slice(0, MAX_WORDS).join(" ") || "(empty prompt)";
}

/** Claude's label when the tree covers this turn, otherwise the fallback. */
export function labelFor(turn: Turn, tree: TopicTree | null): string {
  const fromTree = tree && turn.index < tree.turnCount ? tree.turnLabels?.[turn.index] : undefined;
  if (fromTree) return fromTree;
  if (!turn.user.trim() && turn.attachments.length) return `Shared ${turn.attachments[0].kind === "file" ? "file" : "image"}`;
  return fallbackLabel(turn.user);
}
