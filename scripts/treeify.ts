/**
 * Turn a Claude Code session into a topic tree from the command line.
 *
 *   npm run treeify -- list                 # recent sessions
 *   npm run treeify -- <session-id>         # build + save the tree
 *   npm run treeify -- <session-id> --dry   # print the prompt, don't call Claude
 */
import { listConversations, loadConversation } from "@/lib/sources/claudeCode";
import { saveTree } from "@/lib/store";
import { buildPrompt, treeify } from "@/lib/treeify";

async function main() {
  const [arg, flag] = process.argv.slice(2);

  if (!arg || arg === "list") {
    for (const c of listConversations().slice(0, 20)) {
      console.log(`${c.id}  ${c.updatedAt.slice(0, 10)}  [${c.project}]  ${c.title}`);
    }
    return;
  }

  const conversation = loadConversation(arg);
  if (!conversation) throw new Error(`No Claude Code session with id ${arg}`);

  if (flag === "--dry") {
    console.log(buildPrompt(conversation.turns));
    return;
  }

  console.log(`Treeifying "${conversation.title}" (${conversation.turns.length} turns)…`);
  const tree = await treeify(conversation);
  saveTree(tree);
  for (const s of tree.segments) {
    const depth = depthOf(s.id, tree.segments.map((x) => x.parent));
    console.log(`${"  ".repeat(depth)}- [${s.kind}] ${s.title}  (T${s.startTurn}-T${s.endTurn})`);
  }
  console.log(`\nSaved to data/trees/${tree.conversationId}.json`);
}

function depthOf(id: number, parents: (number | null)[]): number {
  let d = 0;
  for (let p = parents[id]; p !== null; p = parents[p]) d++;
  return d;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
