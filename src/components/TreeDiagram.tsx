"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { hierarchy, tree } from "d3-hierarchy";
import { isDimmed, themeColor, type Spotlight, type ThemeInfo, type ThemeModel } from "@/lib/themes";
import type { FindPhrase, Segment } from "@/lib/types";

const NODE_W = 210;
const NODE_H = 72;
/** Extra height of an opened node: one row per prompt plus the "Read topic" row. */
const PROMPT_ROW_H = 22;
/** Row height when each prompt also shows its Ctrl+F search phrase underneath. */
const PROMPT_ROW_WITH_PHRASE_H = 38;
const OPEN_EXTRA_H = 40;
const H_GAP = 36;
const V_GAP = 70;

const KIND_ICON: Record<Segment["kind"], string> = {
  root: "◆",
  continue: "→",
  tangent: "↳",
  return: "↩",
  unsorted: "○",
};

/** How the line into a node is drawn, so the kind of branch is visible at a glance. */
const EDGE_DASH: Record<Segment["kind"], string | undefined> = {
  root: undefined,
  continue: undefined,
  tangent: "6 4",
  return: "2 4",
  unsorted: "3 3",
};

type Prompt = { index: number; label: string; find: FindPhrase | null };
type TopicData = {
  segment: Segment | null;
  active: boolean;
  open: boolean;
  prompts: Prompt[];
  activeTurn: number;
  onPick: (target: string) => void;
  onCopyFind: (turnIndex: number) => void;
  theme?: ThemeInfo;
  dim: boolean;
  showPhrases: boolean;
};
type TopicNode = Node<TopicData, "topic">;

interface LayoutNode {
  segment: Segment | null; // null = synthetic root when there are several top-level topics
  children: LayoutNode[];
}

interface LayoutInput {
  segments: Segment[];
  active: number;
  activeTurn: number;
  expanded: Set<number>;
  labelOf: (turnIndex: number) => string;
  onPick: (target: string) => void;
  onCopyFind: (turnIndex: number) => void;
  themes: ThemeModel | null;
  spotlight: Spotlight;
  findOf: (turnIndex: number) => FindPhrase | null;
  showPhrases: boolean;
}

function heightOf(segment: Segment | null, expanded: Set<number>, showPhrases: boolean): number {
  if (!segment || !expanded.has(segment.id)) return NODE_H;
  const row = showPhrases ? PROMPT_ROW_WITH_PHRASE_H : PROMPT_ROW_H;
  return NODE_H + OPEN_EXTRA_H + (segment.endTurn - segment.startTurn + 1) * row;
}

/**
 * Tidy top-down tree layout (Reingold–Tilford via d3-hierarchy) for x positions.
 * Rows are spaced by the tallest node at each depth, so opened nodes never overlap the row below.
 */
function layout({ segments, active, activeTurn, expanded, labelOf, onPick, onCopyFind, themes, spotlight, findOf, showPhrases }: LayoutInput): { nodes: TopicNode[]; edges: Edge[] } {
  const byId = new Map<number, LayoutNode>(segments.map((s) => [s.id, { segment: s, children: [] }]));
  const roots: LayoutNode[] = [];
  for (const s of segments) {
    const node = byId.get(s.id)!;
    if (s.parent !== null && byId.has(s.parent)) byId.get(s.parent)!.children.push(node);
    else roots.push(node);
  }
  const top: LayoutNode = roots.length === 1 ? roots[0] : { segment: null, children: roots };

  const root = hierarchy(top, (d) => d.children);
  tree<LayoutNode>().nodeSize([NODE_W + H_GAP, NODE_H + V_GAP])(root);

  const rowHeight: number[] = [];
  for (const d of root.descendants()) rowHeight[d.depth] = Math.max(rowHeight[d.depth] ?? 0, heightOf(d.data.segment, expanded, showPhrases));
  const rowY: number[] = [0];
  for (let i = 1; i < rowHeight.length; i++) rowY[i] = rowY[i - 1] + rowHeight[i - 1] + V_GAP;

  const idOf = (n: LayoutNode) => (n.segment ? String(n.segment.id) : "conversation");
  const nodes: TopicNode[] = root.descendants().map((d) => {
    const seg = d.data.segment;
    const open = !!seg && expanded.has(seg.id);
    const theme = seg ? themes?.ofSegment.get(seg.id) : undefined;
    return {
      id: idOf(d.data),
      type: "topic",
      position: { x: (d.x ?? 0) - NODE_W / 2, y: rowY[d.depth] },
      data: {
        segment: seg,
        active: seg?.id === active,
        open,
        prompts: open
          ? Array.from({ length: seg.endTurn - seg.startTurn + 1 }, (_, k) => seg.startTurn + k).map((i) => ({ index: i, label: labelOf(i), find: findOf(i) }))
          : [],
        activeTurn,
        onPick,
        onCopyFind,
        theme,
        dim: !!seg && isDimmed(spotlight, theme),
        showPhrases,
      },
      // Known sizes: the nodes are read-only (no onNodesChange), so React Flow never stores measured
      // dimensions on them, and the minimap skips nodes without a size.
      initialWidth: NODE_W,
      initialHeight: heightOf(seg, expanded, showPhrases),
      draggable: false,
      connectable: false,
    };
  });
  const dimmed = new Set(nodes.filter((n) => n.data.dim).map((n) => n.id));
  const edges: Edge[] = root.links().map(({ source, target }) => {
    const kind = target.data.segment?.kind ?? "continue";
    const faded = dimmed.has(idOf(target.data));
    return {
      id: `${idOf(source.data)}-${idOf(target.data)}`,
      source: idOf(source.data),
      target: idOf(target.data),
      type: "smoothstep",
      // Neutral lines: color is reserved for themes; the dash pattern carries the branch type.
      style: {
        stroke: "var(--muted)",
        strokeWidth: 1.5,
        strokeDasharray: EDGE_DASH[kind],
        opacity: faded ? 0.15 : kind === "unsorted" ? 0.5 : 0.85,
      },
    };
  });
  return { nodes, edges };
}

