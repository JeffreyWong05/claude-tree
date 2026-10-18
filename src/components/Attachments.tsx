"use client";

import { useEffect, useState } from "react";
import type { AttachmentRef } from "@/lib/types";

const CSV_ROW_LIMIT = 200;
const TEXT_CHAR_LIMIT = 200_000;

const FILE_ICON: Record<AttachmentRef["preview"], string> = {
  image: "🖼️",
  pdf: "📄",
  csv: "📊",
  text: "📝",
  none: "📎",
};

function urlFor(conversationId: string, a: AttachmentRef): string {
  return `/api/conversations/${conversationId}/attachments/${a.ref}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Images and files the user shared in a prompt: thumbnails + file chips. */
export function AttachmentList({ conversationId, items }: { conversationId: string; items: AttachmentRef[] }) {
  const [open, setOpen] = useState<AttachmentRef | null>(null);
  const images = items.filter((a) => a.preview === "image");
  const files = items.filter((a) => a.preview !== "image");
  if (items.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <button key={a.ref} onClick={() => setOpen(a)} title={`${a.name} · ${formatSize(a.sizeBytes)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local API bytes, not optimizable assets */}
              <img
                src={urlFor(conversationId, a)}
                alt={a.name}
                loading="lazy"
                className="max-h-40 max-w-full rounded border border-border object-contain hover:opacity-90"
              />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((a) => (
            <button
              key={a.ref}
              onClick={() => setOpen(a)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1 text-xs hover:border-accent"
            >
              <span>{FILE_ICON[a.preview]}</span>
              <span className="max-w-56 truncate font-medium">{a.name}</span>
              <span className="text-muted">{formatSize(a.sizeBytes)}</span>
            </button>
          ))}
        </div>
      )}
      {open && <Viewer conversationId={conversationId} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Screenshots from tools Claude ran — collapsed by default so they don't crowd the reply. */
export function ScreenshotStrip({ conversationId, items }: { conversationId: string; items: AttachmentRef[] }) {
  const [open, setOpen] = useState<AttachmentRef | null>(null);
  if (items.length === 0) return null;
  return (
    <details className="mt-3 rounded border border-border">
      <summary className="cursor-pointer px-3 py-1.5 text-xs text-muted select-none hover:text-foreground">
        📷 {items.length} image{items.length === 1 ? "" : "s"} from Claude&apos;s tools
      </summary>
      <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3">
        {items.map((a) => (
          <button key={a.ref} onClick={() => setOpen(a)} title={a.name} className="text-left">
            {/* eslint-disable-next-line @next/next/no-img-element -- local API bytes, not optimizable assets */}
            <img src={urlFor(conversationId, a)} alt={a.name} loading="lazy" className="w-full rounded border border-border hover:opacity-90" />
            <span className="block truncate text-[10px] text-muted">{a.name}</span>
          </button>
        ))}
      </div>
      {open && <Viewer conversationId={conversationId} item={open} onClose={() => setOpen(null)} />}
    </details>
  );
}

function Viewer({ conversationId, item, onClose }: { conversationId: string; item: AttachmentRef; onClose: () => void }) {
  const url = urlFor(conversationId, item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
          <span className="text-xs text-muted">{formatSize(item.sizeBytes)}</span>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Open in new tab</a>
          <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {item.preview === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- local API bytes, not optimizable assets
            <img src={url} alt={item.name} className="mx-auto max-h-[80vh] object-contain" />
          )}
          {item.preview === "pdf" && <iframe src={url} title={item.name} className="h-[80vh] w-full" />}
          {item.preview === "csv" && <CsvPreview url={url} tab={item.name.toLowerCase().endsWith(".tsv")} />}
          {item.preview === "text" && <TextPreview url={url} />}
          {item.preview === "none" && (
            <p className="p-6 text-sm text-muted">
              No preview for this file type yet. Use <b>Open in new tab</b> to download it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function useText(url: string): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText))))
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setText("(Could not load this file.)"));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return text;
}

function TextPreview({ url }: { url: string }) {
  const text = useText(url);
  if (text === null) return <p className="p-6 text-sm text-muted">Loading…</p>;
  const clipped = text.length > TEXT_CHAR_LIMIT;
  return (
    <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
      {clipped ? text.slice(0, TEXT_CHAR_LIMIT) : text}
      {clipped && `\n\n… ${text.length - TEXT_CHAR_LIMIT} more characters — open in a new tab to see everything.`}
    </pre>
  );
}

/** Minimal CSV parser: handles quoted fields, escaped quotes, and newlines inside quotes. */
export function parseCsv(text: string, delimiter = ",", maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if ((field || row.length) && rows.length < maxRows) rows.push([...row, field]);
  return rows;
}

function CsvPreview({ url, tab }: { url: string; tab: boolean }) {
  const text = useText(url);
  if (text === null) return <p className="p-6 text-sm text-muted">Loading…</p>;
  const rows = parseCsv(text, tab ? "\t" : ",", CSV_ROW_LIMIT + 1);
  const [header, ...body] = rows;
  const totalLines = text.split("\n").filter(Boolean).length - 1;
  return (
    <div className="p-2">
      <table className="text-xs">
        <thead className="sticky top-0 bg-panel">
          <tr>
            {header?.map((h, i) => (
              <th key={i} className="border border-border px-2 py-1 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.slice(0, CSV_ROW_LIMIT).map((r, i) => (
            <tr key={i} className="even:bg-background">
              {r.map((cell, j) => (
                <td key={j} className="border border-border px-2 py-1 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {totalLines > CSV_ROW_LIMIT && (
        <p className="p-2 text-xs text-muted">Showing the first {CSV_ROW_LIMIT} of ~{totalLines} rows.</p>
      )}
    </div>
  );
}
