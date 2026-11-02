"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildIndex, FEATURE_LABEL, search, type SearchHit } from "@/lib/search";
import type { Segment, Turn } from "@/lib/types";

/**
 * Discord-style in-app search: a box at the top of the sidebar; while it has text, the sidebar lists
 * matching messages (they stay put as you jump between them), each with an optional peek at the
 * messages around it. Ctrl+F focuses the box; Ctrl+F again falls through to the browser's own find.
 */
export function SearchPanel({
  turns,
  segments,
  labelOf,
  onJump,
  children,
}: {
  turns: Turn[];
  segments: Segment[];
  labelOf: (turnIndex: number) => string;
  /** Show the transcript and scroll to a message. */
  onJump: (turnIndex: number) => void;
  /** What the sidebar shows when there's no search (the topic map). */
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [current, setCurrent] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  const index = useMemo(() => buildIndex(turns), [turns]);
  const { query: parsed, hits } = useMemo(() => search(index, deferred), [index, deferred]);

  // Ctrl/Cmd+F → this box. Pressed again while the box is focused → the browser's normal find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
      if (document.activeElement === input.current) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const jumpTo = (hitPosition: number) => {
    const hit = hits[hitPosition];
    if (!hit) return;
    setCurrent(hitPosition);
    onJump(hit.index);
  };

  const segmentOf = (i: number) => segments.find((s) => i >= s.startTurn && i <= s.endTurn);
  const active = query.trim().length > 0;

  return (
    <>
      <div className="relative mt-3">
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrent(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits.length) {
              e.preventDefault();
              const step = e.shiftKey ? -1 : 1;
              jumpTo((current + step + hits.length) % hits.length);
            } else if (e.key === "Escape") {
              if (query) setQuery("");
              else input.current?.blur();
            }
          }}
          placeholder="Search messages…  (Ctrl+F)"
          aria-label="Search messages in this chat"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 pr-7 text-sm outline-none focus:border-accent"
        />
        {active && (
          <button
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {!active ? (
        children
      ) : (
        <div className="mt-3">
          <QuerySummary features={parsed.features.map((f) => FEATURE_LABEL[f])} words={[...parsed.phrases.map((p) => `“${p}”`), ...parsed.terms]} />
          <div className="mt-1 mb-2 flex items-center justify-between text-xs text-muted">
            <span>
              {hits.length === 0 ? "No messages match" : `${hits.length} message${hits.length === 1 ? "" : "s"}`}
              {current >= 0 && hits.length > 0 && ` · ${current + 1} of ${hits.length}`}
            </span>
            {hits.length > 1 && <span title="Next / previous result">Enter ↓ · Shift+Enter ↑</span>}
          </div>
          <ul className="space-y-2">
            {hits.map((hit, pos) => (
              <ResultCard
                key={hit.index}
                hit={hit}
                selected={pos === current}
                topic={segmentOf(hit.index)}
                turns={turns}
                labelOf={labelOf}
                onOpen={() => jumpTo(pos)}
                onJump={onJump}
              />
            ))}
          </ul>
          {hits.length === 0 && (
            <p className="text-xs text-muted">
              Try fewer words, or describe the answer’s shape: “a table”, “step-by-step”, “links”, “code”, “screenshot”.
              Put exact wording in “quotes”.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** Shows how the query was understood, so natural-language searches aren't a black box. */
function QuerySummary({ features, words }: { features: string[]; words: string[] }) {
  if (!features.length && !words.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
      <span>Looking for</span>
      {features.map((f) => (
        <span key={f} className="rounded bg-background px-1.5 py-0.5 text-foreground">{f}</span>
      ))}
      {features.length > 0 && words.length > 0 && <span>+</span>}
      {words.map((w) => (
        <span key={w} className="rounded border border-border px-1.5 py-0.5 text-foreground">{w}</span>
      ))}
    </div>
  );
}

function ResultCard({
  hit,
  selected,
  topic,
  turns,
  labelOf,
  onOpen,
  onJump,
}: {
  hit: SearchHit;
  selected: boolean;
  topic: Segment | undefined;
  turns: Turn[];
  labelOf: (turnIndex: number) => string;
  onOpen: () => void;
  onJump: (turnIndex: number) => void;
}) {
  const [context, setContext] = useState(false);
  return (
    <li className={`rounded-md border text-xs ${selected ? "border-accent bg-accent-soft" : "border-border bg-panel"}`}>
      <button onClick={onOpen} className="w-full px-2.5 py-2 text-left">
        <div className="flex items-center gap-1.5 text-muted">
          <span className="font-mono text-foreground">#{hit.index + 1}</span>
          <span className="min-w-0 flex-1 truncate" title={topic?.title}>{topic?.title}</span>
          <span>{hit.side}</span>
        </div>
        {hit.matchedFeatures.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {hit.matchedFeatures.map(({ feature }) => (
              <span key={feature} className="rounded bg-background px-1 text-[10px] text-muted">{FEATURE_LABEL[feature]}</span>
            ))}
          </div>
        )}
        <p className="mt-1 leading-snug text-foreground">
          <Highlighted text={hit.snippet} words={hit.highlight} />
        </p>
      </button>
      <div className="border-t border-border px-2.5 py-1">
        <button onClick={() => setContext((c) => !c)} className="text-[11px] text-muted hover:text-foreground">
          {context ? "▾ Hide context" : "▸ Show context"}
        </button>
        {context && <Context center={hit.index} turns={turns} labelOf={labelOf} onJump={onJump} />}
      </div>
    </li>
  );
}

/** The messages around a result: one before and one after, each a jump target. */
function Context({ center, turns, labelOf, onJump }: { center: number; turns: Turn[]; labelOf: (i: number) => string; onJump: (i: number) => void }) {
  const preview = (text: string) => text.replace(/[*_`#>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);
  return (
    <ol className="mt-1 mb-1 space-y-1 border-l-2 border-border pl-2">
      {[center - 1, center, center + 1]
        .filter((i) => i >= 0 && i < turns.length)
        .map((i) => (
          <li key={i}>
            <button
              onClick={() => onJump(i)}
              className={`w-full rounded px-1 py-0.5 text-left hover:bg-background ${i === center ? "bg-background" : ""}`}
            >
              <div className="flex gap-1.5">
                <span className="font-mono text-muted">#{i + 1}</span>
                <span className={`min-w-0 flex-1 truncate ${i === center ? "font-medium" : ""}`}>{labelOf(i)}</span>
                {i === center && <span className="text-muted">match</span>}
              </div>
              {turns[i].assistant && <div className="truncate text-[10px] text-muted">Claude: {preview(turns[i].assistant)}</div>}
            </button>
          </li>
        ))}
    </ol>
  );
}

function Highlighted({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-accent/25 px-0.5 text-foreground">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
