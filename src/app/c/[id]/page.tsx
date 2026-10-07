import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadConversation } from "@/lib/sources/claudeCode";
import { loadTree } from "@/lib/store";
import { TreeView } from "@/components/TreeView";

export default function ConversationPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading conversation…</p>}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = loadConversation(id);
  if (!conversation) notFound();
  return <TreeView conversation={conversation} tree={loadTree(id)} />;
}
