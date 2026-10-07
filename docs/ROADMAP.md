# Roadmap

Tick items off as they land; add dates when a milestone completes.

## Milestone 1 — Tree viewer for Claude Code sessions ✅ (scaffolded 2026-10-06)
- [x] Parse Claude Code JSONL transcripts into turns (skip tool results, sidechains, system reminders)
- [x] `treeify` via `claude -p` → segments with parent/kind/title/summary
- [x] Repair malformed model output (non-increasing starts, bad parents, bad kinds)
- [x] Session list + topic map sidebar + click-to-jump + scroll-spy highlight
- [x] "Build tree" button in UI and `npm run treeify` CLI
- [x] Stale-tree detection ("New since tree was built")
- [x] Install Claude Code CLI, log in, and run a real treeify end-to-end (2026-10-07)
- [ ] Tune the treeify prompt on 3–4 real long sessions

## Milestone 2 — Better navigation
- [x] One "unorganized" leaf per message the tree doesn't cover yet; removed only by a rebuild — 2026-10-07
- [x] Organized-% meter + "Rebuild tree (organize N new)" — 2026-10-07
- [x] Expand a topic to list its prompts as 2–4 word labels (Claude labels on rebuild, keyword fallback before) and jump to each — 2026-10-07
- [ ] Graphical map view (React Flow) alongside the outline
- [ ] Collapse/expand subtrees; collapse long Claude replies
- [ ] Manual edits: rename a segment, move a split point, re-parent a segment (saved to the tree file)
- [ ] Search across sessions and segment titles/summaries
- [ ] "Where was I?" — one-paragraph recap of a branch's path from root

## Milestone 3 — More sources
- [ ] Import claude.ai export (`conversations.json`, Settings → Privacy → Export data)
- [ ] Chunked treeify for very long sessions (current hard limit ~150k chars of clipped transcript)
- [ ] Follow `parentUuid` for rewound/edited Claude Code sessions instead of file order

## Milestone 4 — Continue from a leaf
- [x] "Open in Claude" deep link per topic (`claude://code/continue`, `claude://resume` fallback) — 2026-10-07
- [x] "Continue from this leaf": recap of root → segment pre-filled into a new Code session (`claude://code/new?q=`) — 2026-10-07
- [ ] Test both links end-to-end from the browser (first click asks to allow opening Claude)
- [ ] Scroll to the exact message when opening a chat (the app's link doesn't support this today)
- [ ] Live chat inside the app, context = path to current node

## Milestone 4b — Live updates
- [ ] Watch transcript files (`fs.watch`) and mark trees stale automatically (free)
- [ ] Incremental classify: send only the new turn + current segment list instead of rebuilding
- [ ] Optional Claude Code `Stop` hook to trigger the incremental update after each reply

## Milestone 5 — Shareable
- [ ] API-key runner (`ClaudeRunner` implementation) for people without Claude Code
- [ ] Setup guide in README for others; sample data for demo mode
