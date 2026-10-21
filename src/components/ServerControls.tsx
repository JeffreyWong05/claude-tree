"use client";

import { useEffect, useState } from "react";

interface ServerState {
  managed: boolean;
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

/** Turn the background server off, and toggle starting it at login. */
export function ServerControls() {
  const [state, setState] = useState<ServerState | null>(null);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/server")
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, []);

  if (stopped) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Claude Tree is off.</p>
          <p className="mt-2 text-sm text-muted">
            To turn it back on, double-click <b>Start Claude Tree</b> (or its shortcut). You can close this tab.
          </p>
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
      setStopped(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-10 border-t border-border pt-4 text-xs text-muted">
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
          <button onClick={stop} className="rounded-md border border-border px-3 py-1 hover:border-accent hover:text-foreground">
            Turn off Claude Tree
          </button>
        ) : (
          <span>Running from a terminal (developer mode) — stop it there with Ctrl+C.</span>
        )}
      </div>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
