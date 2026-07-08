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

/** Connection lifecycle events, rendered by the CLI (tutorial or plain). */
export type StatusEvent =
  | { kind: "relay-connecting" }
  | { kind: "relay-waiting" }
  | { kind: "canvas-connected"; local?: boolean }
  | { kind: "canvas-disconnected" }
  | { kind: "relay-retry"; seconds: number }
  | { kind: "local-listening"; port: number };

// ---------------------------------------------------------------------------
// Relay transport
// ---------------------------------------------------------------------------

export function startRelayTransport(opts: {
  relayUrl: string;
  pairing: Pairing;
  core: ConnectorCore;
  onStatus?: (event: StatusEvent) => void;
}): Transport {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoffMs = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  // Last known canvas presence, so peer-status renders as transitions
  // ("canvas disconnected") only when a canvas was actually there.
  let canvasPresent = false;

  const HEARTBEAT_MS = 30_000;

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
    opts.onStatus?.({ kind: "relay-connecting" });
    ws = new WebSocket(opts.relayUrl, { maxPayload: MAX_FRAME_BYTES });

    ws.on("open", () => {
      backoffMs = 1000;
      const join: RelayFrame = {
        type: "join",
        channelId: opts.pairing.channelId,
        role: "connector",
      };
      ws?.send(JSON.stringify(join));
      opts.onStatus?.({ kind: "relay-waiting" });

      // A silently dead TCP connection (sleep, network change) never fires
      // "close", which would leave us waiting on a socket the relay has long
      // since reaped. Ping and require a pong before the next beat.
      const socket = ws;
      let awaitingPong = false;
      socket?.on("pong", () => {
        awaitingPong = false;
      });
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (awaitingPong) {
          console.error("[relay] heartbeat timed out — reconnecting");
          socket.terminate(); // emits "close" → scheduleReconnect
          return;
        }
        awaitingPong = true;
        socket.ping();
      }, HEARTBEAT_MS);
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
        if (frame.role === "client" && frame.connected !== canvasPresent) {
          canvasPresent = frame.connected;
          opts.onStatus?.(
            frame.connected
              ? { kind: "canvas-connected" }
              : { kind: "canvas-disconnected" }
          );
        }
      } else if (frame.type === "relay-error") {
        console.error(`[relay] ${frame.message}`);
      }
    });

    const scheduleReconnect = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (stopped) return;
      opts.onStatus?.({
        kind: "relay-retry",
        seconds: Math.round(backoffMs / 1000),
      });
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
      if (heartbeatTimer) clearInterval(heartbeatTimer);
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
  onStatus?: (event: StatusEvent) => void;
}): Transport {
  const wss = new WebSocketServer({
    port: opts.port,
    host: "127.0.0.1",
    maxPayload: MAX_FRAME_BYTES,
  });

  wss.on("listening", () => {
    opts.onStatus?.({ kind: "local-listening", port: opts.port });
  });

  wss.on("connection", (socket) => {
    opts.onStatus?.({ kind: "canvas-connected", local: true });
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
