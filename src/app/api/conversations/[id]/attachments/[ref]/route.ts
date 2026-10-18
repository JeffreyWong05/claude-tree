import { loadAttachment } from "@/lib/sources/claudeCode";

/** Streams one image or file out of a transcript. Loaded lazily so pages stay light. */
export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]/attachments/[ref]">) {
  const { id, ref } = await ctx.params;
  const payload = loadAttachment(id, ref);
  if (!payload) return new Response("Attachment not found", { status: 404 });
  const type = payload.mediaType.startsWith("text/") ? `${payload.mediaType}; charset=utf-8` : payload.mediaType;
  return new Response(new Uint8Array(payload.body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": payload.name
        ? `inline; filename*=UTF-8''${encodeURIComponent(payload.name)}`
        : "inline",
      // Transcript lines never change once written, so a ref always maps to the same bytes.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
