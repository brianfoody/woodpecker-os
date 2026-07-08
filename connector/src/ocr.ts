/**
 * One-shot Claude vision OCR of a circled canvas region.
 * Lifted from the old /api/extract-text route.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export async function extractTextFromImage(
  image: string,
  cwd: string
): Promise<string> {
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

  let extractedText = "";
  for await (const message of query({
    prompt: singleMessage(),
    options: {
      cwd,
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

  return extractedText.trim();
}