function TopicCard({ data }: NodeProps<TopicNode>) {
  const s = data.segment;
  const hidden = { opacity: 0, pointerEvents: "none" as const };
  if (!s) {
    return (
      <div className="rounded-full border border-border bg-panel px-4 py-2 text-sm font-semibold" style={{ width: NODE_W }}>
        Conversation
        <Handle type="source" position={Position.Bottom} style={hidden} />
      </div>
    );
  }
  const unsorted = s.kind === "unsorted";
  const count = s.endTurn - s.startTurn + 1;
  const range = count === 1 ? `#${s.startTurn + 1}` : `#${s.startTurn + 1}–${s.endTurn + 1}`;
  const t = data.theme;
  const color = themeColor(t);
  return (
    <div
      title={s.summary || s.title}
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        borderLeft: t ? `6px solid ${color}` : undefined,
        backgroundColor: t && !t.unique ? `color-mix(in srgb, ${color} 9%, var(--panel))` : undefined,
      }}
      className={`cursor-pointer rounded-lg bg-panel px-3 py-2 shadow-sm transition hover:shadow-md ${data.dim ? "opacity-25" : ""} ${
        t?.unique ? "border-2 border-foreground" : unsorted ? "border border-dashed border-border" : "border border-border"
      } ${data.active ? "ring-4 ring-foreground/25" : ""}`}
    >
      <Handle type="target" position={Position.Top} style={hidden} />
      <div className={`flex gap-1.5 text-sm leading-snug ${unsorted ? "italic text-muted" : "font-medium"}`}>
        <span className="not-italic text-muted">{KIND_ICON[s.kind]}</span>
        <span className="line-clamp-2 flex-1">{s.title}</span>
        <span className="not-italic text-xs text-muted">{data.open ? "▾" : "▸"}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted">
        {range} · {count} prompt{count === 1 ? "" : "s"}
        {unsorted && " · unorganized"}
      </div>
      {t && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
          {t.unique ? (
            <span className="rounded bg-foreground px-1 font-semibold text-background">★ Unique idea</span>
          ) : (
            <>
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate">{t.name}</span>
            </>
          )}
        </div>
      )}
      {data.open && (
        <div className="mt-2 border-t border-dashed border-border pt-1">
          {data.prompts.map((p) => (
            <div
              key={p.index}
              style={{ height: data.showPhrases ? PROMPT_ROW_WITH_PHRASE_H : PROMPT_ROW_H }}
              className="flex items-center"
              title={p.find ? `Ctrl+F in Claude: “${p.find.phrase}”${p.find.messagesDown ? `, then ${p.find.messagesDown} down` : ""}` : undefined}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation(); // don't collapse the node
                  data.onPick(`turn-${p.index}`);
                }}
                className={`flex h-full min-w-0 flex-1 flex-col justify-center rounded px-1 text-left text-xs not-italic ${
                  p.index === data.activeTurn ? "bg-accent-soft text-accent" : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  <span className="shrink-0 font-mono text-[10px]">#{p.index + 1}</span>
                </span>
                {data.showPhrases && p.find && (
                  <span className="w-full truncate font-mono text-[10px] text-muted">
                    “{p.find.phrase}”{p.find.messagesDown > 0 && ` +${p.find.messagesDown}↓`}
                  </span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onCopyFind(p.index);
                }}
                title="Copy a Ctrl+F search phrase for this prompt"
                aria-label={`Copy search phrase for message ${p.index + 1}`}
                className="h-full shrink-0 rounded px-1 text-[11px] hover:bg-background"
              >
                🔍
              </button>
            </div>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onPick(`seg-${s.id}`);
            }}
            className="mt-1 w-full rounded px-1 py-0.5 text-left text-xs font-medium text-accent hover:bg-accent-soft"
          >
            Read topic →
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={hidden} />
    </div>
  );
}

const nodeTypes = { topic: TopicCard };

/** True on windows wide enough to show the legend and Find panel open without covering the tree. */
function useWide(): boolean {
  const query = "(min-width: 1000px)";
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

export default function TreeDiagram({
  segments,
  active,
  activeTurn,
  expanded,
  onToggle,
  labelOf,
  onPick,
  onCopyFind,
  themes,
  spotlight,
  onSpotlight,
  findOf,
  openUrl,
}: {
  segments: Segment[];
  active: number;
  activeTurn: number;
  /** Shared with the sidebar outline: opening a topic in one opens it in the other. */
  expanded: Set<number>;
  onToggle: (segmentId: number) => void;
  labelOf: (turnIndex: number) => string;
  /** Jump to an element in the transcript, e.g. "seg-3" or "turn-12". */
  onPick: (target: string) => void;
  onCopyFind: (turnIndex: number) => void;
  themes: ThemeModel | null;
  spotlight: Spotlight;
  onSpotlight: (s: Spotlight) => void;
  /** Ctrl+F search phrase for a prompt (see lib/findPhrase.ts). */
  findOf: (turnIndex: number) => FindPhrase | null;
  /** claude:// link that opens this chat in the Claude app. */
  openUrl: string;
}) {
  const [showPhrases, setShowPhrases] = useState(false);
  const wide = useWide();
  /** The topic whose prompts the "Find in Claude" panel lists: the last one clicked, else the one being read. */
  const [selected, setSelected] = useState<number | null>(null);
  const { nodes, edges } = useMemo(
    () => layout({ segments, active, activeTurn, expanded, labelOf, onPick, onCopyFind, themes, spotlight, findOf, showPhrases }),
    [segments, active, activeTurn, expanded, labelOf, onPick, onCopyFind, themes, spotlight, findOf, showPhrases],
  );
  const panelSegment = segments.find((s) => s.id === (selected ?? active));
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => {
        if (!node.data.segment) return;
        onToggle(node.data.segment.id);
        setSelected(node.data.segment.id);
      }}
      nodesDraggable={false}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.1}
      maxZoom={2}
      colorMode="system"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} position="top-left" />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => themeColor((n.data as TopicData).theme)}
        nodeBorderRadius={6}
        maskColor="color-mix(in srgb, var(--background) 70%, transparent)"
        className="hidden sm:block"
        style={{ backgroundColor: "var(--panel)" }}
      />
      <Panel position="top-right" className="max-h-[70%] w-56 max-w-[calc(100%-4rem)] overflow-y-auto rounded-md border border-border bg-panel/95 px-3 py-2 text-xs">
        {/* Open by default on wide windows; folded to one line on small ones so the tree stays visible. */}
        <details key={`legend-${wide}`} open={wide}>
          <summary className="cursor-pointer font-medium select-none">Legend &amp; options</summary>
          <div className="mt-1.5">
            <ThemeLegend themes={themes} spotlight={spotlight} onSpotlight={onSpotlight} />
            <label className="mt-2 flex cursor-pointer items-start gap-1.5 border-t border-border pt-1.5">
              <input
                type="checkbox"
                checked={showPhrases}
                onChange={(e) => setShowPhrases(e.target.checked)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                <span className="font-medium">🔍 Show Ctrl+F phrases</span>
                <span className="block text-muted">under each prompt in opened topics</span>
              </span>
            </label>
            <details className="mt-2 border-t border-border pt-1.5">
              <summary className="cursor-pointer font-medium select-none">Branch lines</summary>
              <div className="mt-1 space-y-0.5 text-muted">
                <div>→ ── continue</div>
                <div>↳ – – tangent</div>
                <div>↩ · · · return</div>
                <div>○ - - - unorganized</div>
              </div>
            </details>
            <div className="mt-1.5 text-muted">Scroll to zoom · drag to pan · click a topic to see its prompts</div>
          </div>
        </details>
      </Panel>
      <Panel position="bottom-left" className="max-h-[45%] w-72 max-w-[calc(100%-2rem)] overflow-y-auto rounded-md border border-border bg-panel/95 px-3 py-2 text-xs">
        <details key={`find-${wide}`} open={wide}>
          <summary className="cursor-pointer truncate select-none">
            <span className="font-medium">🔍 Find in Claude</span>
            {panelSegment && <span className="text-muted"> · {panelSegment.title}</span>}
          </summary>
          <FindPanel segment={panelSegment} labelOf={labelOf} findOf={findOf} onCopyFind={onCopyFind} openUrl={openUrl} />
        </details>
      </Panel>
    </ReactFlow>
  );
}

/** Theme key. Click a theme (or "Unique ideas") to spotlight it; everything else fades. */
function ThemeLegend({
  themes,
  spotlight,
  onSpotlight,
}: {
  themes: ThemeModel | null;
  spotlight: Spotlight;
  onSpotlight: (s: Spotlight) => void;
}) {
  if (!themes) return <p className="text-muted">Rebuild the tree to color topics by theme.</p>;
  const unique = themes.themes.filter((t) => t.unique);
  const recurring = themes.themes.filter((t) => !t.unique);
  const row = (on: boolean) =>
    `flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left ${on ? "bg-foreground/10 font-medium" : "hover:bg-background"}`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-medium">
        <span>Themes</span>
        {spotlight !== null && (
          <button onClick={() => onSpotlight(null)} className="font-normal text-accent hover:underline">
            Show all
          </button>
        )}
      </div>
      <button
        onClick={() => onSpotlight(spotlight === "unique" ? null : "unique")}
        disabled={unique.length === 0}
        className={`${row(spotlight === "unique")} disabled:opacity-50`}
      >
        <span className="rounded bg-foreground px-1 text-[10px] font-semibold text-background">★</span>
        <span className="flex-1">Unique ideas</span>
        <span className="font-mono text-muted">{unique.length}</span>
      </button>
      {recurring.map((t) => (
        <button key={t.id} onClick={() => onSpotlight(spotlight === t.id ? null : t.id)} className={row(spotlight === t.id)}>
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: themeColor(t) }} />
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          <span className="font-mono text-muted">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Ctrl+F phrases for one topic's prompts, for finding them in the Claude app (which can't link to a message).
 * Follows the last topic clicked in the diagram.
 */
function FindPanel({
  segment,
  labelOf,
  findOf,
  onCopyFind,
  openUrl,
}: {
  segment: Segment | undefined;
  labelOf: (turnIndex: number) => string;
  findOf: (turnIndex: number) => FindPhrase | null;
  onCopyFind: (turnIndex: number) => void;
  openUrl: string;
}) {
  if (!segment) return <p className="text-muted">Click a topic to see Ctrl+F phrases for finding its prompts in Claude.</p>;
  const turns = Array.from({ length: segment.endTurn - segment.startTurn + 1 }, (_, k) => segment.startTurn + k);
  return (
    <div>
      <ul className="mt-1.5 space-y-1">
        {turns.map((i) => {
          const find = findOf(i);
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[10px] text-muted">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{labelOf(i)}</div>
                <div className="truncate font-mono text-[10px] text-muted">
                  {find ? (
                    <>
                      “{find.phrase}”{find.messagesDown > 0 && ` +${find.messagesDown}↓`}
                    </>
                  ) : (
                    "no unique phrase"
                  )}
                </div>
              </div>
              {find && (
                <button
                  onClick={() => onCopyFind(i)}
                  className="shrink-0 rounded border border-border px-1.5 py-0.5 hover:border-accent hover:text-foreground"
                >
                  Copy
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <a
        href={openUrl}
        onClick={() => onCopyFind(segment.startTurn)}
        className="mt-2 block rounded bg-accent px-2 py-1 text-center font-medium text-white hover:opacity-90"
      >
        Open in Claude ↗ <span className="font-normal opacity-80">(copies #{segment.startTurn + 1})</span>
      </a>
      <p className="mt-1 text-muted">In Claude: press Ctrl+F and paste. “+1↓” means scroll down one message.</p>
    </div>
  );
}
