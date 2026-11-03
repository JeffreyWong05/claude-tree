#!/usr/bin/env node
/**
 * Launcher behind "Start Claude Tree" / "Stop Claude Tree" (Windows .bat, Mac .command).
 *
 *   node scripts/launch.mjs              install/build if needed, start the server in the background, open the browser
 *   node scripts/launch.mjs --no-browser same, without opening the browser (used when starting at login)
 *   node scripts/launch.mjs --stop       stop the background server
 *   node scripts/launch.mjs --restart    stop, apply any update (rebuild), start again — used by the in-app Restart button
 *   node scripts/launch.mjs --foreground run the server in this window instead (for debugging)
 *
 * The everyday app is built into its own folder (.next-app), so developer builds (.next) can't break it.
 *
 * The server only listens on this computer (127.0.0.1), so your chats aren't reachable from your network.
 * Plain JavaScript (no TypeScript) so it runs before anything is installed.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const args = new Set(process.argv.slice(2));
const PORT = Number(process.env.PORT ?? 3456);
const HOST = "127.0.0.1";
const BROWSER_URL = `http://localhost:${PORT}`;
const HEALTH_URL = `http://${HOST}:${PORT}/api/health`;
const DATA_DIR = path.join(root, "data");
const PID_FILE = path.join(DATA_DIR, "server.pid");
const LOG_FILE = path.join(DATA_DIR, "server.log");
const isWin = process.platform === "win32";
/** Build folder for the everyday app (see next.config.ts). */
const APP_DIST = ".next-app";
const APP_ENV = { ...process.env, CLAUDE_TREE_DIST: APP_DIST };
/** Keep the log from growing forever on an always-on server. */
const LOG_MAX_BYTES = 1_000_000;

const say = (msg = "") => console.log(msg);
function fail(msg) {
  say(`\n✖ ${msg}`);
  process.exit(1);
}

/** Runs a command. Quiet mode hides its output unless it fails (the build prints developer-only warnings). */
function run(cmd, cmdArgs, { quiet = false, env = process.env } = {}) {
  // windowsHide: when the in-app Restart runs this without a console, npm/cmd mustn't pop up windows.
  const result = spawnSync(cmd, cmdArgs, { stdio: quiet ? "pipe" : "inherit", shell: isWin, encoding: "utf8", env, windowsHide: true });
  if (result.status !== 0) {
    if (quiet) say(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    fail(`"${cmd} ${cmdArgs.join(" ")}" failed. Scroll up for details.`);
  }
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
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok && (await res.json()).app === "claude-tree";
  } catch {
    return false;
  }
}

async function waitFor(condition, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await condition()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser() {
  if (args.has("--no-browser") || process.env.CLAUDE_TREE_NO_BROWSER) return;
  const [cmd, cmdArgs] = isWin
    ? ["cmd", ["/c", "start", "", BROWSER_URL]]
    : process.platform === "darwin"
      ? ["open", [BROWSER_URL]]
      : ["xdg-open", [BROWSER_URL]];
  spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).unref();
}

