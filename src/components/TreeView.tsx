"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fallbackLabel, labelFor } from "@/lib/labels";
import { buildRecap, newSessionUrl, openInClaudeUrl } from "@/lib/links";
import type { Conversation, Segment, TopicTree, Turn } from "@/lib/types";

const KIND_ICON: Record<Segment["kind"], string> = {
  root: "◆",
  continue: "→",
  tangent: "↳",
  return: "↩",
  unsorted: "○",
};

/**
 * Segments to display: the saved tree, then one "unsorted" leaf per message the tree doesn't cover yet.
 * Unsorted leaves hang off the last organized topic and disappear only when the tree is rebuilt.
 */
function displaySegments(conversation: Conversation, tree: TopicTree | null): Segment[] {
  const segments: Segment[] = tree ? tree.segments.map((s) => ({ ...s })) : [];
  const anchor = segments.length ? segments.length - 1 : null;
  for (const turn of conversation.turns.slice(tree?.turnCount ?? 0)) {
    segments.push({
      id: segments.length,
      parent: anchor,
      kind: "unsorted",
      title: fallbackLabel(turn.user),
      summary: "",
      startTurn: turn.index,
      endTurn: turn.index,
    });
  }
  return segments;
}

export function TreeView({ conversation, tree }: { conversation: Conversation; tree: TopicTree | null }) {
  const segments = useMemo(() => displaySegments(conversation, tree), [conversation, tree]);
  const [active, setActive] = useState({ segment: 0, turn: 0 });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [mapOpen, setMapOpen] = useState(false);

  // Scroll spy: track the topic and the message currently at the top of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const turnEl = visible.find((e) => e.target.hasAttribute("data-turn"))?.target;
        if (!turnEl) return;
        const turn = Number(turnEl.getAttribute("data-turn"));
        const segment = Number(turnEl.closest("[data-segment]")?.getAttribute("data-segment") ?? 0);
        setActive({ segment, turn });
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    document.querySelectorAll("[data-turn]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [segments]);

  const toggle = (id: number, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const total = conversation.turns.length;
  const unsorted = segments.filter((s) => s.kind === "unsorted").length;

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
          {total} messages · {segments.length - unsorted} topic{segments.length - unsorted === 1 ? "" : "s"}
        </p>
        <OrganizedMeter total={total} unsorted={unsorted} />
        <a
          href={openInClaudeUrl(conversation)}
          className="mt-3 block w-full rounded-md border border-border px-3 py-1.5 text-center text-sm hover:bg-background"
        >
          Open chat in Claude ↗
        </a>
        <BuildTreeButton
          id={conversation.id}
          label={tree ? (unsorted ? `Rebuild tree (organize ${unsorted} new)` : "Rebuild tree") : "Build topic tree"}
          primary={unsorted > 0}
        />
        <nav className="mt-4">
          <TopicNodes
            segments={segments}
            parent={null}
            active={active}
            expanded={expanded}
            toggle={toggle}
            labelOf={(i) => labelFor(conversation.turns[i], tree)}
            onPick={() => setMapOpen(false)}
          />
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10">
        <button
          onClick={() => setMapOpen(true)}
          className="sticky top-2 z-10 mb-4 rounded-full border border-border bg-panel px-3 py-1 text-sm shadow-sm md:hidden"
        >
          ☰ Map · {segments[active.segment]?.title}
        </button>
        <div className="mx-auto max-w-3xl space-y-12">
          {segments.map((s) => (
            <SegmentSection key={s.id} segment={s} segments={segments} conversation={conversation} />
          ))}
        </div>
      </main>
    </div>
  );
}

/** How much of the chat still needs organizing. */
function OrganizedMeter({ total, unsorted }: { total: number; unsorted: number }) {
  if (total === 0) return null;
  const organized = total - unsorted;
  return (
    <div className="mt-3" title={`${organized} of ${total} messages are organized into topics`}>
      <div className="flex justify-between text-xs">
        <span className={unsorted ? "font-medium text-accent" : "text-muted"}>
          {unsorted ? `${unsorted} unorganized message${unsorted === 1 ? "" : "s"}` : "All messages organized ✓"}
        </span>
        <span className="text-muted">{Math.round((organized / total) * 100)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full bg-accent" style={{ width: `${(organized / total) * 100}%` }} />
      </div>
    </div>
  );
}

interface TopicNodesProps {
  segments: Segment[];
  parent: number | null;
  active: { segment: number; turn: number };
  expanded: Set<number>;
  toggle: (id: number, open?: boolean) => void;
  labelOf: (turnIndex: number) => string;
  onPick: () => void;
}

function TopicNodes(props: TopicNodesProps) {
  const { segments, parent, active, expanded, toggle, labelOf, onPick } = props;
  const children = segments.filter((s) => s.parent === parent);
  if (children.length === 0) return null;
  return (
    <ul className={parent === null ? "" : "ml-3 border-l border-border pl-2"}>
      {children.map((s) => {
        const multi = s.endTurn > s.startTurn;
        const open = expanded.has(s.id);
        const unsorted = s.kind === "unsorted";
        return (
          <li key={s.id}>
            <div
              className={`my-0.5 flex items-start rounded text-sm ${s.id === active.segment ? "bg-accent-soft font-medium text-accent" : "hover:bg-background"}`}
            >
              <button
                onClick={() => multi && toggle(s.id)}
                aria-label={open ? "Hide prompts" : "Show prompts"}
                className={`w-5 shrink-0 py-1 text-center text-xs text-muted ${multi ? "cursor-pointer hover:text-foreground" : "cursor-default"}`}
              >
                {multi ? (open ? "▾" : "▸") : ""}
              </button>
              <a
                href={`#seg-${s.id}`}
                onClick={() => {
                  if (multi) toggle(s.id, true);
                  onPick();
                }}
                title={s.summary || undefined}
                className={`flex min-w-0 flex-1 gap-1.5 py-1 pr-2 ${unsorted ? "italic text-muted" : ""}`}
              >
                <span className="w-3 shrink-0 not-italic text-muted">{KIND_ICON[s.kind]}</span>
                <span className="min-w-0 flex-1">{s.title}</span>
                <span className="shrink-0 font-mono text-[10px] not-italic text-muted">{s.startTurn + 1}</span>
              </a>
            </div>
            {multi && open && (
              <ul className="mb-1 ml-7 border-l border-dashed border-border">
                {Array.from({ length: s.endTurn - s.startTurn + 1 }, (_, k) => s.startTurn + k).map((i) => (
                  <li key={i}>
                    <a
                      href={`#turn-${i}`}
                      onClick={onPick}
                      className={`flex gap-1.5 rounded-r py-0.5 pr-2 pl-2 text-xs ${i === active.turn ? "bg-accent-soft text-accent" : "text-muted hover:bg-background hover:text-foreground"}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{labelOf(i)}</span>
                      <span className="shrink-0 font-mono text-[10px]">#{i + 1}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <TopicNodes {...props} parent={s.id} />
          </li>
        );
      })}
    </ul>
  );
}

function ancestry(segment: Segment, segments: Segment[]): Segment[] {
  const path: Segment[] = [];
  for (let p = segment.parent; p !== null; p = segments[p].parent) path.unshift(segments[p]);
  return path;
}

function SegmentSection({ segment, segments, conversation }: { segment: Segment; segments: Segment[]; conversation: Conversation }) {
  const path = ancestry(segment, segments);
  const turns = conversation.turns.slice(segment.startTurn, segment.endTurn + 1);
  const continueUrl = newSessionUrl(buildRecap(conversation, segments, segment), conversation.cwd);
  const unsorted = segment.kind === "unsorted";
  return (
    <section id={`seg-${segment.id}`} data-segment={segment.id} className="scroll-mt-14 md:scroll-mt-6">
      <header className={`mb-4 border-b pb-3 ${unsorted ? "border-dashed border-border" : "border-border"}`}>
        {path.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1 text-xs text-muted">
            {path.map((p) => (
              <span key={p.id}>
                <a href={`#seg-${p.id}`} className="hover:text-accent">{p.title}</a> ›
              </span>
            ))}
          </div>
        )}
        <h2 className={unsorted ? "text-base font-medium text-muted" : "text-lg font-semibold"}>
          <span className="mr-2 text-muted">{KIND_ICON[segment.kind]}</span>
          {unsorted ? `Unorganized · ${segment.title}` : segment.title}
        </h2>
        {segment.summary && <p className="mt-1 text-sm text-muted">{segment.summary}</p>}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <a
            href={openInClaudeUrl(conversation)}
            title={`Opens the original chat in Claude. This topic starts at message #${segment.startTurn + 1}.`}
            className="rounded-full border border-border px-2.5 py-1 hover:bg-panel"
          >
            Open in Claude ↗ <span className="text-muted">(starts at #{segment.startTurn + 1})</span>
          </a>
          <a
            href={continueUrl}
            title="Starts a new Claude Code session pre-filled with a recap of this branch"
            className="rounded-full bg-accent px-2.5 py-1 text-white hover:opacity-90"
          >
            Continue from this leaf ↗
          </a>
        </div>
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
    <article id={`turn-${turn.index}`} data-turn={turn.index} className="scroll-mt-14 space-y-3 md:scroll-mt-6">
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
