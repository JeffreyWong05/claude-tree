import fs from "node:fs";
import path from "node:path";

/** When this server process started — lets the page tell an old server from a freshly restarted one. */
export const SERVER_STARTED_AT = Date.now();

const ROOT = process.cwd();

function mtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function newestIn(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) newest = Math.max(newest, mtime(path.join(entry.parentPath, entry.name)));
  }
  return newest;
}

/**
 * True when the code on disk is newer than the build this server is running (e.g. after downloading an
 * update) — same rule the launcher uses to decide whether to rebuild.
 */
export function updateAvailable(): boolean {
  const dist = process.env.CLAUDE_TREE_DIST || ".next";
  const built = mtime(path.join(ROOT, dist, "BUILD_ID"));
  if (!built) return false; // dev server: nothing to compare
  const sources = Math.max(
    newestIn(path.join(ROOT, "src")),
    newestIn(path.join(ROOT, "public")),
    ...["package.json", "next.config.ts", "tsconfig.json"].map((f) => mtime(path.join(ROOT, f))),
  );
  return sources > built;
}