function readPid() {
  const pid = Number(fs.existsSync(PID_FILE) ? fs.readFileSync(PID_FILE, "utf8").trim() : NaN);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function stop() {
  const pid = readPid();
  if (!pid && !(await isRunning())) {
    say("Claude Tree isn't running.");
    return;
  }
  if (pid) {
    if (isWin) spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    else {
      try {
        process.kill(-pid); // the whole process group started in the background
      } catch {
        try {
          process.kill(pid);
        } catch {}
      }
    }
  }
  fs.rmSync(PID_FILE, { force: true });
  if (await waitFor(async () => !(await isRunning()), 10)) say("✓ Claude Tree stopped.");
  else fail(`Something is still answering on port ${PORT}. It may have been started another way — close that window or restart your computer.`);
}

/** Install and build only when needed, so everyday starts take seconds. */
function prepare() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) fail(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org and try again.`);

  if (!fs.existsSync("node_modules") || mtime("package-lock.json") > mtime("node_modules/.package-lock.json")) {
    say("\n▸ Installing (first run only — this can take a few minutes)…");
    run("npm", ["install", "--no-audit", "--no-fund"]);
  }

  const sources = Math.max(newestIn("src"), newestIn("public"), mtime("package.json"), mtime("next.config.ts"), mtime("tsconfig.json"));
  if (mtime(path.join(APP_DIST, "BUILD_ID")) < sources) {
    say("\n▸ Preparing the app (about a minute)…");
    run("npm", ["run", "build"], { quiet: true, env: APP_ENV });
    say("✓ Ready");
  }

  const claude = spawnSync("claude", ["--version"], { encoding: "utf8", shell: isWin, timeout: 15000, windowsHide: true });
  if (claude.status === 0) say(`✓ Claude Code found (${claude.stdout.trim()})`);
  else {
    say("\n⚠ Claude Code isn't installed (or isn't on your PATH).");
    say("  You can still browse chats, but building trees needs it. To install:");
    say("    npm install -g @anthropic-ai/claude-code");
    say("  then run `claude` once to sign in, and restart Claude Tree.");
  }
}

function nextArgs() {
  // Run Next directly (not through npm) so the saved PID is the server itself and Stop can end it.
  return [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", HOST];
}

async function start() {
  say("──────────────────────────────");
  say("  Claude Tree");
  say("──────────────────────────────");

  if (await isRunning()) {
    say(`Claude Tree is already running — opening ${BROWSER_URL}`);
    openBrowser();
    return;
  }

  prepare();
  // CLAUDE_TREE_MANAGED lets the app show its Stop/Restart buttons and start-at-login switch.
  const env = { ...APP_ENV, CLAUDE_TREE_MANAGED: "1", NODE_ENV: "production" };

  if (args.has("--foreground")) {
    say(`\n▸ Running at ${BROWSER_URL} in this window — press Ctrl+C to stop.`);
    const server = spawn(process.execPath, nextArgs(), { stdio: "inherit", env });
    if (await waitFor(isRunning, 60)) openBrowser();
    server.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  say(`\n▸ Starting in the background…`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  trimLog();
  const log = fs.openSync(LOG_FILE, "a");
  fs.writeSync(log, `\n--- started ${new Date().toISOString()} ---\n`);
  const server = spawn(process.execPath, nextArgs(), {
    detached: true, // keeps running after this window closes
    windowsHide: true, // no console window on Windows
    stdio: ["ignore", log, log],
    env,
  });
  fs.writeFileSync(PID_FILE, String(server.pid));
  server.unref();

  if (!(await waitFor(isRunning, 60))) fail(`The app didn't start within a minute. Details are in ${LOG_FILE}`);
  openBrowser();
  say(`\n✓ Claude Tree is running at ${BROWSER_URL}`);
  say("  It keeps running in the background — you can close this window.");
  say("  To turn it off: the Stop button in the app, or double-click “Stop Claude Tree”.");
}

/** Keep only the most recent part of a large log. */
function trimLog() {
  try {
    if (fs.statSync(LOG_FILE).size <= LOG_MAX_BYTES) return;
    const text = fs.readFileSync(LOG_FILE, "utf8");
    fs.writeFileSync(LOG_FILE, `[older log entries removed]\n${text.slice(-LOG_MAX_BYTES / 4)}`);
  } catch {
    // no log yet
  }
}

if (args.has("--stop")) await stop();
else if (args.has("--restart")) {
  // Stop first: rebuilding under a running server would break the pages it's serving.
  if (args.has("--after-exit")) {
    // Started by the app's Restart button: the server is shutting itself down (killing it from here would
    // also kill this process, its child). Wait for the port to free up.
    await waitFor(async () => !(await isRunning()), 20);
    fs.rmSync(PID_FILE, { force: true });
  } else if (readPid() || (await isRunning())) await stop();
  await start();
} else await start();
