import type { Conversation, Segment } from "@/lib/types";

/**
 * claude:// deep links handled by the Claude desktop app. Undocumented — found in the app's
 * URL handler (v2.26454; re-checked v2.42304). If links stop working after an app update, check here first.
 *
 *   claude://code/continue?session=local_<id>   open an existing desktop Code session
 *   claude://resume?session=<cli-uuid>           import a CLI/terminal session and open it
 *   claude://code/new?q=<prompt>&folder=<path>   new Code session with a pre-filled prompt
 */

/** The app truncates ?q= beyond this many characters. */
export const PREFILL_LIMIT = 14_336;

export function openInClaudeUrl(conversation: Conversation): string {
  const desktop = conversation.desktop;
  if (desktop && !desktop.archived) {
    return `claude://code/continue?session=${encodeURIComponent(desktop.sessionId)}`;
  }
  // Archived sessions are ignored by /continue, and terminal sessions have no desktop id.
  return `claude://resume?session=${encodeURIComponent(conversation.id)}`;
}

export function newSessionUrl(prompt: string, folder?: string): string {
  const params = new URLSearchParams({ q: prompt.slice(0, PREFILL_LIMIT) });
  if (folder) params.set("folder", folder);
  return `claude://code/new?${params}`;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * A self-contained recap of the path root → `segment`, used to start a new session that
 * picks up from that leaf. Built locally from the tree, so it's instant and free.
 */
export function buildRecap(conversation: Conversation, segments: Segment[], segment: Segment): string {
  const path: Segment[] = [segment];
  for (let p = segment.parent; p !== null; p = segments[p].parent) path.unshift(segments[p]);

  const { turns } = conversation;
  const firstPrompt = turns[0]?.user ?? "";
  const last = turns[segment.endTurn];

  const lines = [
    `I'm continuing an earlier conversation ("${conversation.title}", session ${conversation.id}) from one specific topic. Here's the context:`,
    "",
    `Original goal: ${clip(firstPrompt, 1200)}`,
    "",
    "Topic path (root → where I'm picking up):",
    ...path.map((s, i) => `${i + 1}. ${s.title}${s.summary ? ` — ${s.summary}` : ""}`),
  ];
  if (last) {
    lines.push(
      "",
      `Last exchange in "${segment.title}":`,
      `Me: ${clip(last.user, 1500)}`,
      `You: ${clip(last.assistant, 2500)}`,
    );
  }
  lines.push("", `The full transcript is at ${conversation.transcriptPath ?? `~/.claude/projects/*/${conversation.id}.jsonl`} if you need more detail.`, "", "Let's continue from here: ");
  return lines.join("\n");
}
