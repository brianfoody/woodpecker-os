import { validateRequest } from "@/lib/auth";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validateRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { image } = await request.json();
  if (!image) {
    return Response.json({ error: "Missing image" }, { status: 400 });
  }

  const userMessage: SDKUserMessage = {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: image,
          },
        },
        {
          type: "text",
          text: "Extract only the handwritten text visible in this image. Return the raw text only, no commentary.",
        },
      ],
    },
    parent_tool_use_id: null,
  };

  async function* singleMessage(): AsyncIterable<SDKUserMessage> {
    yield userMessage;
  }

  try {
    let extractedText = "";
    for await (const message of query({
      prompt: singleMessage(),
      options: {
        cwd: process.cwd(),
        allowedTools: [],
        maxTurns: 1,
      },
    })) {
      const msg = message as any;
      if (message.type === "assistant" && msg.message) {
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              extractedText += block.text;
            }
          }
        }
      }
      if (message.type === "result") {
        if (typeof msg.result === "string") {
          extractedText = extractedText || msg.result;
        } else if (msg.result?.content) {
          extractedText = extractedText || (typeof msg.result.content === "string"
            ? msg.result.content
            : JSON.stringify(msg.result.content));
        }
      }
    }

    return Response.json({ text: extractedText.trim() });
  } catch (error) {
    console.error("[extract-text] Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "OCR failed" },
      { status: 500 }
    );
  }
}
