import path from "node:path";
import type { AttachmentRef } from "@/lib/types";

/**
 * Knowledge of how Claude Code stores images and files inside a transcript line.
 * Refs encode where the data lives so it can be re-read later without keeping it in memory:
 *   u<line>-<block>          image pasted into a user prompt
 *   t<line>-<block>-<item>   image inside a tool result (e.g. a browser screenshot)
 *   f<line>                  file attached with @ (an "attachment" entry)
 */

const TEXT_EXT = new Set([
  ".txt", ".md", ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml", ".sql", ".r",
  ".html", ".css", ".xml", ".log", ".ini", ".cfg", ".sh", ".ps1", ".bat", ".java", ".c", ".cpp", ".h",
  ".go", ".rs", ".rb", ".php", ".tex", ".env.example",
]);

interface Base64Source {
  type?: string;
  media_type?: string;
  data?: string;
}

export interface FileAttachmentEntry {
  type?: string;
  filename?: string;
  content?: { type?: string; file?: { base64?: string; content?: string; type?: string; originalSize?: number } };
}

export interface Payload {
  mediaType: string;
  body: Buffer;
  /** Original file name, for files attached with @. */
  name?: string;
}

function base64Size(data: string): number {
  return Math.floor((data.length * 3) / 4);
}

export function previewFor(name: string, mediaType: string): AttachmentRef["preview"] {
  const ext = path.extname(name).toLowerCase();
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType === "application/pdf" || ext === ".pdf") return "pdf";
  if (ext === ".csv" || ext === ".tsv" || mediaType === "text/csv") return "csv";
  if (mediaType.startsWith("text/") || TEXT_EXT.has(ext)) return "text";
  return "none";
}

function mediaTypeFor(name: string, contentType?: string): string {
  const ext = path.extname(name).toLowerCase();
  if (contentType === "pdf" || ext === ".pdf") return "application/pdf";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return `image/${ext === ".jpg" ? "jpeg" : ext.slice(1)}`;
  if (ext === ".csv") return "text/csv";
  if (ext === ".ipynb") return "application/x-ipynb+json";
  if (contentType === "text" || TEXT_EXT.has(ext)) return "text/plain";
  return "application/octet-stream";
}

export function imageRef(ref: string, source: Base64Source, kind: "image" | "screenshot", name: string): AttachmentRef | null {
  if (source?.type !== "base64" || !source.data) return null;
  const mediaType = source.media_type ?? "image/png";
  return { ref, kind, name, mediaType, sizeBytes: base64Size(source.data), preview: "image" };
}

export function fileRef(line: number, entry: FileAttachmentEntry): AttachmentRef | null {
  if (entry?.type !== "file" || !entry.filename) return null;
  const file = entry.content?.file;
  if (!file || (file.base64 === undefined && file.content === undefined)) return null;
  const name = path.win32.basename(entry.filename);
  const mediaType = mediaTypeFor(name, entry.content?.type);
  const sizeBytes = file.originalSize ?? (file.base64 ? base64Size(file.base64) : Buffer.byteLength(file.content ?? ""));
  return { ref: `f${line}`, kind: "file", name, mediaType, sizeBytes, preview: previewFor(name, mediaType) };
}

/** Pulls the bytes for `ref` out of the raw transcript text. */
export function extractAttachment(raw: string, ref: string): Payload | null {
  const m = ref.match(/^([uft])(\d+)(?:-(\d+))?(?:-(\d+))?$/);
  if (!m) return null;
  const [, kind, lineStr, blockStr, itemStr] = m;
  const line = raw.split("\n")[Number(lineStr)];
  if (!line) return null;
  let entry: {
    attachment?: FileAttachmentEntry;
    message?: { content?: Array<{ source?: Base64Source; content?: Array<{ source?: Base64Source }> }> };
  };
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  if (kind === "f") {
    const att = entry.attachment;
    const file = att?.content?.file;
    if (!att?.filename || !file) return null;
    const name = path.win32.basename(att.filename);
    const mediaType = mediaTypeFor(name, att.content?.type);
    if (file.base64 !== undefined) return { name, mediaType, body: Buffer.from(file.base64, "base64") };
    const textType = mediaType === "application/octet-stream" ? "text/plain" : mediaType;
    return { name, mediaType: textType, body: Buffer.from(file.content ?? "", "utf8") };
  }

  const block = entry.message?.content?.[Number(blockStr)];
  const source = kind === "u" ? block?.source : block?.content?.[Number(itemStr)]?.source;
  if (source?.type !== "base64" || !source.data) return null;
  return { mediaType: source.media_type ?? "image/png", body: Buffer.from(source.data, "base64") };
}
