/**
 * Two ways the canvas reaches the connector:
 *
 *  - RelayTransport: the connector dials OUT to the relay over wss and
 *    speaks E2E-encrypted frames. Works from anywhere, nothing to open
 *    on the user's network.
 *  - LocalServerTransport: a plain WS server on localhost for development
 *    (`woodpecker connect --local`) — plaintext app messages, no relay.
 */

import WebSocket, { WebSocketServer } from "ws";
import type { AppMessage, Envelope, RelayFrame } from "@woodpeckeros/protocol";
import {
  EnvelopeBuilder,
  ReplayGuard,
  importChannelKey,
  openEnvelope,
  sealEnvelope,
  MAX_FRAME_BYTES,
  type Pairing,
} from "@woodpeckeros/protocol";
import type { ConnectorCore } from "./core";

export type Transport = { stop(): void };

// ---------------------------------------------------------------------------
// Relay transport
// ---------------------------------------------------------------------------

export function startRelayTransport(opts: {
  relayUrl: string;
  pairing: Pairing;
  core: ConnectorCore;
  onStatus?: (status: string) => void;
}): Transport {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoffMs = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const builder = new EnvelopeBuilder("connector");
  const guard = new ReplayGuard();
  let keyPromise = importChannelKey(opts.pairing.key);

  const send = (msg: AppMessage): void => {
    const socket = ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    void keyPromise
      .then((key) =>
        sealEnvelope(key, opts.pairing.channelId, "connector", builder.next(msg))
      )
      .then((payload) => {
        const frame: RelayFrame = { type: "relay", payload };
        socket.send(JSON.stringify(frame));
      })
      .catch((error) => console.error("[relay] send failed:", error));
  };

  function connect(): void {
    if (stopped) return;
    opts.onStatus?.("connecting to relay...");
    ws = new WebSocket(opts.relayUrl, { maxPayload: MAX_FRAME_BYTES });

    ws.on("open", () => {
      backoffMs = 1000;
      const join: RelayFrame = {
        type: "join",
        channelId: opts.pairing.channelId,
        role: "connector",
      };
      ws?.send(JSON.stringify(join));
      opts.onStatus?.("connected to relay — waiting for canvas");
    });

    ws.on("message", (data) => {
      let frame: RelayFrame;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (frame.type === "relay") {
        void keyPromise
          .then((key) =>
            openEnvelope(key, opts.pairing.channelId, "client", frame.payload)
          )
          .then((env: Envelope) => {
            if (!guard.accept(env)) return;
            opts.core.handle(env.msg, send);
          })
          .catch(() => {
            // Undecryptable frame (stale key after re-pairing, tampering) — drop.
          });
      } else if (frame.type === "peer-status") {
        if (frame.role === "client") {
          opts.onStatus?.(
            frame.connected ? "canvas connected" : "canvas disconnected"
          );
        }
      } else if (frame.type === "relay-error") {
        console.error(`[relay] ${frame.message}`);
      }
    });

    const scheduleReconnect = () => {
      if (stopped) return;
      opts.onStatus?.(`relay connection lost — retrying in ${Math.round(backoffMs / 1000)}s`);
      reconnectTimer = setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    };

    ws.on("close", scheduleReconnect);
    ws.on("error", (error) => {
      console.error("[relay] socket error:", error.message);
      ws?.close();
    });
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Local dev transport (plain WS server, plaintext messages)
// ---------------------------------------------------------------------------

export function startLocalServer(opts: {
  port: number;
  core: ConnectorCore;
  onStatus?: (status: string) => void;
}): Transport {
  const wss = new WebSocketServer({
    port: opts.port,
    host: "127.0.0.1",
    maxPayload: MAX_FRAME_BYTES,
  });

  wss.on("listening", () => {
    opts.onStatus?.(`local mode: ws://localhost:${opts.port}`);
  });

  wss.on("connection", (socket) => {
    opts.onStatus?.("canvas connected (local)");
    const send = (msg: AppMessage): void => {
      // Broadcast to every connected client — one user, shared canvas.
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      }
    };

    socket.on("message", (data) => {
      let msg: AppMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      opts.core.handle(msg, send);
    });
  });

  wss.on("error", (error) => {
    console.error(`[local] server error:`, error.message);
  });

  return {
    stop() {
      wss.close();
    },
  };
}
