# Claude Tree

Long chats with Claude are linear, but your thinking isn't: you dive into a term, ask a side question,
then lose track of where you left off. Claude Tree reads your **Claude Code** chats and turns each one into a
**topic tree** — tangents become branches, returning to a topic becomes a new branch of it — so you can see the
whole conversation at a glance and jump straight to any point.

- 🌳 Topic map and zoomable tree diagram, with themes color-coded and one-off ideas marked ★
- 🔎 Jump to any prompt; copy a Ctrl+F phrase to find it in the Claude app
- 🖼️ Images and files you shared, right inside the chat
- ↗ Reopen a chat in Claude, or start a new one that continues from any branch

Everything runs on your own computer. Your chats never leave it except when you ask Claude to organize one.

---

## Set up (one time, ~10 minutes)

You don't need to know how to code. You'll install two free programs, download Claude Tree, and double-click a file.

### 1. Install Node.js

Node.js is what runs Claude Tree. Go to **[nodejs.org](https://nodejs.org/en/download)**, download the **LTS** version
for your computer, and run the installer with the default options.

### 2. Install Claude Code and sign in

Claude Tree uses Claude Code — Anthropic's coding assistant — to organize your chats. It uses your existing
Claude subscription (Pro or Max); **no API key or extra payment** is needed.

1. Open a terminal:
   - **Windows:** press the Windows key, type `PowerShell`, press Enter.
   - **Mac:** press Cmd+Space, type `Terminal`, press Enter.
2. Paste this and press Enter:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
3. Then type `claude`, press Enter, and follow the steps to sign in with your Claude account.
4. Have at least one conversation with Claude Code — that's what Claude Tree organizes. (You can also chat with
   Claude Code in the **Code** tab of the [Claude desktop app](https://claude.ai/download).)

### 3. Download Claude Tree

On this project's GitHub page, click the green **Code** button → **Download ZIP**, then unzip it somewhere easy
to find, like your Documents folder. *(If you use Git: `git clone` works too.)*

### 4. Start it

- **Windows:** open the folder and double-click **`Start Claude Tree.bat`**.
  If Windows shows "Windows protected your PC", click **More info → Run anyway**.
- **Mac:** open the folder, **right-click** **`Start Claude Tree.command`** → **Open** → **Open**
  (right-click is only needed the first time, because the file was downloaded from the internet).

The first start takes a few minutes while it installs and prepares everything. After that it opens in about
5 seconds. Your browser opens Claude Tree at **http://localhost:3456** automatically.

Claude Tree then **runs quietly in the background** — the small window closes by itself, and you never need a
terminal. It uses about 85 MB of memory, and it only accepts connections from your own computer.

The home page shows a checklist if anything from steps 1–2 is missing, with instructions to fix it.

---

## Everyday use

| | How |
|---|---|
| **Turn on** | Double-click `Start Claude Tree` (or its shortcut). If it's already on, this just opens it. |
| **Open** | Go to **http://localhost:3456** (bookmark it), or use the installed app window — see below. |
| **Turn off** | Click **Turn off Claude Tree** at the bottom of the home page, or double-click `Stop Claude Tree`. |
| **Always on** | Tick **Start Claude Tree automatically when I log in** at the bottom of the home page. |

**In the app:**
1. Pick a chat from the list.
2. Click **Build topic tree**. Claude organizes the chat into topics (takes up to a minute; uses a little of your
   Claude usage). New messages show up as "unorganized" leaves until you click **Rebuild tree**.
3. Browse with the sidebar or the **🌳 Diagram** view. Click a topic to see its prompts; click a prompt to jump to it.

### Make it one click

- **Desktop shortcut (Windows):** right-click `Start Claude Tree.bat` → **Show more options** → **Send to** →
  **Desktop (create shortcut)**.
- **Dock (Mac):** drag `Start Claude Tree.command` to the right side of your Dock.
- **Its own app window:** while Claude Tree is open in **Chrome or Edge**, click the install icon at the right of
  the address bar (or menu **⋮ → Cast, save, and share → Install page as app**). Claude Tree then gets its own
  window and Start-menu/Dock icon. Claude Tree needs to be turned on for the window to load — with
  "start automatically when I log in" ticked, it always is.

### Updating

Download the new ZIP (or run `git pull`) and start Claude Tree as usual — it notices the update and prepares it
automatically. If you downloaded a ZIP into a new folder, copy the old folder's **`data`** folder into the new one
to keep the trees you've already built.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| The black window says Node.js is missing | Install it (step 1), then double-click the start file again. |
| Home page says "Install Claude Code" | Do step 2, then turn Claude Tree off and on again. |
| The page won't load | Claude Tree is off — double-click `Start Claude Tree`. If it still fails, see `data/server.log`. |
| "Build topic tree" shows an error about `claude` | Open a terminal, run `claude`, and make sure you're signed in. |
| The window says the port is in use | Another program uses port 3456. Close it, or set a different port (see below). |
| Mac: "permission denied" | In Terminal, run `chmod +x ` (with a space), drag the `.command` file into the window, press Enter. |
| "Open in Claude" does nothing | Those buttons need the [Claude desktop app](https://claude.ai/download). |

---

## For developers

```bash
npm install
npm run dev          # http://localhost:3000 with hot reload
npm run launch       # what the start files run: install → build if needed → start in the background on :3456
npm run launch -- --stop        # stop the background server
npm run launch -- --foreground  # run it in this terminal instead (logs visible, Ctrl+C to stop)
npm run treeify -- list
npm run treeify -- <session-id>
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3456` | Port used by the launcher |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code executable |
| `CLAUDE_TREE_MODEL` | `sonnet` | Model used to build trees |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where Claude Code transcripts live |
| `CLAUDE_DESKTOP_DIR` | OS default | Claude desktop app data (for "Open in Claude") |

Generated trees are saved in `data/trees/` and are gitignored, since they contain chat content.
See [docs/ROADMAP.md](docs/ROADMAP.md) for what's planned and [docs/DECISIONS.md](docs/DECISIONS.md) for why things
work the way they do.
