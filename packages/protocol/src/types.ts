/**
 * Wire protocol shared by the woodpeckeros.com canvas (browser), the
 * connector running on the user's machine, and the relay in between.
 *
 * Two layers:
 *  - Relay layer (plaintext): join / relay / peer-status frames. The relay
 *    only ever sees these; `relay` payloads are E2E ciphertext.
 *  - App layer (encrypted inside `relay.payload`): AppMessage.
 */

export const PROTOCOL_VERSION = 2;

export const DEFAULT_RELAY_URL = "wss://relay.woodpeckeros.com";
export const DEFAULT_LOCAL_PORT = 8787;
export const DEFAULT_APP_URL = "https://woodpeckeros.com";

/**
 * Hosted agents: the browser asks Woodpecker's fleet for an agent over this
 * well-known relay channel. The key is public (it ships in the web bundle) —
 * it only keeps the request off the wire in plaintext; access is gated by
 * invite codes on the fleet, not by this key.
 */
export const PROVISION_PAIRING = {
  channelId: "n-y802Zq5LXANrnufagaIA",
  key: "00jBYxR7ykd3wp4udyK4ODfj7iFAGdnOViCMx-3Y59c",
};

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

// ---------------------------------------------------------------------------
// Ambient canvas ("dots"): the agent quietly reads each handwritten line,
// classifies whether it is asking for something, and drafts — never acts —
// until the user ticks it.
// ---------------------------------------------------------------------------

/** What a line of writing is, as far as the agent can tell. */
export type IntentClass = "none" | "info" | "action";

export type ObservedLine = {
  id: string;
  /** Transcribed text of the line (empty if illegible / a drawing). */
  text: string;
  intent: IntentClass;
  /** 0..1 — the canvas only lights a dot above its threshold. */
  confidence: number;
  /** Short label for the dot's card, e.g. "Email Sam about the invoice". */
  title?: string;
  /** e.g. "email", "message", "calendar", "research", "reminder", "other". */
  kind?: string;
};

export type ObserveLine = {
  id: string;
  /** base64 PNG of just this line's ink. Omitted for typed/voice lines. */
  image?: string;
  /** Already-known text (voice lines) — skips transcription. */
  text?: string;
};

export type Draft = {
  /** One line the card leads with. */
  summary: string;
  /** Markdown body: the drafted email, the answer, the plan. */
  body: string;
  /** Is there something left to execute once the user ticks? */
  needsApproval: boolean;
};

export type FeedbackVerdict = "approved" | "cancelled" | "dismissed";

export type LearningEntry = {
  id: string;
  ts: string;
  text: string;
  intent: IntentClass;
  kind?: string;
  verdict: FeedbackVerdict;
  reason?: string;
};

export type AgentAuth = "ok" | "missing";

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
      /** Added in protocol 2 — absent from older connectors. */
      mode?: "local" | "cloud";
      auth?: AgentAuth;
      region?: string;
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
  // Ambient canvas
  | {
      kind: "observe";
      reqId: string;
      lines: ObserveLine[];
      /** Text of the surrounding page, oldest first, for context. */
      context: string[];
    }
  | { kind: "observe-result"; reqId: string; lines: ObservedLine[] }
  | {
      kind: "draft";
      reqId: string;
      lineId: string;
      text: string;
      intent: IntentClass;
      kindHint?: string;
      context: string[];
    }
  | { kind: "draft-result"; reqId: string; lineId: string; draft: Draft }
  | {
      kind: "approve";
      reqId: string;
      lineId: string;
      text: string;
      draft: Draft;
    }
  | {
      kind: "feedback";
      entry: Omit<LearningEntry, "id" | "ts">;
      /** Handwritten reason — transcribed on the agent before storing. */
      reasonImage?: string;
    }
  | { kind: "learning-list"; reqId: string }
  | { kind: "learning-list-result"; reqId: string; entries: LearningEntry[] }
  | { kind: "learning-forget"; id: string }
  // Cloud agent setup — the Claude credential travels E2E-encrypted.
  | {
      kind: "set-credential";
      reqId: string;
      credential: { type: "oauth-token" | "api-key"; value: string };
    }
  | { kind: "set-credential-result"; reqId: string; ok: boolean; message?: string }
  // Hosted agents (provision channel only)
  | {
      kind: "provision";
      reqId: string;
      invite: string;
      /** The new agent's pairing, minted in the browser. */
      pairing: { channelId: string; key: string };
    }
  | { kind: "provision-result"; reqId: string; ok: boolean; message?: string }
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
