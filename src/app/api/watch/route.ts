import fs from "node:fs";
import { RUNNER_DIR_NAME } from "@/lib/runner";
import { findTranscript, PROJECTS_DIR } from "@/lib/sources/claudeCode";

/** Wait this long after the first change in a burst before telling the page (Claude Code writes in bursts). */
const BATCH_MS = 1500;

/**
 * Server-Sent Events: sends "change" when a chat is written to, so open pages can refresh themselves.
 *   /api/watch?id=<session>  one chat's transcript (conversation page)
 *   /api/watch               any chat (home page list)
 * Uses the OS's file-change notifications, so an idle watch costs nothing. No Claude tokens are involved.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const target = id ? findTranscript(id) : PROJECTS_DIR;
  if (!target || !fs.existsSync(target)) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let watcher: fs.FSWatcher | undefined;
  let batch: ReturnType<typeof setTimeout> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    watcher?.close();
    clearTimeout(batch);
    clearInterval(keepalive);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup(); // the page went away
        }
      };
      send("retry: 5000\n\n");
      watcher = fs.watch(target, { recursive: !id }, (_event, file) => {
        const name = file ? String(file) : "";
        // Home page: only chat transcripts matter, and never Claude Tree's own helper calls.
        if (!id && name && (!name.endsWith(".jsonl") || name.includes(RUNNER_DIR_NAME))) return;
        if (batch) return;
        batch = setTimeout(() => {
          batch = undefined;
          send("data: change\n\n");
        }, BATCH_MS);
      });
      watcher.on("error", cleanup);
      keepalive = setInterval(() => send(": keepalive\n\n"), 25_000);
      req.signal.addEventListener("abort", cleanup);
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
