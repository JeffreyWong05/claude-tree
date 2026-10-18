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
- [x] Diagram view: top-down tree (React Flow + d3-hierarchy tidy layout), zoom/pan/fit, minimap, click a node to read it — 2026-10-17
- [x] Diagram nodes open to list their prompts (shared open/closed state with the sidebar); prompt → jump, "Read topic →" — 2026-10-18
- [x] Theme colors: rebuild groups topics into named themes; recurring themes get palette colors, one-off themes are ★ "unique ideas"; spotlight a theme or all unique ideas (diagram + sidebar) — 2026-10-18
- [ ] Optional: tentatively match unorganized messages to an existing theme locally (TF-IDF) before a rebuild
- [ ] Diagram: many unorganized siblings make the tree very wide — consider grouping them into one collapsible node
- [ ] Collapse/expand subtrees; collapse long Claude replies
- [ ] Manual edits: rename a segment, move a split point, re-parent a segment (saved to the tree file)
- [ ] Search across sessions and segment titles/summaries
- [ ] "Where was I?" — one-paragraph recap of a branch's path from root

## Milestone 2b — Attachments
- [x] Pasted images inline (click to enlarge); images from Claude's tools collapsed per reply — 2026-10-08
- [x] @-attached files as chips with previews: PDF, CSV table (first 200 rows), text/code — 2026-10-08
- [ ] Verify how @-attached text/CSV/notebook files are stored (only a PDF example existed when built)
- [ ] "Files touched" per topic (files Claude read/wrote/edited) with open-in-VS Code links
- [ ] Notebook (.ipynb) preview: markdown, code, text + image outputs
- [ ] Excel preview (first sheet) — needs a parser library

## Milestone 3 — More sources
- [ ] Import claude.ai export (`conversations.json`, Settings → Privacy → Export data)
- [ ] Chunked treeify for very long sessions (current hard limit ~150k chars of clipped transcript)
- [ ] Follow `parentUuid` for rewound/edited Claude Code sessions instead of file order

## Milestone 4 — Continue from a leaf
- [x] "Open in Claude" deep link per topic (`claude://code/continue`, `claude://resume` fallback) — 2026-10-07
- [x] "Continue from this leaf": recap of root → segment pre-filled into a new Code session (`claude://code/new?q=`) — 2026-10-07
- [ ] Test both links end-to-end from the browser (first click asks to allow opening Claude)
- [ ] Scroll to the exact message when opening a chat (the app's link doesn't support this today)
- [x] Workaround: per-prompt Ctrl+F "find phrase" (shortest run of the prompt's words unique in the chat); "Open in Claude" copies it; 🔍 chips in transcript and diagram — 2026-10-18
- [ ] Live chat inside the app, context = path to current node

## Milestone 4b — Live updates
- [ ] Watch transcript files (`fs.watch`) and mark trees stale automatically (free)
- [ ] Incremental classify: send only the new turn + current segment list instead of rebuilding
- [ ] Optional Claude Code `Stop` hook to trigger the incremental update after each reply

## Milestone 5 — Shareable
- [ ] API-key runner (`ClaudeRunner` implementation) for people without Claude Code
- [x] Double-click launchers (`Start Claude Tree.bat` / `.command`) → `scripts/launch.mjs`: install, build when changed, check Claude Code, start on :3456, open browser — 2026-10-18
- [x] Home-page setup checklist (`/api/health`), installable app manifest + icons, non-coder README — 2026-10-18
- [x] Published: https://github.com/JeffreyWong05/claude-tree (public) — 2026-10-18
- [ ] Test the Mac launcher on a real Mac (written blind: Gatekeeper, PATH from Finder, nvm/Homebrew)
- [ ] Sample data / demo mode for people without Claude Code chats yet
