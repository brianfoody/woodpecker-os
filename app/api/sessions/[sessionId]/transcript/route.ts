import { validateRequest } from "@/lib/auth";
import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  if (!validateRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { sessionId } = await params;

  try {
    const messages = await getSessionMessages(sessionId);

    // Parse assistant messages into text blocks, splitting at tool_use boundaries
    // This matches the live streaming behavior where each text segment between
    // tool uses becomes its own shape.
    const textBlocks: string[] = [];
    let isComplete = false;

    for (const msg of messages) {
      if (msg.type === "assistant" && msg.message) {
        const content = (msg.message as any).content;
        if (Array.isArray(content)) {
          let currentText = "";
          for (const block of content) {
            if (block.type === "text" && block.text) {
              currentText += block.text;
            }
            if (block.type === "tool_use") {
              // Flush accumulated text as a block (split at tool_use boundary)
              if (currentText.trim()) {
                textBlocks.push(currentText.replace(/<[^>]*>/g, "").trim());
                currentText = "";
              }
            }
          }
          // Flush any remaining text after the last tool_use (or if no tool_use)
          if (currentText.trim()) {
            textBlocks.push(currentText.replace(/<[^>]*>/g, "").trim());
          }
        }
      }
    }

    // Check if the session has a result message (i.e., it completed)
    isComplete = messages.some((msg) => {
      const m = msg as any;
      return m.type === "result" || (m.message as any)?.stop_reason === "end_turn";
    });

    return Response.json({ textBlocks, isComplete });
  } catch (error) {
    console.error(`[transcript] Failed to read session ${sessionId}:`, error);
    return Response.json({ textBlocks: [], isComplete: false });
  }
}
