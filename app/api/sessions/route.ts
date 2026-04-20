import { listSessions } from "@anthropic-ai/claude-agent-sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const cwd = process.env.CLAUDE_CODE_WORKING_DIR || process.cwd();

  try {
    const sessions = await listSessions({ dir: cwd, limit: 100 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const mapped = sessions.map((s) => ({
      session_id: s.sessionId,
      summary: s.summary || s.firstPrompt || "(no prompt)",
      first_prompt: s.firstPrompt || "",
      last_modified: s.lastModified,
      tag: s.tag || null,
    }));

    const total = mapped.length;
    const today = mapped.filter(
      (s) => s.last_modified >= todayStart.getTime()
    ).length;

    return Response.json({
      sessions: mapped,
      stats: { total, today },
    });
  } catch (error) {
    console.error("[sessions] Failed to list sessions:", error);
    return Response.json({ sessions: [], stats: { total: 0, today: 0 } });
  }
}
