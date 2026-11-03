"use client";

import { useEffect, useState } from "react";

interface ServerState {
  managed: boolean;
  updateAvailable: boolean;
  autostart: { supported: boolean; enabled: boolean };
}

async function post(body: object) {
  const res = await fetch("/api/server", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-claude-tree": "1" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

async function serverStartedAt(): Promise<number | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok ? (await res.json()).startedAt : null;
  } catch {
    return null; // down (restarting)
  }
}

/** Turn the background server off or restart it (applying updates), and toggle starting it at login. */
export function ServerControls() {
  const [state, setState] = useState<ServerState | null>(null);
  const [phase, setPhase] = useState<"running" | "stopped" | "restarting" | "slow">("running");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/server")
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, []);

  if (phase !== "running") {
    const message = {
      stopped: ["Claude Tree is off.", "To turn it back on, double-click Start Claude Tree (or its shortcut). You can close this tab."],
      restarting: [
        "Restarting Claude Tree…",
        state?.updateAvailable ? "Applying the update — this takes about a minute. The page reloads by itself." : "This takes a few seconds. The page reloads by itself.",
      ],
      slow: ["This is taking longer than expected.", "If the page doesn't come back, double-click Start Claude Tree. Details are in data/server.log."],
    }[phase];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6 text-center">
        <div>
          <p className="text-lg font-semibold">{message[0]}</p>
          <p className="mt-2 text-sm text-muted">{message[1]}</p>
        </div>
      </div>
    );
  }
  if (!state) return null;

  async function toggleAutostart(enabled: boolean) {
    setError(null);
    try {
      const res = await post({ action: "autostart", enabled });
      setState((s) => (s ? { ...s, autostart: res.autostart } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function stop() {
    setError(null);
    try {
      await post({ action: "stop" });
      setPhase("stopped");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function restart() {
    setError(null);
    try {
      const before = await serverStartedAt();
      await post({ action: "restart" });
      setPhase("restarting");
      // Wait for a server with a different start time (the new one), then reload.
      const deadline = Date.now() + 3 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const now = await serverStartedAt();
        if (now !== null && now !== before) return window.location.reload();
      }
      setPhase("slow");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-10 border-t border-border pt-4 text-xs text-muted">
      {state.updateAvailable && (
        <p className="mb-3 rounded-md border border-accent bg-accent-soft px-3 py-2 text-foreground">
          An update is ready. Click <b>Update &amp; restart</b> to apply it (about a minute).
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {state.autostart.supported && (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={state.autostart.enabled}
              onChange={(e) => toggleAutostart(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Start Claude Tree automatically when I log in
          </label>
        )}
        {state.managed ? (
          <>
            <button onClick={restart} className="rounded-md border border-border px-3 py-1 hover:border-accent hover:text-foreground">
              {state.updateAvailable ? "Update & restart" : "Restart"}
            </button>
            <button onClick={stop} className="rounded-md border border-border px-3 py-1 hover:border-accent hover:text-foreground">
              Turn off Claude Tree
            </button>
          </>
        ) : (
          <span>Running from a terminal (developer mode) — stop it there with Ctrl+C.</span>
        )}
      </div>
      {state.autostart.supported && !state.autostart.enabled && (
        <p className="mt-2">
          Recommended: with this on, Claude Tree comes back by itself after your computer restarts. It stays running
          through sleep either way, and uses about 85 MB of memory.
        </p>
      )}
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
