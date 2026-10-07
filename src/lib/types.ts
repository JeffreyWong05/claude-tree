/** One user prompt plus everything Claude said in reply, flattened to text. */
export interface Turn {
  index: number;
  timestamp: string;
  user: string;
  assistant: string;
  /** Names of tools Claude used while answering (Claude Code sessions). */
  tools: string[];
}

export interface Conversation {
  id: string;
  source: "claude-code";
  title: string;
  project: string;
  updatedAt: string;
  /** Working directory the session ran in (used to open follow-up sessions in the same folder). */
  cwd?: string;
  /** Absolute path of the transcript file. */
  transcriptPath?: string;
  /** Present when the session also exists in the Claude desktop app. */
  desktop?: { sessionId: string; archived: boolean };
  turns: Turn[];
}

/** Lightweight listing entry — avoids parsing every transcript in full. */
export interface ConversationMeta {
  id: string;
  source: "claude-code";
  title: string;
  project: string;
  updatedAt: string;
  sizeBytes: number;
}

/**
 * How a segment relates to its parent:
 * - continue: the same goal moving forward
 * - tangent:  a deeper dive / side question branching off the parent
 * - return:   picking a parent topic back up after a tangent
 * - unsorted: a message added after the tree was built (display-only, one per message, never saved)
 */
export type SegmentKind = "root" | "continue" | "tangent" | "return" | "unsorted";

/** A contiguous run of turns about one topic. Segments form a tree via `parent`. */
export interface Segment {
  id: number;
  parent: number | null;
  kind: SegmentKind;
  title: string;
  summary: string;
  startTurn: number;
  /** Inclusive. */
  endTurn: number;
}

export interface TopicTree {
  conversationId: string;
  generatedAt: string;
  /** Turn count when the tree was built — used to detect stale trees. */
  turnCount: number;
  model: string;
  segments: Segment[];
  /** 2-4 word label per prompt, indexed by turn. Missing in trees built before labels existed. */
  turnLabels?: string[];
}
