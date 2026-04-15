import { getRecentSessions, getSessionStats } from "@/lib/session-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = getRecentSessions();
  const stats = getSessionStats();
  return Response.json({ sessions, stats });
}
