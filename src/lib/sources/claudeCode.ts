import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractAttachment, fileRef, imageRef, type FileAttachmentEntry } from "@/lib/attachments";
import type { AttachmentRef, Conversation, ConversationMeta, Turn } from "@/lib/types";
import { RUNNER_DIR_NAME } from "@/lib/runner";
import { loadDesktopSessions } from "@/lib/sources/desktopSessions";
import { findPhrases } from "@/lib/findPhrase";

/** Claude Code stores one JSONL transcript per session under ~/.claude/projects/<project>/<id>.jsonl */
export const PROJECTS_DIR =
  process.env.CLAUDE_PROJECTS_DIR ?? path.join(os.homedir(), ".claude", "projects");

const ID_RE = /^[0-9a-f-]{36}$/i;

/** "C--Users-jeffj-OneDrive-Desktop-claude-tree" -> "claude-tree" (best effort; the encoding is lossy). */
function projectLabel(dirName: string): string {
  const parts = dirName.split("-").filter(Boolean);
  const desktop = parts.lastIndexOf("Desktop");
  return (desktop >= 0 ? parts.slice(desktop + 1) : parts.slice(-2)).join("-") || dirName;
}

function projectDirs(): string[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.endsWith(RUNNER_DIR_NAME))
    .map((d) => d.name);
}

export function findTranscript(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  for (const dir of projectDirs()) {
    const file = path.join(PROJECTS_DIR, dir, `${id}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Cheap title lookup: last custom title, else the first real prompt. */
function readTitle(file: string): string {
  const raw = fs.readFileSync(file, "utf8");
  const custom = [...raw.matchAll(/"customTitle":"((?:[^"\\]|\\.)*)"/g)].pop();
  if (custom) return JSON.parse(`"${custom[1]}"`).replace(/\s+/g, " ");
  const first = parseTurns(raw, 1)[0];
  if (!first) return "(empty session)";
  return first.user ? first.user.replace(/\s+/g, " ").slice(0, 80) : "(image prompt)";
}

export function listConversations(): ConversationMeta[] {
  const out: ConversationMeta[] = [];
  for (const dir of projectDirs()) {
    const full = path.join(PROJECTS_DIR, dir);
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(full, name);
      const stat = fs.statSync(file);
      out.push({
        id: name.replace(/\.jsonl$/, ""),
        source: "claude-code",
        title: readTitle(file),
        project: projectLabel(dir),
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      });
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadConversation(id: string): Conversation | null {
  const file = findTranscript(id);
  if (!file) return null;
  const raw = fs.readFileSync(file, "utf8");
  const turns = parseTurns(raw);
  findPhrases(turns).forEach((f, i) => (turns[i].find = f));
  const cwd = raw.match(/"cwd":"((?:[^"\\]|\\.)*)"/)?.[1];
  return {
    id,
    source: "claude-code",
    title: readTitle(file),
    project: projectLabel(path.basename(path.dirname(file))),
    updatedAt: fs.statSync(file).mtime.toISOString(),
    cwd: cwd ? JSON.parse(`"${cwd}"`) : undefined,
    transcriptPath: file,
    desktop: loadDesktopSessions().get(id),
    turns,
  };
}

// ---------------------------------------------------------------------------

type Block = {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  source?: Parameters<typeof imageRef>[1];
  content?: string | Block[];
};
interface Entry {
  type: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  timestamp?: string;
  message?: { content: string | Block[] };
  attachment?: FileAttachmentEntry;
}

/** Turns raw user content into the prompt text a human typed, or null if it isn't a real prompt. */
function promptText(content: string | Block[]): string | null {
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else {
    // Tool results come back as "user" messages but are part of Claude's work, not a new prompt.
    if (content.some((b) => b.type === "tool_result")) return null;
    // Images are kept as attachments, not as text.
    text = content.map((b) => (b.type === "text" ? b.text ?? "" : "")).join("\n");
  }
  if (text.startsWith("<local-command")) return null;
  const command = text.match(/<command-name>(.*?)<\/command-name>/s);
  if (command) {
    const args = text.match(/<command-args>(.*?)<\/command-args>/s)?.[1] ?? "";
    return `${command[1]} ${args}`.trim();
  }
  text = text.replace(/<system-reminder>.*?<\/system-reminder>/gs, "").trim();
  return text || null;
}

export function parseTurns(raw: string, limit = Infinity): Turn[] {
  const turns: Turn[] = [];
  const toolNames = new Map<string, string>(); // tool_use id -> tool name, to label screenshots
  const lines = raw.split("\n"); // Line numbers are part of attachment refs — index the unfiltered split.
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    if (!line.trim()) continue;
    let entry: Entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const current = turns[turns.length - 1];

    // Files attached with @ are stored as their own entry right after the prompt.
    if (entry.type === "attachment") {
      const ref = entry.attachment && fileRef(ln, entry.attachment);
      if (ref && current) current.attachments.push(ref);
      continue;
    }
    if (entry.isSidechain || entry.isMeta || !entry.message) continue;
    const content = entry.message.content;

    if (entry.type === "user") {
      // Tool results: part of Claude's work, but they may carry screenshots worth keeping.
      if (Array.isArray(content) && content.some((b) => b.type === "tool_result")) {
        if (current) current.attachments.push(...toolResultImages(content, ln, toolNames));
        continue;
      }
      const text = promptText(content);
      const images = Array.isArray(content)
        ? content.flatMap((b, i) =>
            b.type === "image" && b.source ? [imageRef(`u${ln}-${i}`, b.source, "image", "Pasted image")] : [],
          )
        : [];
      const attachments = images.filter((a): a is AttachmentRef => a !== null);
      if (text === null && attachments.length === 0) continue;
      if (turns.length >= limit) break;
      turns.push({
        index: turns.length,
        timestamp: entry.timestamp ?? "",
        user: text ?? "",
        assistant: "",
        tools: [],
        attachments,
      });
    } else if (entry.type === "assistant" && turns.length) {
      const turn = turns[turns.length - 1];
      const content = entry.message.content;
      if (typeof content === "string") {
        turn.assistant += (turn.assistant ? "\n\n" : "") + content;
        continue;
      }
      for (const block of content) {
        if (block.type === "text" && block.text?.trim()) {
          turn.assistant += (turn.assistant ? "\n\n" : "") + block.text.trim();
        } else if (block.type === "tool_use" && block.name) {
          turn.tools.push(block.name);
          if (block.id) toolNames.set(block.id, block.name);
        }
      }
    }
  }
  return turns;
}

/** "mcp__Claude_Browser__computer" -> "computer" */
function shortToolName(name: string | undefined): string {
  return name ? name.split("__").pop()! : "tool";
}

function toolResultImages(content: Block[], ln: number, toolNames: Map<string, string>): AttachmentRef[] {
  const refs: AttachmentRef[] = [];
  content.forEach((block, b) => {
    if (block.type !== "tool_result" || !Array.isArray(block.content)) return;
    const tool = shortToolName(block.tool_use_id ? toolNames.get(block.tool_use_id) : undefined);
    block.content.forEach((item, i) => {
      if (item.type !== "image" || !item.source) return;
      const name = tool === "Read" ? "Image Claude opened" : `Screenshot (${tool})`;
      const ref = imageRef(`t${ln}-${b}-${i}`, item.source, "screenshot", name);
      if (ref) refs.push(ref);
    });
  });
  return refs;
}

/** Bytes of one attachment, re-read from the transcript on demand. */
export function loadAttachment(id: string, ref: string) {
  const file = findTranscript(id);
  return file ? extractAttachment(fs.readFileSync(file, "utf8"), ref) : null;
}
