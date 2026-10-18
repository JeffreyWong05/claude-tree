import type { Segment } from "@/lib/types";

/**
 * Theme colors. Recurring themes (2+ topics) get categorical palette slots in a fixed order —
 * the order of first appearance in the conversation, so a theme keeps its color as the tree grows.
 * Unique ideas (a theme with one topic) are NOT given a palette color: they get their own treatment
 * (★ + strong outline) so they stand out instead of becoming "just another color".
 * Palette: the validated default categorical order (see docs/DECISIONS.md); never generate extra hues.
 */
export const PALETTE_SLOTS = 8;

export interface ThemeInfo {
  id: number;
  name: string;
  count: number;
  unique: boolean;
  /** 1-8, or null when there are more recurring themes than slots (shown as grey "Other"). */
  slot: number | null;
}

export interface ThemeModel {
  themes: ThemeInfo[];
  ofSegment: Map<number, ThemeInfo>;
}

/** What to spotlight: nothing, all unique ideas, or one theme by id. */
export type Spotlight = null | "unique" | number;

export function buildThemes(segments: Segment[], names: string[] | undefined): ThemeModel | null {
  if (!names?.length) return null;
  const counts = new Map<number, number>();
  const firstSeen: number[] = [];
  for (const s of segments) {
    if (s.theme === undefined || s.kind === "unsorted") continue;
    if (!counts.has(s.theme)) firstSeen.push(s.theme);
    counts.set(s.theme, (counts.get(s.theme) ?? 0) + 1);
  }
  let nextSlot = 1;
  const themes: ThemeInfo[] = firstSeen.map((id) => {
    const count = counts.get(id)!;
    const unique = count === 1;
    const slot = unique || nextSlot > PALETTE_SLOTS ? null : nextSlot++;
    return { id, name: names[id] ?? `Theme ${id + 1}`, count, unique, slot };
  });
  const byId = new Map(themes.map((t) => [t.id, t]));
  const ofSegment = new Map<number, ThemeInfo>();
  for (const s of segments) {
    const t = s.theme === undefined || s.kind === "unsorted" ? undefined : byId.get(s.theme);
    if (t) ofSegment.set(s.id, t);
  }
  return { themes, ofSegment };
}

/** CSS color for a theme's marks (bar, dot, minimap). Unique ideas use the ink color. */
export function themeColor(t: ThemeInfo | undefined): string {
  if (!t) return "var(--muted)";
  if (t.unique) return "var(--foreground)";
  return t.slot ? `var(--theme-${t.slot})` : "var(--theme-other)";
}

/** True when a spotlight is on and this topic isn't part of it. */
export function isDimmed(spotlight: Spotlight, t: ThemeInfo | undefined): boolean {
  if (spotlight === null) return false;
  if (spotlight === "unique") return !t?.unique;
  return t?.id !== spotlight;
}
