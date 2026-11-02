"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { themeColor, type ThemeModel } from "@/lib/themes";
import type { Conversation, Segment, TopicTree } from "@/lib/types";

const KIND_ICON: Record<Segment["kind"], string> = {
  root: "◆",
  continue: "→",
  tangent: "↳",
  return: "↩",
  unsorted: "○",
};

/**
 * One-page overview of the chat: Claude's written summary (saved at rebuild, linking to topics), an outline
 * of every topic with its one-line summary, and the messages added since the last rebuild.
 * Everything here is already saved, so the page costs no tokens to open.
 */
export function SummaryView({
  conversation,
  tree,
  segments,
  themes,
  labelOf,
  onGo,
}: {
  conversation: Conversation;
  tree: TopicTree | null;
  segments: Segment[];
  themes: ThemeModel | null;
  labelOf: (turnIndex: number) => string;
  /** Jump to "seg-N" or "turn-N" in the transcript. */
  onGo: (target: string) => void;
}) {
  const organized = segments.filter((s) => s.kind !== "unsorted");
  const unsorted = segments.filter((s) => s.kind === "unsorted");
  const uniqueCount = themes?.themes.filter((t) => t.unique).length ?? 0;
  const recurringCount = (themes?.themes.length ?? 0) - uniqueCount;

  return (
    <article className="mx-auto max-w-3xl pb-16">
      <h1 className="text-xl font-semibold">{conversation.title}</h1>
      <p className="mt-1 text-xs text-muted">
        {conversation.turns.length} messages · {organized.length} topics
        {themes && ` · ${recurringCount} recurring themes · ${uniqueCount} unique ideas`}
        {tree && ` · tree built ${new Date(tree.generatedAt).toLocaleDateString()}`}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Overview</h2>
        {tree?.overview ? (
          <div className="prose-chat mt-2 text-[15px] leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // "#seg-3" / "#turn-12" links jump inside the app (and can be undone with Back).
                a: ({ href, children }) =>
                  href?.startsWith("#seg-") || href?.startsWith("#turn-") ? (
                    <button
                      onClick={() => onGo(href.slice(1))}
                      className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    >
                      {children}
                    </button>
                  ) : (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
              }}
            >
              {tree.overview}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="mt-2 rounded-md border border-dashed border-border p-3 text-sm text-muted">
            {tree
              ? "A written summary is created the next time you rebuild the tree (it adds only a few seconds). The topic outline below is ready now."
              : "Build the topic tree to get a written summary and a topic outline."}
          </p>
        )}
      </section>

      {organized.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Topics</h2>
          <TopicOutline segments={organized} parent={null} themes={themes} onGo={onGo} />
        </section>
      )}

      {unsorted.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Not yet summarized</h2>
          <p className="mt-1 text-xs text-muted">
            {unsorted.length} message{unsorted.length === 1 ? "" : "s"} added since the last rebuild.
          </p>
          <ul className="mt-2 space-y-0.5">
            {unsorted.map((s) => (
              <li key={s.id}>
                <button onClick={() => onGo(`turn-${s.startTurn}`)} className="flex gap-2 text-left text-sm hover:text-accent">
                  <span className="w-8 shrink-0 font-mono text-xs text-muted">#{s.startTurn + 1}</span>
                  <span>{labelOf(s.startTurn)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function TopicOutline({
  segments,
  parent,
  themes,
  onGo,
}: {
  segments: Segment[];
  parent: number | null;
  themes: ThemeModel | null;
  onGo: (target: string) => void;
}) {
  const children = segments.filter((s) => s.parent === parent);
  if (!children.length) return null;
  return (
    <ul className={parent === null ? "mt-2 space-y-3" : "mt-2 ml-4 space-y-3 border-l border-border pl-3"}>
      {children.map((s) => {
        const theme = themes?.ofSegment.get(s.id);
        const range = s.startTurn === s.endTurn ? `#${s.startTurn + 1}` : `#${s.startTurn + 1}–${s.endTurn + 1}`;
        return (
          <li key={s.id}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted">{KIND_ICON[s.kind]}</span>
              <button onClick={() => onGo(`seg-${s.id}`)} className="text-left font-medium hover:text-accent hover:underline">
                {s.title}
              </button>
              <button onClick={() => onGo(`turn-${s.startTurn}`)} className="font-mono text-xs text-muted hover:text-accent">
                {range}
              </button>
              {theme &&
                (theme.unique ? (
                  <span className="rounded bg-foreground px-1 text-[10px] font-semibold text-background">★ Unique idea</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: themeColor(theme) }} />
                    {theme.name}
                  </span>
                ))}
            </div>
            {s.summary && <p className="mt-0.5 text-sm text-muted">{s.summary}</p>}
            <TopicOutline segments={segments} parent={s.id} themes={themes} onGo={onGo} />
          </li>
        );
      })}
    </ul>
  );
}
