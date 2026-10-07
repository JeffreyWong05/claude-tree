import type { Conversation, Segment, SegmentKind, TopicTree, Turn } from "@/lib/types";
import { fallbackLabel } from "@/lib/labels";
import { cliRunner, type ClaudeRunner } from "@/lib/runner";

/** Rough cap on transcript size sent to Claude; long chats get more aggressive clipping. */
const PROMPT_CHAR_BUDGET = 150_000;

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)} …[${flat.length - max} more chars]` : flat;
}

function renderTranscript(turns: Turn[]): string {
  for (const [userMax, claudeMax] of [
    [1500, 600],
    [800, 250],
    [400, 100],
  ]) {
    const text = turns
      .map((t) => {
        const tools = t.tools.length ? ` (used tools: ${[...new Set(t.tools)].join(", ")})` : "";
        return `[T${t.index}] USER: ${clip(t.user, userMax)}\n       CLAUDE${tools}: ${clip(t.assistant, claudeMax)}`;
      })
      .join("\n\n");
    if (text.length <= PROMPT_CHAR_BUDGET) return text;
  }
  throw new Error(
    `Conversation is too long to treeify in one pass (${turns.length} turns). Chunking is on the roadmap.`,
  );
}

export function buildPrompt(turns: Turn[]): string {
  return `You are organizing a long chat between a user and Claude into a TOPIC TREE so the user can navigate it later.
Do not use any tools. Reply with JSON only.

Split the conversation into SEGMENTS: contiguous runs of turns about one topic. Rules:
- Segment 0 starts at turn 0 and is the root (the user's original goal). parent = null, kind = "root".
- Start a new segment whenever the topic shifts. Each new segment has a parent (an EARLIER segment's index) and a kind:
  - "tangent":  the user dives deeper into a term/idea or asks a side question. parent = the segment it branched from.
  - "return":   the user goes back to an earlier topic after a tangent. parent = the segment of that earlier topic.
  - "continue": the same line of work moves to its next stage (a new milestone, not a tangent). parent = the previous segment on that line.
- Prefer fewer, meaningful segments over many tiny ones. A single clarifying follow-up is not a new segment.
- title: 2-6 words, specific (e.g. "JWT refresh tokens", not "Question about auth").
- summary: one sentence on what was discussed or decided, so the user knows where they left off.

Also give every turn a LABEL: 2-4 words naming what the user asked or did in that turn, so it can be
listed in a compact menu (e.g. "Add HP-cost cards", "Explain API keys", "Deploy to Netlify"). Exactly one label per turn, in order.

Output exactly:
{"segments":[{"start":0,"parent":null,"kind":"root","title":"...","summary":"..."}, ...],"labels":["...", ...]}
"start" values must be strictly increasing turn indices. Each segment runs until the next segment's start.
"labels" has exactly ${turns.length} entries.

TRANSCRIPT (${turns.length} turns; long messages are clipped):

${renderTranscript(turns)}`;
}

interface RawSegment {
  start?: unknown;
  parent?: unknown;
  kind?: unknown;
  title?: unknown;
  summary?: unknown;
}

function extractJson(reply: string): { segments?: unknown; labels?: unknown } {
  try {
    return JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
  } catch {
    throw new Error(`Claude did not return valid JSON:\n${reply.slice(0, 500)}`);
  }
}

/** One short label per turn; anything missing or malformed falls back to a label made from the prompt. */
export function parseLabels(reply: string, turns: Turn[]): string[] {
  const raw = extractJson(reply).labels;
  const labels = Array.isArray(raw) ? raw : [];
  return turns.map((t, i) => {
    const label = typeof labels[i] === "string" ? labels[i].trim() : "";
    return label && label.length <= 40 ? label : fallbackLabel(t.user);
  });
}

/** Parses Claude's reply and repairs anything that would break the tree invariants. */
export function parseSegments(reply: string, turnCount: number): Segment[] {
  const raw = extractJson(reply).segments as RawSegment[];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Claude returned no segments.");

  const kinds: SegmentKind[] = ["continue", "tangent", "return"]; // "unsorted" is display-only
  const segments: Segment[] = [];
  let lastStart = -1;
  for (const r of raw) {
    let start = Number(r.start);
    if (segments.length === 0) start = 0;
    if (!Number.isInteger(start) || start <= lastStart || start >= turnCount) continue;
    const id = segments.length;
    const parent = Number(r.parent);
    segments.push({
      id,
      parent: id === 0 ? null : Number.isInteger(parent) && parent >= 0 && parent < id ? parent : id - 1,
      kind: id === 0 ? "root" : kinds.includes(r.kind as SegmentKind) ? (r.kind as SegmentKind) : "continue",
      title: String(r.title ?? `Topic ${id + 1}`).slice(0, 80),
      summary: String(r.summary ?? ""),
      startTurn: start,
      endTurn: turnCount - 1,
    });
    lastStart = start;
  }
  for (let i = 0; i < segments.length - 1; i++) segments[i].endTurn = segments[i + 1].startTurn - 1;
  return segments;
}

export async function treeify(
  conversation: Conversation,
  runner: ClaudeRunner = cliRunner,
): Promise<TopicTree> {
  const { turns } = conversation;
  if (turns.length === 0) throw new Error("Conversation has no messages.");
  const model = process.env.CLAUDE_TREE_MODEL ?? "sonnet";
  const reply = await runner.complete(buildPrompt(turns), { model });
  return {
    conversationId: conversation.id,
    generatedAt: new Date().toISOString(),
    turnCount: turns.length,
    model: `${runner.name}:${model}`,
    segments: parseSegments(reply, turns.length),
    turnLabels: parseLabels(reply, turns),
  };
}
