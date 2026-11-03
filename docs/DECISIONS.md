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

## 2026-10-18 — Non-coder launch: thin double-click wrappers around one Node script
`Start Claude Tree.bat` / `.command` only check that Node exists (opening nodejs.org if not) and run
`scripts/launch.mjs`, which holds all logic once, cross-platform: `npm install` when `package-lock.json` is newer
than the last install, `next build` when any source is newer than `.next/BUILD_ID` (so downloaded updates rebuild
themselves), a Claude Code check, then `next start` on port 3456 and open the browser once `/api/health` answers.
Production mode, not `next dev`: faster pages, and it avoids the dev server's crash-after-many-reloads issue.
Port 3456 (not 3000) so it doesn't collide with other dev servers. `.gitattributes` pins CRLF for `.bat` and LF
for `.command`, and the `.command` file is committed executable (mode 100755).

## 2026-10-20 — Background server with in-app on/off; local-only binding
Starting Claude Tree shouldn't need a terminal. The launcher now prepares the app in its (brief) window, then
spawns `next start` detached and hidden (`windowsHide`), records the PID in `data/server.pid`, logs to
`data/server.log`, and exits. Next is run via `node node_modules/next/dist/bin/next` (not npm) so the PID is the
server itself. Off: the in-app button (`POST /api/server`, then `process.exit`) or `launch.mjs --stop`
(`taskkill /t` on Windows, process-group kill elsewhere). Start-at-login is an in-app switch: a minimized
Startup-folder shortcut on Windows, a LaunchAgent on Mac (untested). Idle cost ~85 MB RAM.
- The server binds **127.0.0.1** only — before this, `next start` also listened on the LAN, exposing chats to
  anyone on the same Wi-Fi.
- `POST /api/server` requires an `x-claude-tree: 1` header and a same-origin `Sec-Fetch-Site`, so another website
  open in the browser can't turn the server off or edit login items (a custom header forces a CORS preflight,
  which is never approved).
- The off button appears only when the launcher started the server (`CLAUDE_TREE_MANAGED=1`), never under `npm run dev`.
- Build output is hidden unless the build fails: it prints deployment-only file-tracing warnings that would
  alarm non-developers.

## 2026-10-21 — Lean `claude -p` calls
Measured: a default `claude -p` call carries ~38k tokens of Claude Code's own system prompt, tool definitions and
MCP tools (12.9k cache write + 25.3k cache read for a 4-token reply). Sorting a transcript needs none of it, so the
runner passes `--system-prompt "<one line>" --tools "" --strict-mcp-config --no-session-persistence`: overhead
drops to ~1.3k tokens, and a full rebuild of a 1-prompt chat measured 2.9k tokens total. `--bare` would go further
but requires an API key (ignores subscription OAuth). On Windows `claude` is an npm `.cmd` shim that needs
`shell: true`, which joins args unquoted — the runner quotes args itself so `""` and the prompt survive.
Each saved tree records `usage`, shown in the sidebar, so the cost is visible rather than estimated.

## 2026-10-21 — Live leaves via file watching, not live sorting
New prompts should appear immediately, but sorting each one with Claude costs ~2–2.5k tokens per prompt. So the
free half ships: `/api/watch` streams Server-Sent Events from `fs.watch` (OS notifications — idle cost is zero),
batched 1.5 s on the server; the page calls `router.refresh()` at most every 3 s and only while visible, keeping
client state (opened topics, diagram zoom, scroll). New prompts appear as unorganized leaves; Rebuild still sorts
them. Live sorting stays an optional future switch.

## 2026-10-22 — Message search runs locally, keyed on answer shape + keywords
Requests like "messages with a chart with links" or "step-by-step directions" describe what an answer looks like,
not its words, so `lib/search.ts` detects shapes per message (markdown tables, numbered lists, links, code blocks,
headings, bullets, images/files from attachments) and maps everyday words to them ("chart" → table,
"directions" → steps). Shape words are requirements; other words are keywords (word-prefix match, light stemming,
IDF-weighted, your own prompt text weighted above Claude's, all words required); "quoted" text is an exact phrase.
The parsed query is shown ("Looking for 📊 table/chart + 🔗 links") so the interpretation isn't a black box.
No Claude tokens and ~2 ms per query on a 30-message chat. Semantic "Ask Claude" search is left as an optional
later add-on because each query would cost roughly a rebuild's worth of tokens.

## 2026-11-02 — Summary written during rebuild; Back is an in-app stack
The written overview is one more field in the rebuild reply ("overview", markdown with [text](#seg-N) links), so it
costs no extra call or overhead — measured +~320 output tokens on a small chat — and is grounded in the full
transcript rather than just topic titles. Links to non-existent segments are unwrapped at parse time. The topic
outline and "not yet summarized" list are built from saved data, so the Summary view opens instantly and older
trees still get a useful page.
Back is an in-app stack of {view, scrollY, label}, pushed by every `goTo`/view switch (cap 50), popped by the
"← Back to …" button or Backspace (ignored while typing). Browser history wasn't used: hash jumps already use
`replaceState`, and pushing entries would make the browser's own Back step through every jump before leaving.

## 2026-11-02 — Always-on reliability: separate build folder, in-app restart, catch-up after sleep
Investigating "the app shuts down when I'm away" found three causes: (1) Windows power-offs/restarts end background
programs (start-at-login was off); (2) the PC sleeps often — the server survives, but open pages lost their live
connection; (3) a developer `next build` replaced `.next` under the running production server, causing
ChunkLoadError / MODULE_NOT_FOUND (this is what looked like a crash).
- The launcher builds and runs the everyday app with `CLAUDE_TREE_DIST=.next-app` (`distDir` in next.config.ts), so
  `next build` / `next dev` (`.next`) can't touch it. `next build` added `.next-app/types` to tsconfig includes.
- In-app Restart: the server spawns `launch.mjs --restart --after-exit` detached and then exits itself — killing the
  server from the launcher would also kill the launcher (its child; `taskkill /t`). The launcher waits for the port,
  rebuilds if sources are newer than the build, and starts again; the page polls `/api/health.startedAt` and reloads.
  Launcher child processes use `windowsHide` so nothing pops up when it runs without a console.
- `useLiveUpdates` refreshes once when its EventSource reconnects after an error (sleep, restart).
- The start-at-login switch is recommended on the home page; the log is trimmed past 1 MB.
- Next.js upgraded 16.4.0 → 16.4.4: the build refused to run on 16.4.0 (critical RCE advisories, confirmed via
  `npm audit`). Used a plain `npm install next@16.4.4` rather than the build's suggested automated upgrade command.
  Remaining audit findings are in ESLint's dependencies (dev-only, not in the running app).
