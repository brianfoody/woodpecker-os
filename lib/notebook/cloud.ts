/**
 * Hosted agents. The browser mints the new agent's pairing secret, then asks
 * Woodpecker's fleet (over the relay's provision channel) to start a
 * container for it. From then on the notebook talks to that container like
 * any other agent: end-to-end encrypted through the relay.
 */

import {
  DEFAULT_RELAY_URL,
  EnvelopeBuilder,
  PROVISION_PAIRING,
  ReplayGuard,
  generatePairing,
  importChannelKey,
  openEnvelope,
  randomB64Url,
  sealEnvelope,
  type Pairing,
  type RelayFrame,
} from "@woodpeckeros/protocol";

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (typeof location !== "undefined" ? location.origin : "https://woodpeckeros.com");

function relayUrl(): string {
  try {
    return localStorage.getItem("woodpecker-relay-url") || process.env.NEXT_PUBLIC_RELAY_URL || DEFAULT_RELAY_URL;
  } catch {
    return DEFAULT_RELAY_URL;
  }
}

export type ProvisionResult = { ok: true; pairing: Pairing } | { ok: false; message: string };

export async function startHostedAgent(invite: string): Promise<ProvisionResult> {
  const pairing = generatePairing();
  const key = await importChannelKey(PROVISION_PAIRING.key);
  const builder = new EnvelopeBuilder(`p-${randomB64Url(6)}`);
  const guard = new ReplayGuard();
  const reqId = randomB64Url(12);

  return new Promise((resolve) => {
    const ws = new WebSocket(relayUrl());
    let settled = false;
    const finish = (r: ProvisionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, message: "Woodpecker's agent service didn't answer — try again in a minute." }),
      25_000
    );
    let sent = false;
    const send = async () => {
      if (sent) return;
      sent = true;
      const payload = await sealEnvelope(
        key,
        PROVISION_PAIRING.channelId,
        "client",
        builder.next({ kind: "provision", reqId, invite: invite.trim(), pairing })
      );
      ws.send(JSON.stringify({ type: "relay", payload } satisfies RelayFrame));
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", channelId: PROVISION_PAIRING.channelId, role: "client" } satisfies RelayFrame));
    };
    ws.onmessage = async (event) => {
      let frame: RelayFrame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (frame.type === "joined") {
        if (frame.peer.connector) void send();
        else finish({ ok: false, message: "Woodpecker's agent service is offline right now — try again soon." });
      } else if (frame.type === "peer-status" && frame.role === "connector" && frame.connected) {
        void send();
      } else if (frame.type === "relay") {
        try {
          const env = await openEnvelope(key, PROVISION_PAIRING.channelId, "connector", frame.payload);
          if (!guard.accept(env)) return;
          const msg = env.msg;
          if (msg.kind === "provision-result" && msg.reqId === reqId) {
            finish(msg.ok ? { ok: true, pairing } : { ok: false, message: msg.message ?? "Couldn't start your agent." });
          }
        } catch {
          // not for us
        }
      } else if (frame.type === "relay-error") {
        finish({ ok: false, message: frame.message });
      }
    };
    ws.onerror = () => finish({ ok: false, message: "Couldn't reach Woodpecker — check your connection." });
  });
}
