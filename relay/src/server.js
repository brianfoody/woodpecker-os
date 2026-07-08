/**
 * Woodpecker relay — a dumb pipe.
 *
 * Sockets join a channel as "connector" or "client"; `relay` frames are
 * forwarded to the opposite role. Payloads are E2E ciphertext the relay
 * cannot read. No storage, no queueing: if the peer is absent, frames are
 * dropped and presence is signalled via `peer-status`.
 *
 * Abuse controls: per-IP connect rate limit, per-socket message rate and
 * throughput caps, frame size cap, idle timeout, max clients per channel.
 * Payloads are never logged.
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 9000);
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_CLIENTS_PER_CHANNEL = 8;
const MSG_RATE_PER_SEC = 20;
const BYTES_PER_MIN = 20 * 1024 * 1024;
const CONNECTS_PER_IP_PER_MIN = 10;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;

/** channelId -> { connector: ws|null, clients: Set<ws> } */
const channels = new Map();
/** ip -> [connect timestamps] */
const connectLog = new Map();

const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_FRAME_BYTES });

function clientIp(req) {
  const fwd = req.headers["fly-client-ip"] || req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function rateLimitConnect(ip) {
  const now = Date.now();
  const log = (connectLog.get(ip) || []).filter((t) => now - t < 60_000);
  log.push(now);
  connectLog.set(ip, log);
  return log.length > CONNECTS_PER_IP_PER_MIN;
}

function validChannelId(id) {
  // 16 bytes base64url = 22 chars
  return typeof id === "string" && /^[A-Za-z0-9_-]{22}$/.test(id);
}

function getChannel(channelId) {
  let ch = channels.get(channelId);
  if (!ch) {
    ch = { connector: null, clients: new Set() };
    channels.set(channelId, ch);
  }
  return ch;
}

function send(ws, frame) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
}

function broadcastPeerStatus(channel, role, connected) {
  const frame = { type: "peer-status", role, connected };
  if (role === "connector") {
    for (const client of channel.clients) send(client, frame);
  } else {
    send(channel.connector, frame);
  }
}

function detach(ws) {
  const { channelId, role } = ws.meta || {};
  if (!channelId) return;
  const channel = channels.get(channelId);
  if (!channel) return;
  if (role === "connector" && channel.connector === ws) {
    channel.connector = null;
    broadcastPeerStatus(channel, "connector", false);
  } else if (role === "client") {
    channel.clients.delete(ws);
    broadcastPeerStatus(channel, "client", false);
  }
  if (!channel.connector && channel.clients.size === 0) {
    channels.delete(channelId);
  }
}

wss.on("connection", (ws, req) => {
  const ip = clientIp(req);
  if (rateLimitConnect(ip)) {
    send(ws, { type: "relay-error", message: "rate limited" });
    ws.close(1013, "rate limited");
    return;
  }

  ws.meta = null;
  ws.isAlive = true;
  ws.lastActivity = Date.now();
  ws.msgTimestamps = [];
  ws.byteLog = [];

  ws.on("pong", () => {
    // A pong is proof of life: refresh the idle clock too, so a healthy but
    // quiet connector/canvas isn't reaped every IDLE_TIMEOUT_MS.
    ws.isAlive = true;
    ws.lastActivity = Date.now();
  });

  ws.on("message", (data) => {
    ws.lastActivity = Date.now();

    // Per-socket rate limits
    const now = Date.now();
    ws.msgTimestamps = ws.msgTimestamps.filter((t) => now - t < 1000);
    ws.msgTimestamps.push(now);
    ws.byteLog = ws.byteLog.filter(([t]) => now - t < 60_000);
    ws.byteLog.push([now, data.length]);
    const bytesLastMin = ws.byteLog.reduce((sum, [, n]) => sum + n, 0);
    if (ws.msgTimestamps.length > MSG_RATE_PER_SEC || bytesLastMin > BYTES_PER_MIN) {
      send(ws, { type: "relay-error", message: "throughput limit exceeded" });
      ws.close(1013, "throughput limit");
      return;
    }

    let frame;
    try {
      frame = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!ws.meta) {
      // First frame must be a join
      if (
        frame.type !== "join" ||
        !validChannelId(frame.channelId) ||
        (frame.role !== "connector" && frame.role !== "client")
      ) {
        send(ws, { type: "relay-error", message: "expected valid join" });
        ws.close(1008, "expected join");
        return;
      }
      const channel = getChannel(frame.channelId);
      if (frame.role === "client" && channel.clients.size >= MAX_CLIENTS_PER_CHANNEL) {
        send(ws, { type: "relay-error", message: "too many devices on channel" });
        ws.close(1013, "channel full");
        return;
      }
      if (frame.role === "connector") {
        // Newest connector wins (a restarted connector replaces the zombie)
        if (channel.connector && channel.connector !== ws) {
          channel.connector.close(1012, "replaced");
        }
        channel.connector = ws;
      } else {
        channel.clients.add(ws);
      }
      ws.meta = { channelId: frame.channelId, role: frame.role };
      send(ws, {
        type: "joined",
        peer: { connector: !!channel.connector, clients: channel.clients.size },
      });
      // Tell the joiner about the other side, and the other side about the joiner
      if (frame.role === "client") {
        send(ws, { type: "peer-status", role: "connector", connected: !!channel.connector });
      } else {
        send(ws, { type: "peer-status", role: "client", connected: channel.clients.size > 0 });
      }
      broadcastPeerStatus(channel, frame.role, true);
      return;
    }

    if (frame.type === "relay" && typeof frame.payload === "string") {
      const channel = channels.get(ws.meta.channelId);
      if (!channel) return;
      const out = { type: "relay", payload: frame.payload };
      if (ws.meta.role === "connector") {
        for (const client of channel.clients) send(client, out);
      } else {
        send(channel.connector, out);
      }
    }
  });

  ws.on("close", () => detach(ws));
  ws.on("error", () => ws.close());
});

// Heartbeat + idle reaping
setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (now - ws.lastActivity > IDLE_TIMEOUT_MS) {
      ws.terminate();
      continue;
    }
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

httpServer.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
});
