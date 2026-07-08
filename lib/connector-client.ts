/**
 * Browser-side client for the Woodpecker connector.
 *
 * Replaces the old fetch/SSE transport to /api/claude-code: the canvas now
 * talks to the user's own machine, either directly (local dev,
 * ws://localhost:8787) or through the relay with end-to-end encryption.
 *
 * Configuration is read from localStorage:
 *  - "woodpecker-pairing"       {channelId, key} written by /pair — relay mode
 *  - "woodpecker-connector-url" direct WS URL override (dev)
 *  - "woodpecker-relay-url"     relay URL override (dev)
 * With no pairing on localhost, it falls back to ws://localhost:8787 so
 * `woodpecker connect --local` + `next dev` just works.
 */

import {
  DEFAULT_LOCAL_PORT,
  PROTOCOL_VERSION,
  EnvelopeBuilder,
  ReplayGuard,
  importChannelKey,
  openEnvelope,
  sealEnvelope,
  randomB64Url,
  type AppMessage,
  type Envelope,
  type Pairing,
  type RelayFrame,
  type SessionSummary,
  type StreamEvent,
} from "@woodpeckeros/protocol";

export type ConnectorStatus =
  | "unpaired"
  | "connecting"
  | "waiting-for-connector"
  | "connected";

export type ConnectorInfo = {
  hostname: string;
  cwd: string;
  connectorVersion: string;
};

const PAIRING_KEY = "woodpecker-pairing";
const DEVICE_ID_KEY = "woodpecker-device-id";
const CONNECTOR_URL_KEY = "woodpecker-connector-url";
const RELAY_URL_KEY = "woodpecker-relay-url";

