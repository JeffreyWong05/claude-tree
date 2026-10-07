import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Anything that can send one prompt to Claude and return the text reply.
 * Today: the Claude Code CLI (uses your Claude subscription, no API key).
 * Later: an API-key runner can implement the same interface.
 */
export interface ClaudeRunner {
  name: string;
  complete(prompt: string, opts?: { model?: string }): Promise<string>;
}

/**
 * `claude -p` saves its own session transcript under the cwd's project folder.
 * Running it from a dedicated folder keeps those helper sessions out of the listing.
 */
export const RUNNER_DIR_NAME = "claude-tree-runner";

export const cliRunner: ClaudeRunner = {
  name: "claude-cli",
  complete(prompt, opts = {}) {
    const bin = process.env.CLAUDE_BIN ?? "claude";
    const args = ["-p", "--output-format", "json"];
    const model = opts.model ?? process.env.CLAUDE_TREE_MODEL;
    if (model) args.push("--model", model);

    const cwd = path.join(os.tmpdir(), RUNNER_DIR_NAME);
    fs.mkdirSync(cwd, { recursive: true });

    return new Promise((resolve, reject) => {
      // The prompt goes over stdin: Windows caps command lines at ~32k chars.
      const child = spawn(bin, args, { cwd, shell: process.platform === "win32" });
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
          resolve(String(parsed.result ?? ""));
        } catch {
          resolve(stdout); // Fall back to raw text output.
        }
      });
      child.stdin.end(prompt);
    });
  },
};
