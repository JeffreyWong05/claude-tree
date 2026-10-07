import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The Claude desktop app keeps one small JSON file per Code session, pairing its own id
 * ("local_…", needed for claude:// links) with the CLI transcript id we read.
 * Undocumented app internals — keep all knowledge of this format in this file.
 */
export interface DesktopSession {
  sessionId: string;
  archived: boolean;
}

function desktopDataDir(): string {
  if (process.env.CLAUDE_DESKTOP_DIR) return process.env.CLAUDE_DESKTOP_DIR;
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? "", "Claude");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Claude");
  return path.join(os.homedir(), ".config", "Claude");
}

/** Map of CLI transcript id -> desktop session. Empty if the desktop app isn't installed. */
export function loadDesktopSessions(): Map<string, DesktopSession> {
  const map = new Map<string, DesktopSession>();
  const root = path.join(desktopDataDir(), "claude-code-sessions");
  if (!fs.existsSync(root)) return map;

  for (const file of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (!/local_[\w-]+\.json$/.test(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
      if (typeof data.cliSessionId === "string" && typeof data.sessionId === "string") {
        map.set(data.cliSessionId, { sessionId: data.sessionId, archived: data.isArchived === true });
      }
    } catch {
      // Partially written or unexpected file — skip it.
    }
  }
  return map;
}
