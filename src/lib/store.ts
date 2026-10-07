import fs from "node:fs";
import path from "node:path";
import type { TopicTree } from "@/lib/types";

/** Generated trees live in ./data/trees (gitignored — they contain your chat content). */
const TREES_DIR = path.join(process.cwd(), "data", "trees");

export function loadTree(conversationId: string): TopicTree | null {
  const file = path.join(TREES_DIR, `${conversationId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveTree(tree: TopicTree): void {
  fs.mkdirSync(TREES_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TREES_DIR, `${tree.conversationId}.json`),
    JSON.stringify(tree, null, 2),
  );
}

export function listTreeIds(): Set<string> {
  if (!fs.existsSync(TREES_DIR)) return new Set();
  return new Set(fs.readdirSync(TREES_DIR).map((f) => f.replace(/\.json$/, "")));
}
