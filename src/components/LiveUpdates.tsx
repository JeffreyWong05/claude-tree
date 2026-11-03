"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Never refresh more often than this while Claude is busy writing. */
const MIN_GAP_MS = 3000;

/**
 * Keeps the page in sync with Claude Code: when the chat file changes, quietly re-fetch the page's data.
 * Client state (opened topics, diagram zoom, scroll) is kept. Tabs in the background catch up when shown.
 * Returns whether the live connection is up.
 */
export function useLiveUpdates(conversationId?: string): boolean {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/watch${conversationId ? `?id=${conversationId}` : ""}`);
    let lastRefresh = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let missedWhileHidden = false;

    const refresh = () => {
      lastRefresh = Date.now();
      router.refresh();
    };
    source.onmessage = () => {
      if (document.visibilityState !== "visible") {
        missedWhileHidden = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(0, MIN_GAP_MS - (Date.now() - lastRefresh)));
    };
    let dropped = false;
    source.onopen = () => {
      setLive(true);
      // Back after a dropped connection (computer slept, server restarted): catch up on anything missed.
      if (dropped) {
        dropped = false;
        refresh();
      }
    };
    source.onerror = () => {
      dropped = true;
      setLive(false); // EventSource reconnects by itself
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && missedWhileHidden) {
        missedWhileHidden = false;
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      source.close();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, router]);

  return live;
}

/** Small status dot: green while new prompts appear automatically. */
export function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-muted"
      title={live ? "New prompts from Claude Code appear here automatically" : "Not connected — refresh the page to see new prompts"}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-green-600" : "bg-border"}`} />
      {live ? "Live" : "Offline"}
    </span>
  );
}

/** For server-rendered pages (the session list): live updates plus the badge. */
export function LiveRefresh() {
  return <LiveBadge live={useLiveUpdates()} />;
}
