import { getSetupStatus } from "@/lib/setup";

/** Used by the launcher to tell whether Claude Tree is already running, and by anyone debugging setup. */
export async function GET() {
  return Response.json({ app: "claude-tree", ...getSetupStatus() });
}
