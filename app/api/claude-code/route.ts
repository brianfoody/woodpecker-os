import { validateRequest } from "@/lib/auth";
import { runClaudeCode } from "@/lib/claude-code";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const startTime = Date.now();
  console.log(`[claude-code] POST received at ${new Date().toISOString()}`);

  if (!validateRequest(request)) {
    console.log(`[claude-code] Auth failed`);
    return new Response("Unauthorized", { status: 401 });
  }

  const { prompt, resumeSessionId, image } = await request.json();

  console.log(`[claude-code] prompt="${prompt.slice(0, 80)}..." session=${resumeSessionId || "new"} hasImage=${!!image}`);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller already closed (HMR, client disconnect)
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      };

      // Send immediate feedback so the client knows we're alive
      send({ type: "status", content: "waking up..." });
      console.log(`[claude-code] Sent initial status, spawning SDK subprocess...`);

      (async () => {
        let eventCount = 0;
        try {
          for await (const event of runClaudeCode({ prompt, image, resumeSessionId })) {
            if (closed) break;
            eventCount++;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[claude-code] [${elapsed}s] event #${eventCount}: type=${event.type} ${event.toolName ? `tool=${event.toolName}` : ""} ${event.content ? `content=${event.content.slice(0, 60)}...` : ""}`);

            send(event);
          }

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[claude-code] Stream complete. ${eventCount} events in ${elapsed}s`);
          close();
        } catch (e) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[claude-code] [${elapsed}s] Error:`, e);
          send({ type: "error", content: String(e) });
          close();
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
