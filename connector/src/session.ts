/**
 * Session listing + transcript reading via the Agent SDK's local JSONL
 * session files. Lifted from the old /api/sessions routes.
 */

import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import type { SessionSummary } from "@woodpeckeros/protocol";

export async function listSessionSummaries(cwd: string): Promise<SessionSummary[]> {
  try {
    const sessions = await listSessions({ dir: cwd, limit: 100 });
    return sessions.map((s) => ({
      session_id: s.sessionId,
      summary: s.summary || s.firstPrompt || "(no prompt)",
      first_prompt: s.firstPrompt || "",
      last_modified: s.lastModified,
      tag: s.tag || null,
    }));
  } catch (error) {
    console.error("[session] failed to list sessions:", error);
    return [];
  }
}

export async function getTranscript(
  sessionId: string
): Promise<{ textBlocks: string[]; isComplete: boolean }> {
  try {
    const messages = await getSessionMessages(sessionId);

    // Split assistant text at tool_use boundaries to match live streaming,
    // where each text segment between tool uses becomes its own shape.
    const textBlocks: string[] = [];

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
              if (currentText.trim()) {
                textBlocks.push(currentText.replace(/<[^>]*>/g, "").trim());
                currentText = "";
              }
            }
          }
          if (currentText.trim()) {
            textBlocks.push(currentText.replace(/<[^>]*>/g, "").trim());
          }
        }
      }
    }

    const isComplete = messages.some((msg) => {
      const m = msg as any;
      return m.type === "result" || (m.message as any)?.stop_reason === "end_turn";
    });

    return { textBlocks, isComplete };
  } catch (error) {
    console.error(`[session] failed to read session ${sessionId}:`, error);
    return { textBlocks: [], isComplete: false };
  }
}
