#!/usr/bin/env node
/**
 * One-step launcher used by "Start Claude Tree" (Windows .bat / Mac .command):
 *   1. installs dependencies on first run (or after an update changed them)
 *   2. builds the app when the code is newer than the last build
 *   3. checks that Claude Code is installed
 *   4. starts the app and opens it in the browser
 * If Claude Tree is already running, it just opens the browser.
 * Plain JavaScript (no TypeScript) so it runs before anything is installed.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const PORT = Number(process.env.PORT ?? 3456);
const URL = `http://localhost:${PORT}`;
const isWin = process.platform === "win32";

const say = (msg = "") => console.log(msg);
function fail(msg) {
  say(`\n✖ ${msg}`);
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: isWin });
  if (result.status !== 0) fail(`"${cmd} ${args.join(" ")}" failed. Scroll up for details.`);
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Newest modification time of any file under `dir`. */
function newestIn(dir) {
  let newest = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) newest = Math.max(newest, mtime(path.join(entry.parentPath ?? entry.path, entry.name)));
  }
  return newest;
}

async function isRunning() {
  try {
    const res = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok && (await res.json()).app === "claude-tree";
  } catch {
    return false;
  }
}

function openBrowser() {
  if (process.env.CLAUDE_TREE_NO_BROWSER) return; // for testing the launcher
  const [cmd, args] = isWin ? ["cmd", ["/c", "start", "", URL]] : process.platform === "darwin" ? ["open", [URL]] : ["xdg-open", [URL]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

async function main() {
  say("──────────────────────────────");
  say("  Claude Tree");
  say("──────────────────────────────");

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) fail(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org and try again.`);

  if (await isRunning()) {
    say(`Claude Tree is already running — opening ${URL}`);
    openBrowser();
    return;
  }

  // 1. Dependencies: first run, or package-lock.json changed since the last install.
  if (!fs.existsSync("node_modules") || mtime("package-lock.json") > mtime("node_modules/.package-lock.json")) {
    say("\n▸ Installing (first run only — this can take a few minutes)…");
    run("npm", ["install", "--no-audit", "--no-fund"]);
  }

  // 2. Build: missing, or any app code is newer than the last build (e.g. after downloading an update).
  const sources = Math.max(newestIn("src"), newestIn("public"), mtime("package.json"), mtime("next.config.ts"), mtime("tsconfig.json"));
  if (mtime(".next/BUILD_ID") < sources) {
    say("\n▸ Preparing the app (about a minute)…");
    run("npm", ["run", "build"]);
  }

  // 3. Claude Code: viewing works without it, but building trees needs it.
  const claude = spawnSync("claude", ["--version"], { encoding: "utf8", shell: isWin, timeout: 15000 });
  if (claude.status === 0) {
    say(`\n✓ Claude Code found (${claude.stdout.trim()})`);
  } else {
    say("\n⚠ Claude Code isn't installed (or isn't on your PATH).");
    say("  You can still browse chats, but building trees needs it. To install:");
    say("    npm install -g @anthropic-ai/claude-code");
    say("  then run `claude` once to sign in, and restart Claude Tree.");
  }

  // 4. Start, then open the browser once the app answers.
  say(`\n▸ Starting at ${URL} …`);
  const server = spawn("npm", ["run", "start", "--", "--port", String(PORT)], { stdio: ["ignore", "pipe", "inherit"], shell: isWin });
  server.stdout.on("data", () => {}); // keep the pipe drained; Next's startup banner isn't useful to non-developers
  server.on("exit", (code) => {
    if (code) fail(`The app stopped unexpectedly (exit code ${code}). Is port ${PORT} used by another program? Set PORT to change it.`);
    process.exit(0);
  });

  for (let i = 0; i < 60 && !(await isRunning()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await isRunning())) fail("The app didn't start within a minute. Scroll up for errors.");

  openBrowser();
  say("\n✓ Claude Tree is running.");
  say(`  Open ${URL} any time while this window is open.`);
  say("  Keep this window open while you use it — close it to stop Claude Tree.");
}

main();
