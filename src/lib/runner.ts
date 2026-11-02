import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Token counts reported for one call. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Anything that can send one prompt to Claude and return the text reply.
 * Today: the Claude Code CLI (uses your Claude subscription, no API key).
 * Later: an API-key runner can implement the same interface.
 */
export interface ClaudeRunner {
  name: string;
  complete(prompt: string, opts?: { model?: string }): Promise<{ text: string; usage?: TokenUsage }>;
}

/**
 * `claude -p` saves its own session transcript under the cwd's project folder.
 * Running it from a dedicated folder keeps those helper sessions out of the listing.
 */
export const RUNNER_DIR_NAME = "claude-tree-runner";

/**
 * Sorting a transcript needs none of Claude Code's agent machinery. By default every `claude -p` call also
 * sends Claude Code's system prompt, all tool definitions and connected MCP servers' tools — measured at
 * ~38k tokens of overhead per call. These flags (all compatible with subscription login) cut it to ~1.3k.
 * (`--bare` would cut more, but it requires an API key.)
 */
const LEAN_ARGS = [
  "--system-prompt",
  "You organize chat transcripts into topic trees. Follow the user's instructions exactly and reply with JSON only.",
  "--tools",
  "", // no tool definitions — and no ability to run anything
  "--strict-mcp-config", // skip the user's MCP servers
  "--no-session-persistence", // don't save these helper calls as sessions
];

/** With shell: true, Windows joins args into one cmd line unquoted — quote spaces and empty strings ourselves. */
function cmdQuote(arg: string): string {
  return arg === "" || /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

export const cliRunner: ClaudeRunner = {
  name: "claude-cli",
  complete(prompt, opts = {}) {
    const bin = process.env.CLAUDE_BIN ?? "claude";
    const args = ["-p", "--output-format", "json", ...LEAN_ARGS];
    const model = opts.model ?? process.env.CLAUDE_TREE_MODEL;
    if (model) args.push("--model", model);

    const cwd = path.join(os.tmpdir(), RUNNER_DIR_NAME);
    fs.mkdirSync(cwd, { recursive: true });
    // claude is usually an npm .cmd shim on Windows, which only runs through a shell.
    const isWin = process.platform === "win32";

    return new Promise((resolve, reject) => {
      // The prompt goes over stdin: Windows caps command lines at ~32k chars.
      const child = spawn(bin, isWin ? args.map(cmdQuote) : args, { cwd, shell: isWin });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (err) =>
        reject(
          new Error(
            `Could not start "${bin}". Is Claude Code installed and on your PATH? (${err.message})`,
          ),
        ),
      );
      child.on("close", (code) => {
        if (code !== 0) {
          const notFound = /not recognized|not found/i.test(stderr);
          return reject(
            new Error(
              notFound
                ? `"${bin}" was not found. Install Claude Code and run \`claude\` once to log in.`
                : `claude exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
            ),
          );
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.is_error) return reject(new Error(`claude returned an error: ${parsed.result}`));
          const u = parsed.usage ?? {};
          resolve({
            text: String(parsed.result ?? ""),
            usage: {
              input: u.input_tokens ?? 0,
              output: u.output_tokens ?? 0,
              cacheRead: u.cache_read_input_tokens ?? 0,
              cacheWrite: u.cache_creation_input_tokens ?? 0,
            },
          });
        } catch {
          resolve({ text: stdout }); // Fall back to raw text output.
        }
      });
      child.stdin.end(prompt);
    });
  },
};
