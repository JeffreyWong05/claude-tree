import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { listConversations } from "@/lib/sources/claudeCode";
import { listTreeIds } from "@/lib/store";
import { getSetupStatus } from "@/lib/setup";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Claude Tree</h1>
      <p className="mt-1 text-sm text-muted">
        Your Claude Code sessions. Open one and build its topic tree to navigate it later.
      </p>
      <Suspense fallback={null}>
        <SetupPanel />
      </Suspense>
      <Suspense fallback={<p className="mt-8 text-sm text-muted">Loading sessions…</p>}>
        <SessionList />
      </Suspense>
    </main>
  );
}

/** First-run checklist: shows what's missing and how to fix it; collapses to one line once all is well. */
async function SetupPanel() {
  await connection();
  const s = getSetupStatus();
  const ready = s.claude.found && s.transcripts.found;
  if (ready) {
    return (
      <p className="mt-3 text-xs text-muted">
        ✓ Connected to Claude Code {s.claude.version && `(v${s.claude.version})`}
        {!s.desktopApp && " · Claude desktop app not found — “Open in Claude” buttons won’t work"}
      </p>
    );
  }
  return (
    <section className="mt-6 rounded-lg border border-accent bg-accent-soft p-4 text-sm">
      <h2 className="font-semibold">Finish setting up</h2>
      <ol className="mt-2 space-y-3">
        <SetupStep done={s.claude.found} title="Install Claude Code and sign in">
          Claude Tree uses Claude Code to organize your chats (it runs on your Claude subscription — no API key).
          Open a terminal (Windows: PowerShell · Mac: Terminal), run{" "}
          <code className="rounded bg-panel px-1">npm install -g @anthropic-ai/claude-code</code>, then run{" "}
          <code className="rounded bg-panel px-1">claude</code> once and sign in. Restart Claude Tree afterwards.
        </SetupStep>
        <SetupStep done={s.transcripts.found} title="Have at least one Claude Code chat">
          Claude Tree reads the chats Claude Code saves in <code className="rounded bg-panel px-1">{s.transcripts.dir}</code>.
          Chat with Claude Code once (in the terminal or the Claude desktop app’s Code tab), then refresh this page.
        </SetupStep>
        <SetupStep done={s.desktopApp} title="Optional: the Claude desktop app" optional>
          Needed only for the “Open in Claude” and “Continue from this leaf” buttons. Download it from claude.ai/download.
        </SetupStep>
      </ol>
    </section>
  );
}

function SetupStep({ done, title, optional, children }: { done: boolean; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0">{done ? "✅" : optional ? "➖" : "⚠️"}</span>
      <div>
        <div className={done ? "font-medium text-muted line-through" : "font-medium"}>{title}</div>
        {!done && <p className="mt-0.5 text-muted">{children}</p>}
      </div>
    </li>
  );
}

async function SessionList() {
  await connection(); // Reads the filesystem on every request.
  const conversations = listConversations();
  const trees = listTreeIds();

  if (conversations.length === 0) {
    return <p className="mt-8 text-sm text-muted">No Claude Code sessions found in ~/.claude/projects.</p>;
  }

  return (
    <ul className="mt-8 divide-y divide-border rounded-lg border border-border bg-panel">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link href={`/c/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent-soft">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.title}</div>
              <div className="text-xs text-muted">
                {c.project} · {new Date(c.updatedAt).toLocaleDateString()} · {Math.round(c.sizeBytes / 1024)} KB
              </div>
            </div>
            {trees.has(c.id) && (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">tree</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
