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
