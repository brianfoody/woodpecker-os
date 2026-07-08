/**
 * Wire protocol shared by the woodpeckeros.com canvas (browser), the
 * connector running on the user's machine, and the relay in between.
 *
 * Two layers:
 *  - Relay layer (plaintext): join / relay / peer-status frames. The relay
 *    only ever sees these; `relay` payloads are E2E ciphertext.
 *  - App layer (encrypted inside `relay.payload`): AppMessage.
 */

export const PROTOCOL_VERSION = 1;

export const DEFAULT_RELAY_URL = "wss://relay.woodpeckeros.com";
export const DEFAULT_LOCAL_PORT = 8787;
export const DEFAULT_APP_URL = "https://woodpeckeros.com";

/** Hard cap on a single relay frame (base64 ciphertext included). */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;
/** Canvas snapshots above this fall back to localStorage-only on the client. */
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export type Role = "connector" | "client";

// ---------------------------------------------------------------------------
// Relay layer
// ---------------------------------------------------------------------------

export type RelayFrame =
  | { type: "join"; channelId: string; role: Role }
  | { type: "joined"; peer: { connector: boolean; clients: number } }
  | { type: "relay"; payload: string }
  | { type: "peer-status"; role: Role; connected: boolean }
  | { type: "relay-error"; message: string };

// ---------------------------------------------------------------------------
// App layer
// ---------------------------------------------------------------------------

/**
 * Streaming events produced while Claude Code runs. Shape is preserved
 * verbatim from the original SSE implementation so canvas rendering code
 * is unaffected by the transport change.
 */
export type StreamEvent = {
  type: "text_delta" | "tool_use" | "tool_result" | "status" | "error" | "done";
  content?: string;
  toolName?: string;
  sessionId?: string;
  forkSessionId?: string;
};

export type SessionSummary = {
  session_id: string;
  summary: string;
  first_prompt: string;
  last_modified: number;
  tag: string | null;
};

export type AppMessage =
  // Handshake
  | {
      kind: "hello";
      deviceId: string;
      deviceName?: string;
      protocolVersion: number;
    }
  | {
      kind: "hello-ack";
      connectorVersion: string;
      cwd: string;
      hostname: string;
      protocolVersion: number;
    }
  // Claude Code execution
  | {
      kind: "execute";
      reqId: string;
      prompt: string;
      image?: string;
      resumeSessionId?: string;
    }
  | { kind: "cancel"; reqId: string }
  | { kind: "event"; reqId: string; event: StreamEvent }
  // OCR
  | { kind: "extract-text"; reqId: string; image: string }
  | { kind: "extract-text-result"; reqId: string; text: string }
  // Canvas snapshot sync (connector-backed cross-device persistence)
  | { kind: "canvas-save"; canvasKey: string; rev: number; snapshot: unknown }
  | { kind: "canvas-load"; canvasKey: string }
  | {
      kind: "canvas-snapshot";
      canvasKey: string;
      rev: number;
      snapshot: unknown | null;
    }
  // Session history
  | { kind: "sessions-list"; reqId: string }
  | {
      kind: "sessions-list-result";
      reqId: string;
      sessions: SessionSummary[];
    }
  | { kind: "transcript"; reqId: string; sessionId: string }
  | {
      kind: "transcript-result";
      reqId: string;
      textBlocks: string[];
      isComplete: boolean;
    }
  // Errors tied to a request (or connection-level when reqId is absent)
  | { kind: "error"; reqId?: string; message: string };

/**
 * Envelope wrapped around every AppMessage before encryption.
 * `from` + `epoch` + monotonic `seq` give receivers replay protection
 * within a sender's process lifetime (epoch is random per process start).
 */
export type Envelope = {
  v: number;
  from: string;
  epoch: string;
  seq: number;
  msg: AppMessage;
};
