import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export type StreamEvent = {
  type: "text_delta" | "tool_use" | "tool_result" | "status" | "error" | "done";
  content?: string;
  toolName?: string;
  sessionId?: string;
};

/**
 * Build the prompt for the Agent SDK query.
 * When an image is provided, we use an SDKUserMessage with multimodal content
 * so Claude Code can see the circled canvas area directly.
 */
function buildPrompt(
  textPrompt: string,
  imageBase64?: string
): string | AsyncIterable<SDKUserMessage> {
  if (!imageBase64) return textPrompt;

  // Wrap as a single-item async iterable of SDKUserMessage
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
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: "The user has drawn a circle around specific content on their canvas. Look at what is inside the circle and help them with it. If only part of a response is circled, focus exclusively on that part.",
        },
      ],
    },
    parent_tool_use_id: null,
  };

  async function* singleMessage(): AsyncIterable<SDKUserMessage> {
    yield userMessage;
  }
  return singleMessage();
}

export async function* runClaudeCode(opts: {
  prompt: string;
  image?: string;
  cwd?: string;
  sessionId?: string;
  allowedTools?: string[];
}): AsyncGenerator<StreamEvent> {
  const cwd = opts.cwd || process.env.CLAUDE_CODE_WORKING_DIR || process.cwd();
  const allowedTools = opts.allowedTools || ["Read", "Glob", "Grep", "Bash", "Edit", "Write"];

  console.log(`[sdk] Starting query: cwd=${cwd} tools=[${allowedTools.join(",")}] session=${opts.sessionId || "new"} hasImage=${!!opts.image}`);

  const options: Record<string, unknown> = {
    cwd,
    allowedTools,
    permissionMode: "default",
    maxTurns: 30,
  };

  if (opts.sessionId) {
    // Only set `resume` — the SDK docs say `sessionId` cannot be used
    // with `resume` unless `forkSession` is also set.
    options.resume = opts.sessionId;
  }

  const prompt = buildPrompt(opts.prompt, opts.image);

  let latestSessionId: string | undefined;
  try {
    let msgIndex = 0;
    for await (const message of query({ prompt, options })) {
      msgIndex++;
      const msg = message as any;

      // Capture session_id from every message so we have it even if the query errors out
      if (msg.session_id) {
        latestSessionId = msg.session_id;
      }

      // Extract tool use from assistant messages (the SDK embeds tool_use blocks in assistant content)
      if (message.type === "assistant" && msg.message) {
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              console.log(`[sdk] #${msgIndex} text: "${block.text.slice(0, 80)}..."`);
              yield { type: "text_delta", content: block.text };
            }
            if (block.type === "tool_use") {
              const toolName = block.name || "unknown";
              console.log(`[sdk] #${msgIndex} tool_use: ${toolName}`);
              yield { type: "tool_use", toolName };
            }
          }
        }
      }

      // Stream events (content_block_delta for streaming text)
      if (message.type === "stream_event") {
        const event = msg.event;
        if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield { type: "text_delta", content: event.delta.text };
        }
      }

      // Tool use summary events
      if (message.type === "tool_use_summary") {
        const toolName = msg.tool_name || msg.name;
        console.log(`[sdk] #${msgIndex} tool_use_summary: ${toolName}`);
        yield { type: "tool_use", toolName };
      }

      // Final result with session ID
      if (message.type === "result") {
        let content = "";
        if (typeof msg.result === "string") {
          content = msg.result;
        } else if (msg.result?.content) {
          content = typeof msg.result.content === "string"
            ? msg.result.content
            : JSON.stringify(msg.result.content);
        }
        console.log(`[sdk] #${msgIndex} result: session=${msg.session_id || msg.sessionId || "none"} len=${content.length}`);
        yield {
          type: "done",
          content,
          sessionId: msg.session_id || msg.sessionId,
        };
      }
    }
    console.log(`[sdk] Query finished after ${msgIndex} messages`);
  } catch (error) {
    console.error(`[sdk] Error:`, error);
    if (opts.sessionId && error instanceof Error && error.message.includes("session")) {
      console.log(`[sdk] Session resume failed, retrying without session`);
      yield* runClaudeCode({ ...opts, sessionId: undefined });
    } else {
      yield { type: "error", content: error instanceof Error ? error.message : "Unknown error", sessionId: latestSessionId };
    }
  }
}
