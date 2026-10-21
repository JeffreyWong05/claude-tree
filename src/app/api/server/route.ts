import fs from "node:fs";
import path from "node:path";
import { autostartEnabled, autostartSupported, setAutostart } from "@/lib/autostart";

/** True when started by the launcher (background server), so it's safe to stop from the app. */
const managed = () => process.env.CLAUDE_TREE_MANAGED === "1";

export async function GET() {
  return Response.json({
    managed: managed(),
    autostart: { supported: autostartSupported(), enabled: autostartEnabled() },
  });
}

/**
 * { action: "stop" } or { action: "autostart", enabled: boolean }.
 * Requires a custom header so other websites can't trigger it: a cross-site request with a custom
 * header needs a CORS preflight, which this server never approves.
 */
export async function POST(req: Request) {
  if (req.headers.get("x-claude-tree") !== "1" || (req.headers.get("sec-fetch-site") ?? "same-origin") !== "same-origin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; enabled?: boolean };

  if (body.action === "stop") {
    if (!managed()) {
      return Response.json({ error: "This server was started from a terminal — stop it there (Ctrl+C)." }, { status: 409 });
    }
    fs.rmSync(path.join(process.cwd(), "data", "server.pid"), { force: true });
    // Reply first, then exit.
    setTimeout(() => process.exit(0), 300);
    return Response.json({ stopped: true });
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
