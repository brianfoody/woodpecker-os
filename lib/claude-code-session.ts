import {
  upsertSession,
  getSessionByCanvasKey,
  deleteSession as dbDeleteSession,
} from "./session-db";

export function saveSession(
  canvasKey: string,
  sessionId: string,
  prompt?: string
) {
  upsertSession(sessionId, canvasKey, prompt || "");
}

export function getSession(canvasKey: string): string | undefined {
  return getSessionByCanvasKey(canvasKey)?.session_id;
}

export function clearSession(canvasKey: string) {
  dbDeleteSession(canvasKey);
}
