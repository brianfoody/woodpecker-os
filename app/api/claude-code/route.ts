import { validateRequest } from "@/lib/auth";
import { runClaudeCode } from "@/lib/claude-code";
import { getSession, saveSession } from "@/lib/claude-code-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const startTime = Date.now();
  console.log(`[claude-code] POST received at ${new Date().toISOString()}`);

  if (!validateRequest(request)) {
    console.log(`[claude-code] Auth failed`);
    return new Response("Unauthorized", { status: 401 });
  }

  const { prompt, sessionId: directSessionId, canvasKey, image } = await request.json();
  const sessionId = directSessionId || (canvasKey ? getSession(canvasKey) : undefined);

  console.log(`[claude-code] prompt="${prompt.slice(0, 80)}..." canvasKey=${canvasKey || "none"} session=${sessionId || "new"} hasImage=${!!image}`);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send immediate feedback so the client knows we're alive
      send({ type: "status", content: "waking up..." });
      console.log(`[claude-code] Sent initial status, spawning SDK subprocess...`);

      (async () => {
        let eventCount = 0;
        try {
          for await (const event of runClaudeCode({ prompt, image, sessionId })) {
            eventCount++;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[claude-code] [${elapsed}s] event #${eventCount}: type=${event.type} ${event.toolName ? `tool=${event.toolName}` : ""} ${event.content ? `content=${event.content.slice(0, 60)}...` : ""}`);

            send(event);

            // Persist session ID for multi-turn and session history
            // Save on both "done" and "error" — errors from maxTurns still have a valid session
            if ((event.type === "done" || event.type === "error") && event.sessionId) {
              const key = canvasKey || event.sessionId;
              saveSession(key, event.sessionId, prompt);
              console.log(`[claude-code] Session saved: ${event.sessionId} key=${key}`);
            }
          }

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[claude-code] Stream complete. ${eventCount} events in ${elapsed}s`);
          controller.close();
        } catch (e) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[claude-code] [${elapsed}s] Error:`, e);
          send({ type: "error", content: String(e) });
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
