import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { PROJECTS_DIR } from "@/lib/sources/claudeCode";
import { desktopDataDir } from "@/lib/sources/desktopSessions";

/** What the app needs, checked on the home page so first-time users see exactly what's missing. */
export interface SetupStatus {
  /** Claude Code CLI — needed to build trees (`claude -p`). Viewing works without it. */
  claude: { found: boolean; version?: string };
  /** Where Claude Code saves chats — needed to list anything at all. */
  transcripts: { dir: string; found: boolean };
  /** Claude desktop app — needed only for "Open in Claude" / "Continue from this leaf". */
  desktopApp: boolean;
}

let cached: { at: number; claude: SetupStatus["claude"] } | null = null;

function checkClaude(): SetupStatus["claude"] {
  // Spawning the CLI takes ~1s; cache it for a minute.
  if (cached && Date.now() - cached.at < 60_000) return cached.claude;
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const result = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    shell: process.platform === "win32",
  });
  const out = `${result.stdout ?? ""}`.trim();
  const claude = result.status === 0 && out ? { found: true, version: out.split(/\s+/)[0] } : { found: false };
  cached = { at: Date.now(), claude };
  return claude;
}

export function getSetupStatus(): SetupStatus {
  return {
    claude: checkClaude(),
    transcripts: { dir: PROJECTS_DIR, found: fs.existsSync(PROJECTS_DIR) },
    desktopApp: fs.existsSync(desktopDataDir()),
  };
}
