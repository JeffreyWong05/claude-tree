import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { updateAvailable } from "@/lib/appBuild";
import { autostartEnabled, autostartSupported, setAutostart } from "@/lib/autostart";

/** True when started by the launcher (background server), so it's safe to stop or restart from the app. */
const managed = () => process.env.CLAUDE_TREE_MANAGED === "1";

export async function GET() {
  return Response.json({
    managed: managed(),
    updateAvailable: managed() && updateAvailable(),
    autostart: { supported: autostartSupported(), enabled: autostartEnabled() },
  });
}

/** Reply first, then exit, so the page gets its answer. */
function exitSoon() {
  setTimeout(() => process.exit(0), 300);
}

/**
 * { action: "stop" | "restart" } or { action: "autostart", enabled: boolean }.
 * Requires a custom header so other websites can't trigger it: a cross-site request with a custom
 * header needs a CORS preflight, which this server never approves.
 */
export async function POST(req: Request) {
  if (req.headers.get("x-claude-tree") !== "1" || (req.headers.get("sec-fetch-site") ?? "same-origin") !== "same-origin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; enabled?: boolean };

  if (body.action === "stop" || body.action === "restart") {
    if (!managed()) {
      return Response.json({ error: "This server was started from a terminal — stop it there (Ctrl+C)." }, { status: 409 });
    }
    if (body.action === "restart") {
      // Hand off to the launcher, which waits for this server to exit, applies any update, and starts a new one.
      const launcher = spawn(
        process.execPath,
        [path.join(process.cwd(), "scripts", "launch.mjs"), "--restart", "--after-exit", "--no-browser"],
        { cwd: process.cwd(), detached: true, windowsHide: true, stdio: "ignore" },
      );
      launcher.unref();
    } else {
      fs.rmSync(path.join(process.cwd(), "data", "server.pid"), { force: true });
    }
    exitSoon();
    return Response.json({ ok: true });
  }

  if (body.action === "autostart" && typeof body.enabled === "boolean") {
    try {
      setAutostart(body.enabled);
      return Response.json({ autostart: { supported: autostartSupported(), enabled: autostartEnabled() } });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
