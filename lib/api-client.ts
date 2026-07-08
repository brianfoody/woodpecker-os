/**
 * Thin shim over the connector client, preserving the call sites of the old
 * fetch-based API client. All requests now go to the user's own machine via
 * the paired connector instead of Next.js API routes.
 */

import type { StreamEvent } from "@woodpeckeros/protocol";
import { getConnectorClient } from "@/lib/connector-client";

export function executeClaudeStream(
  prompt: string,
  opts?: { resumeSessionId?: string; image?: string }
): AsyncGenerator<StreamEvent> {
  return getConnectorClient().execute(prompt, opts);
}

export async function extractTextFromImage(base64: string): Promise<string> {
  return getConnectorClient().extractText(base64);
}

export function fetchSessionTranscript(
  sessionId: string
): Promise<{ textBlocks: string[]; isComplete: boolean } | null> {
  return getConnectorClient().getTranscript(sessionId);
}
