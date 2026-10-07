import { loadConversation } from "@/lib/sources/claudeCode";
import { saveTree } from "@/lib/store";
import { treeify } from "@/lib/treeify";

/** Build (or rebuild) the topic tree for a conversation. Calls `claude -p`, so it can take a minute. */
export async function POST(_req: Request, ctx: RouteContext<"/api/conversations/[id]/tree">) {
  const { id } = await ctx.params;
  const conversation = loadConversation(id);
  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });
  try {
    const tree = await treeify(conversation);
    saveTree(tree);
    return Response.json(tree);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
