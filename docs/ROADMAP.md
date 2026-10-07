# Roadmap

Tick items off as they land; add dates when a milestone completes.

## Milestone 1 — Tree viewer for Claude Code sessions ✅ (scaffolded 2026-10-06)
- [x] Parse Claude Code JSONL transcripts into turns (skip tool results, sidechains, system reminders)
- [x] `treeify` via `claude -p` → segments with parent/kind/title/summary
- [x] Repair malformed model output (non-increasing starts, bad parents, bad kinds)
- [x] Session list + topic map sidebar + click-to-jump + scroll-spy highlight
- [x] "Build tree" button in UI and `npm run treeify` CLI
- [x] Stale-tree detection ("New since tree was built")
- [ ] Install Claude Code CLI, log in, and run a real treeify end-to-end
- [ ] Tune the treeify prompt on 3–4 real long sessions

## Milestone 2 — Better navigation
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
- [ ] "Resume here": generate a context prompt from root → selected segment to start a new chat focused on that branch
- [ ] Live chat inside the app, context = path to current node

## Milestone 5 — Shareable
- [ ] API-key runner (`ClaudeRunner` implementation) for people without Claude Code
- [ ] Setup guide in README for others; sample data for demo mode
