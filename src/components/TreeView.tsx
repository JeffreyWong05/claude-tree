"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { labelFor } from "@/lib/labels";
import { AttachmentList, ScreenshotStrip } from "@/components/Attachments";
import { buildRecap, newSessionUrl, openInClaudeUrl } from "@/lib/links";
import { buildThemes, isDimmed, themeColor, type Spotlight, type ThemeModel } from "@/lib/themes";
import type { Conversation, Segment, TopicTree, Turn } from "@/lib/types";

// The diagram library only loads when the Diagram view is opened.
const TreeDiagram = dynamic(() => import("@/components/TreeDiagram"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted">Loading diagram…</p>,
});

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
      title: labelFor(turn, null),
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
  const [view, setView] = useState<"transcript" | "diagram">("transcript");
  /** Any navigation from the map or diagram: show the transcript, then scroll to the target (e.g. "seg-3"). */
  const goTo = useCallback((target: string) => {
    // Render the transcript synchronously so the target element is visible before scrolling.
    flushSync(() => {
      setMapOpen(false);
      setView("transcript");
    });
    document.getElementById(target)?.scrollIntoView();
    history.replaceState(null, "", `#${target}`);
  }, []);

  const labelOf = useCallback((i: number) => labelFor(conversation.turns[i], tree), [conversation, tree]);
  const themes = useMemo(() => buildThemes(segments, tree?.themes), [segments, tree]);
  const findOf = useCallback((i: number) => conversation.turns[i]?.find ?? null, [conversation]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Copy a prompt's Ctrl+F search phrase, for finding it in the Claude app. */
  const copyFind = useCallback(
    (turnIndex: number) => {
      const find = conversation.turns[turnIndex]?.find;
      if (!find) return;
      copyText(find.phrase);
      const down = find.messagesDown ? `, then scroll down ${find.messagesDown} message${find.messagesDown === 1 ? "" : "s"}` : "";
      setToast(`Copied “${find.phrase}” — in Claude, press Ctrl+F and paste${down} to reach #${turnIndex + 1}.`);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    },
    [conversation],
  );
  /** Shared by the diagram and the sidebar: fade everything except unique ideas or one theme. */
  const [spotlight, setSpotlight] = useState<Spotlight>(null);

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

  const toggle = useCallback(
    (id: number, open?: boolean) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (open ?? !next.has(id)) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );

  const total = conversation.turns.length;
  const unsorted = segments.filter((s) => s.kind === "unsorted").length;

  return (
    <FindContext.Provider value={copyFind}>
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
        <div className="mt-3 grid grid-cols-2 rounded-md border border-border p-0.5 text-sm" role="tablist">
          {(["transcript", "diagram"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                if (v === "transcript") goTo(`turn-${active.turn}`); // back to where you were reading
                else {
                  setView(v);
                  setMapOpen(false);
                }
              }}
              className={`rounded px-2 py-1 ${view === v ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
            >
              {v === "transcript" ? "📜 Transcript" : "🌳 Diagram"}
            </button>
          ))}
        </div>
        <a
          href={openInClaudeUrl(conversation)}
          onClick={() => copyFind(active.turn)}
          title={`Opens this chat in Claude and copies a Ctrl+F search phrase for message #${active.turn + 1}`}
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
            labelOf={labelOf}
            onPick={goTo}
            themes={themes}
            spotlight={spotlight}
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
        {view === "diagram" && (
          <div className="sticky top-4 h-[calc(100vh-6rem)] overflow-hidden rounded-lg border border-border bg-panel md:h-[calc(100vh-3rem)]">
            <TreeDiagram
              segments={segments}
              active={active.segment}
              activeTurn={active.turn}
              expanded={expanded}
              onToggle={toggle}
              labelOf={labelOf}
              onPick={goTo}
              onCopyFind={copyFind}
              themes={themes}
              spotlight={spotlight}
              onSpotlight={setSpotlight}
              findOf={findOf}
              openUrl={openInClaudeUrl(conversation)}
            />
          </div>
        )}
        {/* Kept mounted (just hidden) in Diagram view so reading position and scroll tracking survive. */}
        <div className={`mx-auto max-w-3xl space-y-12 ${view === "diagram" ? "hidden" : ""}`}>
          {segments.map((s) => (
            <SegmentSection key={s.id} segment={s} segments={segments} conversation={conversation} />
          ))}
        </div>
      </main>
      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
    </FindContext.Provider>
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
  themes: ThemeModel | null;
  spotlight: Spotlight;
  segments: Segment[];
  parent: number | null;
  active: { segment: number; turn: number };
  expanded: Set<number>;
  toggle: (id: number, open?: boolean) => void;
  labelOf: (turnIndex: number) => string;
  onPick: (target: string) => void;
}

function TopicNodes(props: TopicNodesProps) {
  const { segments, parent, active, expanded, toggle, labelOf, onPick, themes, spotlight } = props;
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
              className={`my-0.5 flex items-start rounded text-sm ${s.id === active.segment ? "bg-accent-soft font-medium text-accent" : "hover:bg-background"} ${isDimmed(spotlight, themes?.ofSegment.get(s.id)) ? "opacity-35" : ""}`}
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
                onClick={(e) => {
                  e.preventDefault();
                  if (multi) toggle(s.id, true);
                  onPick(`seg-${s.id}`);
                }}
                title={s.summary || undefined}
                className={`flex min-w-0 flex-1 gap-1.5 py-1 pr-2 ${unsorted ? "italic text-muted" : ""}`}
              >
                <span className="w-3 shrink-0 not-italic text-muted">{KIND_ICON[s.kind]}</span>
                <span className="min-w-0 flex-1">
                  <ThemeMark theme={themes?.ofSegment.get(s.id)} />
                  {s.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] not-italic text-muted">{s.startTurn + 1}</span>
              </a>
            </div>
            {multi && open && (
              <ul className="mb-1 ml-7 border-l border-dashed border-border">
                {Array.from({ length: s.endTurn - s.startTurn + 1 }, (_, k) => s.startTurn + k).map((i) => (
                  <li key={i}>
                    <a
                      href={`#turn-${i}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onPick(`turn-${i}`);
                      }}
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
  const copyFind = useContext(FindContext);
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
            onClick={() => copyFind(segment.startTurn)}
            title={`Opens the chat in Claude and copies a Ctrl+F search phrase for message #${segment.startTurn + 1}, where this topic starts`}
            className="rounded-full border border-border px-2.5 py-1 hover:bg-panel"
          >
            Open in Claude ↗ <span className="text-muted">(copies search for #{segment.startTurn + 1})</span>
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
          <TurnView key={t.index} turn={t} conversationId={conversation.id} />
        ))}
      </div>
    </section>
  );
}

function TurnView({ turn, conversationId }: { turn: Turn; conversationId: string }) {
  const tools = [...new Set(turn.tools)];
  const shared = turn.attachments.filter((a) => a.kind !== "screenshot");
  const screenshots = turn.attachments.filter((a) => a.kind === "screenshot");
  return (
    <article id={`turn-${turn.index}`} data-turn={turn.index} className="scroll-mt-14 space-y-3 md:scroll-mt-6">
      <div className="ml-auto max-w-[90%] rounded-lg bg-accent-soft px-4 py-3 text-sm break-words">
        <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span>#{turn.index + 1} · You</span>
          <FindChip turn={turn} />
        </div>
        {turn.user && <div className="whitespace-pre-wrap">{turn.user}</div>}
        <AttachmentList conversationId={conversationId} items={shared} />
      </div>
      {(turn.assistant || tools.length > 0 || screenshots.length > 0) && (
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
          <ScreenshotStrip conversationId={conversationId} items={screenshots} />
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

/** Small inline marker before a topic title: ★ for a unique idea, a colored dot for a recurring theme. */
function ThemeMark({ theme }: { theme: ReturnType<ThemeModel["ofSegment"]["get"]> }) {
  if (!theme) return null;
  if (theme.unique) {
    return (
      <span title="Unique idea" className="mr-1 rounded bg-foreground px-0.5 align-[1px] text-[9px] font-semibold not-italic text-background">
        ★
      </span>
    );
  }
  return (
    <span
      title={`Theme: ${theme.name}`}
      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
      style={{ backgroundColor: themeColor(theme) }}
    />
  );
}

/** Copies a prompt's Ctrl+F search phrase (see lib/findPhrase.ts). */
const FindContext = createContext<(turnIndex: number) => void>(() => {});

function FindChip({ turn }: { turn: Turn }) {
  const copyFind = useContext(FindContext);
  if (!turn.find) return null;
  return (
    <button
      onClick={() => copyFind(turn.index)}
      title="Copy a phrase that appears only once in this chat — paste it into Ctrl+F in Claude to find this message"
      className="rounded-full border border-border bg-panel px-2 py-0.5 font-sans text-[11px] text-muted hover:border-accent hover:text-foreground"
    >
      🔍 “{turn.find.phrase}”{turn.find.messagesDown > 0 && ` +${turn.find.messagesDown}↓`}
    </button>
  );
}

/** Clipboard write with a fallback for browsers that block the async API. */
function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else legacyCopy(text);
}

function legacyCopy(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  el.remove();
}
