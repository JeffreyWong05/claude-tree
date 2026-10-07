# Claude Tree

Long chats with Claude are linear, but your thinking isn't: you dive into a term, ask a side question,
then try to find where you left off. Claude Tree reads your Claude Code sessions and organizes them into a
**topic tree**: tangents become branches, and returning to a topic becomes a new branch of that topic.
Click any node to jump straight to that point in the conversation.

## Requirements

- Node.js 20+
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and logged in (`claude` on your PATH).
  Building a tree runs `claude -p` once per conversation using your Claude subscription. No API key needed.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick a session, and click **Build topic tree**.

Or from the terminal:

```bash
npm run treeify -- list
npm run treeify -- <session-id>
```

## Configuration (optional)

| Env var | Default | Purpose |
|---|---|---|
| `CLAUDE_BIN` | `claude` | Path to the Claude Code executable |
| `CLAUDE_TREE_MODEL` | `sonnet` | Model used to build trees |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where Claude Code transcripts live |

Generated trees are saved in `data/trees/` and are gitignored, since they contain your chat content.

See [docs/ROADMAP.md](docs/ROADMAP.md) for what's planned and [docs/DECISIONS.md](docs/DECISIONS.md) for why things work the way they do.
