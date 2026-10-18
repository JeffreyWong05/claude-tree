# Decisions

Newest at the bottom. Each entry: what we chose, and why.

## 2026-10-06 — Post-hoc treeify instead of live branching
Chat normally (Claude Code), then build the tree afterwards with one Claude call per conversation.
**Why:** `claude -p` adds a few seconds of startup per call — fine once per conversation, too slow per message.
Live branching (Milestone 4) can come later.

## 2026-10-06 — Use the Claude Code CLI (`claude -p`), not the API
**Why:** no API key / separate billing needed; uses the existing Claude Pro subscription. Personal, local use only.
Runs count against Pro usage limits. Wrapped in a `ClaudeRunner` interface so an API-key runner can be added for others.

## 2026-10-06 — General tree of contiguous segments, not a binary tree
A topic can spawn any number of tangents. Each segment is a contiguous run of turns with a parent and a kind
(`root` / `continue` / `tangent` / `return`). Returning to an earlier topic creates a **new child** of that topic
rather than re-opening it, so the timeline stays readable.

## 2026-10-06 — Next.js 16 (App Router), file-based storage
Reads transcripts straight from `~/.claude/projects`; trees cached as JSON in `data/trees/` (gitignored).
No database until search/editing needs one.

## 2026-10-06 — `claude -p` runs from a temp folder
`claude -p` saves its own session transcript. Running it from `%TEMP%/claude-tree-runner` puts those helper
sessions in a separate project folder that the session list filters out.

## 2026-10-06 — Instant jumps, no smooth scrolling
Smooth scrolling overshot targets on long pages in testing; instant anchor jumps land exactly.

## 2026-10-07 — Deep links into the Claude desktop app
Found in the desktop app's URL handler (undocumented, v2.26454):
`claude://code/continue?session=local_<id>`, `claude://resume?session=<cli-uuid>`,
`claude://code/new?q=<prompt>&folder=<path>` (q capped at 14,336 chars).
The `local_` id comes from `%APPDATA%/Claude/claude-code-sessions/**/local_*.json` (`cliSessionId` → `sessionId`).
All of this lives in `src/lib/links.ts` and `src/lib/sources/desktopSessions.ts`, so an app update only breaks one place.
Links open the right chat but can't scroll to a message; topic headers show the starting message number instead.

## 2026-10-07 — "Continue from this leaf" recap is built locally
The recap (original goal, topic path with summaries, last exchange, transcript path) is assembled from the saved
tree with no Claude call, so it's instant and free.

## 2026-10-07 — New messages become individual "unorganized" leaves
Instead of live re-organizing (costs usage on every message), each message the tree doesn't cover is shown as its
own `unsorted` leaf under the last organized topic. They are display-only (never saved) and vanish on rebuild, so
the count doubles as a "how unorganized is this chat" meter. Cost while chatting: zero.

## 2026-10-07 — Per-prompt labels
The treeify prompt also asks for a 2–4 word label per turn (`turnLabels`), adding only ~5–10 output tokens per turn.
Before a rebuild — and for trees built before labels existed — `fallbackLabel` picks the first meaningful words
of the prompt (stopword filtering), which is free but less accurate.

## 2026-10-08 — Attachments are loaded lazily by reference
Transcripts embed images and @-attached files as base64 (a 100 KB PDF ≈ 135 KB of text). The parser records only
a ref (`u<line>-<block>`, `t<line>-<block>-<item>`, `f<line>`) plus name/type/size; bytes are re-read from the
transcript by `/api/conversations/[id]/attachments/[ref]` when the user opens them. Line numbers are stable because
transcripts are append-only. Treeify sends only attachment names to Claude, so attachments add no rebuild cost.

## 2026-10-17 — Diagram view: React Flow + d3-hierarchy
React Flow gives pan/zoom/minimap/fit for free; d3-hierarchy's `tree()` computes a tidy top-down layout so
branches don't overlap (React Flow has no layout of its own). The diagram is loaded with `next/dynamic` only when
opened. The transcript stays mounted (hidden) in Diagram view; all navigation goes through `goTo()`, which renders
the transcript synchronously (`flushSync`) before scrolling.

## 2026-10-18 — Similarity = Claude-assigned themes; unique ideas get their own treatment
Rebuild asks Claude to group segments into named themes (a few extra output tokens) — better than local text
similarity, and the themes come with names. Colors follow the dataviz guidance:
- The validated default 8-color categorical palette in fixed order (first appearance), light and dark steps.
  More than 8 recurring themes fold into grey "Other"; hues are never generated.
- Nodes in a tree sit next to any other color (an "all-pairs" layout), so color is never the only cue: every
  node also shows its theme name, and the legend lists them.
- One-off themes don't spend a palette color. They get a ★ "Unique idea" badge plus a heavy ink outline, so
  they stand out instead of becoming one more hue. A spotlight (legend) fades everything but unique ideas or one theme.
- Branch lines are neutral grey (the dash pattern carries branch type) and the "active topic" ring uses ink,
  so the orange UI accent never reads as a theme color.

## 2026-10-18 — Ctrl+F "find phrases" instead of message identifiers
Past messages can't be tagged and the app's deep link can't scroll to a message, so each prompt gets a search
key: the shortest run of its own words (4–8 words, one sentence, plain words only) that occurs exactly once in
the normalized chat text (prompts + replies, markdown/tags stripped). Prompts too short to be unique ("Yes")
point at the nearest earlier prompt's phrase plus "N messages down". Phrases are recomputed on every page load,
so they stay unique as the chat grows. Known gap: text the app shows that we don't parse (tool output) could
contain the phrase too. The Claude app has Electron find-in-page (checked in v2.42304).
