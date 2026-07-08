/**
 * Runs Claude Code locally via the Agent SDK, streaming StreamEvents back
 * to the canvas. Moved from the old Next.js server (lib/claude-code.ts) —
 * the key differences: it runs on the USER's machine with THEIR Claude
 * login, inherits their own MCP config instead of a hardcoded allowlist,
 * and routes every tool call through local guardrails.
 */

import { query, forkSession } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StreamEvent } from "@woodpeckeros/protocol";
import { createCanUseTool } from "./guardrails";

function buildPrompt(
  textPrompt: string,
  imageBase64?: string
): string | AsyncIterable<SDKUserMessage> {
  if (!imageBase64) return textPrompt;

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

/**
 * Create a fork point from a completed session.
 * This is a pure JSONL file copy — no API call, no tokens.
 */
async function createForkPoint(sessionId: string, cwd: string): Promise<string> {
  const result = await forkSession(sessionId, { dir: cwd });
  return result.sessionId;
}

export async function* runClaudeCode(opts: {
  prompt: string;
  image?: string;
  cwd: string;
  resumeSessionId?: string;
  yolo?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const cwd = opts.cwd;

  // Guardrail denials are surfaced on the canvas as status events; the
  // queue is drained between SDK messages.
  const pendingStatus: StreamEvent[] = [];

  const abortController = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) return;
    opts.signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });
  }

  const options: Record<string, unknown> = {
    cwd,
    permissionMode: opts.yolo ? "bypassPermissions" : "default",
    maxTurns: 30,
    abortController,
  };

  if (!opts.yolo) {
    options.canUseTool = createCanUseTool({
      cwd,
      onBlocked: (toolName, reason) => {
        pendingStatus.push({
          type: "status",
          content: `blocked ${toolName}: ${reason} — rerun the connector with --yolo to allow`,
        });
      },
    });
  }

  if (opts.resumeSessionId) {
    // Resume from the fork point and fork again so the original stays immutable
    options.resume = opts.resumeSessionId;
    options.forkSession = true;
  }

  console.log(
    `[agent] query: cwd=${cwd} session=${opts.resumeSessionId || "new"} hasImage=${!!opts.image} yolo=${!!opts.yolo}`
  );

  const prompt = buildPrompt(opts.prompt, opts.image);

  let latestSessionId: string | undefined;
  try {
    let msgIndex = 0;
    for await (const message of query({ prompt, options })) {
      msgIndex++;
      const msg = message as any;

      while (pendingStatus.length > 0) yield pendingStatus.shift()!;

      // Capture session_id from every message so we have it even if the query errors out
      if (msg.session_id) {
        latestSessionId = msg.session_id;
      }

      // Extract text + tool use from assistant messages
      if (message.type === "assistant" && msg.message) {
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              yield { type: "text_delta", content: block.text };
            }
            if (block.type === "tool_use") {
              yield { type: "tool_use", toolName: block.name || "unknown" };
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

      if (message.type === "tool_use_summary") {
        yield { type: "tool_use", toolName: msg.tool_name || msg.name };
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
        const resultSessionId = msg.session_id || msg.sessionId;

        // Create a fork point so this session becomes an immutable snapshot
        let forkId: string | undefined;
        if (resultSessionId) {
          try {
            forkId = await createForkPoint(resultSessionId, cwd);
          } catch (forkErr) {
            // Fallback: use the live session ID (fork happens on-demand at resume time)
            console.warn(`[agent] fork failed, using live session:`, forkErr);
            forkId = resultSessionId;
          }
        }

        yield {
          type: "done",
          content,
          sessionId: resultSessionId,
          forkSessionId: forkId,
        };
      }
    }
    while (pendingStatus.length > 0) yield pendingStatus.shift()!;
    console.log(`[agent] query finished after ${msgIndex} messages`);
  } catch (error) {
    if (opts.signal?.aborted || abortController.signal.aborted) {
      console.log(`[agent] query cancelled`);
      return;
    }
    console.error(`[agent] error:`, error);
    if (opts.resumeSessionId && error instanceof Error && error.message.includes("session")) {
      console.log(`[agent] session resume failed, retrying without session`);
      yield* runClaudeCode({ ...opts, resumeSessionId: undefined });
    } else {
      yield {
        type: "error",
        content: error instanceof Error ? error.message : "Unknown error",
        sessionId: latestSessionId,
      };
    }
  }
}