class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: Array<(result: IteratorResult<T>) => void> = [];
  private done = false;

  push(item: T): void {
    if (this.done) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  end(): void {
    this.done = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

type PendingRequest = {
  resolve: (msg: AppMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ConnectorClient {
  private ws: WebSocket | null = null;
  private status: ConnectorStatus = "unpaired";
  private statusListeners = new Set<(status: ConnectorStatus) => void>();
  private eventQueues = new Map<string, AsyncQueue<StreamEvent>>();
  private pendingRequests = new Map<string, PendingRequest>();
  private canvasWaiters = new Map<
    string,
    { resolve: (v: { rev: number; snapshot: unknown | null }) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private info: ConnectorInfo | null = null;

  private mode: "direct" | "relay" | "none" = "none";
  private directUrl = "";
  private relayUrl = "";
  private pairing: Pairing | null = null;
  private channelKey: CryptoKey | null = null;
  private builder: EnvelopeBuilder;
  private guard = new ReplayGuard();
  private backoffMs = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  private readonly deviceId: string;

  constructor() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = randomB64Url(8);
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    this.deviceId = deviceId;
    this.builder = new EnvelopeBuilder(this.deviceId);
    this.configure();
  }

  // -- configuration --------------------------------------------------------

  private configure(): void {
    const urlOverride = localStorage.getItem(CONNECTOR_URL_KEY);
    const pairingRaw = localStorage.getItem(PAIRING_KEY);

    if (urlOverride) {
      this.mode = "direct";
      this.directUrl = urlOverride;
      return;
    }
    if (pairingRaw) {
      try {
        const pairing = JSON.parse(pairingRaw) as Pairing;
        if (pairing.channelId && pairing.key) {
          this.mode = "relay";
          this.pairing = pairing;
          this.relayUrl =
            localStorage.getItem(RELAY_URL_KEY) ||
            process.env.NEXT_PUBLIC_RELAY_URL ||
            "";
          if (this.relayUrl) return;
        }
      } catch {
        // fall through
      }
    }
    if (
      typeof location !== "undefined" &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ) {
      this.mode = "direct";
      this.directUrl = `ws://localhost:${DEFAULT_LOCAL_PORT}`;
      return;
    }
    this.mode = "none";
  }

  /** Called by /pair after storing a new pairing. */
  reconfigure(): void {
    this.ws?.close();
    this.ws = null;
    this.configure();
    this.setStatus(this.mode === "none" ? "unpaired" : "connecting");
    if (this.mode !== "none") this.start();
  }

  // -- status ----------------------------------------------------------------

  getStatus(): ConnectorStatus {
    return this.status;
  }

  getInfo(): ConnectorInfo | null {
    return this.info;
  }

  isPaired(): boolean {
    return this.mode !== "none";
  }

  subscribeStatus(listener: (status: ConnectorStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: ConnectorStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  // -- connection ------------------------------------------------------------

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.mode === "none") {
      this.setStatus("unpaired");
      return;
    }
    this.connect();
  }

  private connect(): void {
    if (this.mode === "none") return;
    this.setStatus("connecting");

    const url = this.mode === "direct" ? this.directUrl : this.relayUrl;
    if (!url) {
      this.setStatus("unpaired");
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = async () => {
      this.backoffMs = 1000;
      if (this.mode === "relay" && this.pairing) {
        this.channelKey = await importChannelKey(this.pairing.key);
        const join: RelayFrame = {
          type: "join",
          channelId: this.pairing.channelId,
          role: "client",
        };
        ws.send(JSON.stringify(join));
        this.setStatus("waiting-for-connector");
      } else {
        this.setStatus("waiting-for-connector");
        this.sendHello();
      }
    };

    ws.onmessage = (event) => {
      void this.onWireMessage(String(event.data));
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.info = null;
      this.failActive("connection lost");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.setStatus("connecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, 15_000);
  }

  private async onWireMessage(raw: string): Promise<void> {
    if (this.mode === "direct") {
      try {
        this.onAppMessage(JSON.parse(raw) as AppMessage);
      } catch {
        // ignore malformed
      }
      return;
    }

    let frame: RelayFrame;
    try {
      frame = JSON.parse(raw) as RelayFrame;
    } catch {
      return;
    }

    if (frame.type === "relay") {
      if (!this.channelKey || !this.pairing) return;
      try {
        const env: Envelope = await openEnvelope(
          this.channelKey,
          this.pairing.channelId,
          "connector",
          frame.payload
        );
        if (!this.guard.accept(env)) return;
        this.onAppMessage(env.msg);
      } catch {
        // undecryptable — stale key or tampering; drop
      }
    } else if (frame.type === "peer-status" && frame.role === "connector") {
      if (frame.connected) {
        this.sendHello();
      } else {
        this.info = null;
        this.setStatus("waiting-for-connector");
        this.failActive("connector went offline");
      }
    } else if (frame.type === "joined") {
      if (frame.peer.connector) this.sendHello();
    }
  }

  private onAppMessage(msg: AppMessage): void {
    switch (msg.kind) {
      case "hello-ack": {
        this.info = {
          hostname: msg.hostname,
          cwd: msg.cwd,
          connectorVersion: msg.connectorVersion,
        };
        this.setStatus("connected");
        break;
      }
      case "event": {
        this.eventQueues.get(msg.reqId)?.push(msg.event);
        break;
      }
      case "extract-text-result":
      case "sessions-list-result":
      case "transcript-result": {
        const pending = this.pendingRequests.get(msg.reqId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.reqId);
          pending.resolve(msg);
        }
        break;
      }
      case "canvas-snapshot": {
        const waiter = this.canvasWaiters.get(msg.canvasKey);
        if (waiter) {
          clearTimeout(waiter.timer);
          this.canvasWaiters.delete(msg.canvasKey);
          waiter.resolve({ rev: msg.rev, snapshot: msg.snapshot });
        }
        break;
      }
      case "error": {
        if (msg.reqId) {
          const pending = this.pendingRequests.get(msg.reqId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(msg.reqId);
            pending.reject(new Error(msg.message));
            break;
          }
          this.eventQueues
            .get(msg.reqId)
            ?.push({ type: "error", content: msg.message });
        } else {
          console.error("[connector] error:", msg.message);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Push an error to every in-flight request so callers fail fast. */
  private failActive(reason: string): void {
    for (const queue of this.eventQueues.values()) {
      queue.push({ type: "error", content: reason });
    }
    for (const [reqId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingRequests.delete(reqId);
    }
    for (const [key, waiter] of this.canvasWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve({ rev: 0, snapshot: null });
      this.canvasWaiters.delete(key);
    }
  }

  private sendHello(): void {
    this.send({
      kind: "hello",
      deviceId: this.deviceId,
      deviceName:
        typeof navigator !== "undefined" ? navigator.platform : undefined,
      protocolVersion: PROTOCOL_VERSION,
    });
  }

  private send(msg: AppMessage): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (this.mode === "direct") {
      ws.send(JSON.stringify(msg));
      return;
    }
    if (!this.channelKey || !this.pairing) return;
    void sealEnvelope(
      this.channelKey,
      this.pairing.channelId,
      "client",
      this.builder.next(msg)
    )
      .then((payload) => {
        if (ws.readyState === WebSocket.OPEN) {
          const frame: RelayFrame = { type: "relay", payload };
          ws.send(JSON.stringify(frame));
        }
      })
      .catch((error) => console.error("[connector] send failed:", error));
  }

  private requireConnected(): void {
    this.start();
    if (this.status === "unpaired") {
      throw new Error(
        "Not paired — run `npx @woodpeckeros/connect` on your computer and scan the QR code"
      );
    }
    if (this.status !== "connected") {
      throw new Error(
        "Connector offline — run `npx @woodpeckeros/connect` on your computer"
      );
    }
  }

  private request(msg: AppMessage & { reqId: string }, timeoutMs: number): Promise<AppMessage> {
    this.requireConnected();
    return new Promise<AppMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(msg.reqId);
        reject(new Error("Request timed out"));
      }, timeoutMs);
      this.pendingRequests.set(msg.reqId, { resolve, reject, timer });
      this.send(msg);
    });
  }

  // -- public API ------------------------------------------------------------

  async *execute(
    prompt: string,
    opts?: { resumeSessionId?: string; image?: string }
  ): AsyncGenerator<StreamEvent> {
    this.requireConnected();
    const reqId = randomB64Url(12);
    const queue = new AsyncQueue<StreamEvent>();
    this.eventQueues.set(reqId, queue);
    this.send({
      kind: "execute",
      reqId,
      prompt,
      image: opts?.image,
      resumeSessionId: opts?.resumeSessionId,
    });

    let finished = false;
    try {
      for await (const event of queue) {
        yield event;
        if (event.type === "done" || event.type === "error") {
          finished = true;
          break;
        }
      }
    } finally {
      this.eventQueues.delete(reqId);
      if (!finished) {
        // Consumer bailed (scratch-out cancel, unmount) — stop the run.
        this.send({ kind: "cancel", reqId });
      }
    }
  }

  async extractText(image: string): Promise<string> {
    const reqId = randomB64Url(12);
    const result = await this.request(
      { kind: "extract-text", reqId, image },
      120_000
    );
    return result.kind === "extract-text-result" ? result.text : "";
  }

  async listSessions(): Promise<SessionSummary[]> {
    const reqId = randomB64Url(12);
    const result = await this.request({ kind: "sessions-list", reqId }, 30_000);
    return result.kind === "sessions-list-result" ? result.sessions : [];
  }

  async getTranscript(
    sessionId: string
  ): Promise<{ textBlocks: string[]; isComplete: boolean } | null> {
    try {
      const reqId = randomB64Url(12);
      const result = await this.request(
        { kind: "transcript", reqId, sessionId },
        30_000
      );
      return result.kind === "transcript-result"
        ? { textBlocks: result.textBlocks, isComplete: result.isComplete }
        : null;
    } catch {
      return null;
    }
  }

  saveCanvas(canvasKey: string, rev: number, snapshot: unknown): void {
    if (this.status !== "connected") return;
    this.send({ kind: "canvas-save", canvasKey, rev, snapshot });
  }

  loadCanvas(
    canvasKey: string
  ): Promise<{ rev: number; snapshot: unknown | null }> {
    if (this.status !== "connected") {
      return Promise.resolve({ rev: 0, snapshot: null });
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.canvasWaiters.delete(canvasKey);
        resolve({ rev: 0, snapshot: null });
      }, 10_000);
      this.canvasWaiters.set(canvasKey, { resolve, timer });
      this.send({ kind: "canvas-load", canvasKey });
    });
  }
}

let singleton: ConnectorClient | null = null;

export function getConnectorClient(): ConnectorClient {
  if (typeof window === "undefined") {
    throw new Error("ConnectorClient is browser-only");
  }
  if (!singleton) {
    singleton = new ConnectorClient();
    singleton.start();
  }
  return singleton;
}

/** Returns the client only if one already exists — never constructs. */
export function peekConnectorClient(): ConnectorClient | null {
  return singleton;
}
