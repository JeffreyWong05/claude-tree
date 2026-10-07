"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Conversation, Segment, TopicTree, Turn } from "@/lib/types";

const KIND_ICON: Record<Segment["kind"], string> = {
  root: "◆",
  continue: "→",
  tangent: "↳",
  return: "↩",
};

/** Segments to display: the saved tree, plus a catch-all for turns added since it was built. */
function displaySegments(conversation: Conversation, tree: TopicTree | null): Segment[] {
  const total = conversation.turns.length;
  if (!tree) {
    return [{ id: 0, parent: null, kind: "root", title: "Full conversation", summary: "", startTurn: 0, endTurn: total - 1 }];
  }
  const segments = tree.segments.map((s) => ({ ...s }));
  if (total > tree.turnCount) {
    segments.push({
      id: segments.length,
      parent: segments.length - 1,
      kind: "continue",
      title: "New since tree was built",
      summary: "Rebuild the tree to organize these turns.",
      startTurn: tree.turnCount,
      endTurn: total - 1,
    });
  }
  return segments;
}

export function TreeView({ conversation, tree }: { conversation: Conversation; tree: TopicTree | null }) {
  const segments = useMemo(() => displaySegments(conversation, tree), [conversation, tree]);
  const [active, setActive] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);

  // Scroll spy: highlight the segment currently at the top of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(Number(visible[0].target.getAttribute("data-segment")));
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    document.querySelectorAll("[data-segment]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [segments]);

  const stale = tree !== null && conversation.turns.length > tree.turnCount;

  return (
    <div className="flex min-h-screen w-full">
      <aside
        className={`${mapOpen ? "fixed inset-0 z-20 block" : "hidden"} w-full overflow-y-auto border-r border-border bg-panel p-4 md:sticky md:top-0 md:block md:h-screen md:w-80 md:shrink-0`}
      >
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-muted hover:text-foreground">← Sessions</Link>
          <button onClick={() => setMapOpen(false)} className="text-sm text-muted md:hidden">Close</button>
        </div>
        <h2 className="text-sm font-semibold leading-snug">{conversation.title}</h2>
        <p className="mt-1 text-xs text-muted">
          {conversation.turns.length} turns · {segments.length} topic{segments.length === 1 ? "" : "s"}
        </p>
        <BuildTreeButton id={conversation.id} label={tree ? (stale ? "Rebuild tree (new turns)" : "Rebuild tree") : "Build topic tree"} primary={!tree || stale} />
        <nav className="mt-4">
          <TopicNodes segments={segments} parent={null} active={active} onPick={() => setMapOpen(false)} />
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10">
        <button
          onClick={() => setMapOpen(true)}
          className="sticky top-2 z-10 mb-4 rounded-full border border-border bg-panel px-3 py-1 text-sm shadow-sm md:hidden"
        >
          ☰ Map · {segments[active]?.title}
        </button>
        <div className="mx-auto max-w-3xl space-y-12">
          {segments.map((s) => (
            <SegmentSection key={s.id} segment={s} segments={segments} turns={conversation.turns.slice(s.startTurn, s.endTurn + 1)} />
          ))}
        </div>
      </main>
    </div>
  );
}

function TopicNodes({ segments, parent, active, onPick }: { segments: Segment[]; parent: number | null; active: number; onPick: () => void }) {
  const children = segments.filter((s) => s.parent === parent);
  if (children.length === 0) return null;
  return (
    <ul className={parent === null ? "" : "ml-3 border-l border-border pl-2"}>
      {children.map((s) => (
        <li key={s.id}>
          <a
            href={`#seg-${s.id}`}
            onClick={onPick}
            title={s.summary}
            className={`my-0.5 flex gap-1.5 rounded px-2 py-1 text-sm ${s.id === active ? "bg-accent-soft font-medium text-accent" : "hover:bg-background"}`}
          >
            <span className="w-3 shrink-0 text-muted">{KIND_ICON[s.kind]}</span>
            <span className="min-w-0 flex-1">{s.title}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted">{s.startTurn + 1}</span>
          </a>
          <TopicNodes segments={segments} parent={s.id} active={active} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

function ancestry(segment: Segment, segments: Segment[]): Segment[] {
  const path: Segment[] = [];
  for (let p = segment.parent; p !== null; p = segments[p].parent) path.unshift(segments[p]);
  return path;
}

function SegmentSection({ segment, segments, turns }: { segment: Segment; segments: Segment[]; turns: Turn[] }) {
  const path = ancestry(segment, segments);
  return (
    <section id={`seg-${segment.id}`} data-segment={segment.id} className="scroll-mt-14 md:scroll-mt-6">
      <header className="mb-4 border-b border-border pb-3">
        {path.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1 text-xs text-muted">
            {path.map((p) => (
              <span key={p.id}>
                <a href={`#seg-${p.id}`} className="hover:text-accent">{p.title}</a> ›
              </span>
            ))}
          </div>
        )}
        <h2 className="text-lg font-semibold">
          <span className="mr-2 text-muted">{KIND_ICON[segment.kind]}</span>
          {segment.title}
        </h2>
        {segment.summary && <p className="mt-1 text-sm text-muted">{segment.summary}</p>}
      </header>
      <div className="space-y-6">
        {turns.map((t) => (
          <TurnView key={t.index} turn={t} />
        ))}
      </div>
    </section>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const tools = [...new Set(turn.tools)];
  return (
    <article id={`turn-${turn.index}`} className="space-y-3">
      <div className="ml-auto max-w-[90%] rounded-lg bg-accent-soft px-4 py-3 text-sm whitespace-pre-wrap break-words">
        <div className="mb-1 font-mono text-[10px] text-muted">#{turn.index + 1} · You</div>
        {turn.user}
      </div>
      {(turn.assistant || tools.length > 0) && (
        <div className="rounded-lg border border-border bg-panel px-4 py-3 text-sm break-words">
          <div className="mb-1 font-mono text-[10px] text-muted">Claude</div>
          {tools.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {tools.map((name) => (
                <span key={name} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted">{name}</span>
              ))}
            </div>
          )}
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.assistant}</ReactMarkdown>
          </div>
        </div>
      )}
    </article>
  );
}

function BuildTreeButton({ id, label, primary }: { id: string; label: string; primary: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}/tree`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={build}
        disabled={busy}
        className={`w-full rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${primary ? "bg-accent text-white" : "border border-border hover:bg-background"}`}
      >
        {busy ? "Asking Claude… (up to a minute)" : label}
      </button>
      {error && <p className="mt-2 text-xs whitespace-pre-wrap text-red-600">{error}</p>}
    </div>
  );
}
