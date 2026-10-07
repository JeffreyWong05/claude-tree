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
 */
export type SegmentKind = "root" | "continue" | "tangent" | "return";

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
}
