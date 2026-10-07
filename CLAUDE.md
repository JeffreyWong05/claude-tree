@AGENTS.md

# Claude Tree

Turns long, linear Claude chats into a **topic tree** you can navigate: each topic shift becomes a
segment, tangents branch off as children, and returning to an earlier topic creates a new child of
that topic. Personal tool first, but keep it easy for others to clone and run.

Start of every session: read `docs/ROADMAP.md` (what's next) and `docs/DECISIONS.md` (why things are the way they are).

## How it works

1. **Source**: Claude Code transcripts in `~/.claude/projects/<project>/<session-id>.jsonl`
   → `src/lib/sources/claudeCode.ts` flattens them into `Turn[]` (one user prompt + Claude's reply text).
2. **Treeify (on demand, not per message)**: `src/lib/treeify.ts` sends a clipped transcript to Claude
   once and gets back segments `{start, parent, kind, title, summary}`. `parseSegments` repairs bad output.
3. **Runner**: `src/lib/runner.ts` — `ClaudeRunner` interface. Only implementation today is `cliRunner`
   (`claude -p`, uses the user's Claude subscription, no API key). Add an API-key runner behind the same interface.
4. **Store**: trees are cached in `data/trees/<id>.json` (gitignored — contains chat content).
5. **UI**: `/` lists sessions; `/c/[id]` shows the topic map (sidebar) + transcript grouped by segment.

## Commands

```bash
npm run dev                         # http://localhost:3000
npm run treeify -- list             # recent sessions
npm run treeify -- <id>             # build + save a tree from the terminal
npm run treeify -- <id> --dry       # print the prompt without calling Claude
npx tsc --noEmit && npx eslint src scripts
```

## Conventions

- Next.js 16 with `cacheComponents`: pages that read the filesystem wrap an async child in `<Suspense>`
  and call `await connection()` (or await `params`). Read `node_modules/next/dist/docs/` before using new APIs.
- Domain types live in `src/lib/types.ts`. Segments are contiguous turn ranges; `parent` always points to an earlier segment.
- Never commit anything under `data/` or any `.env*` file.
- Env vars: `CLAUDE_BIN` (path to claude), `CLAUDE_TREE_MODEL` (default `sonnet`), `CLAUDE_PROJECTS_DIR`.
