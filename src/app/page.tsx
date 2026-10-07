import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { listConversations } from "@/lib/sources/claudeCode";
import { listTreeIds } from "@/lib/store";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Claude Tree</h1>
      <p className="mt-1 text-sm text-muted">
        Your Claude Code sessions. Open one and build its topic tree to navigate it later.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-muted">Loading sessions…</p>}>
        <SessionList />
      </Suspense>
    </main>
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
