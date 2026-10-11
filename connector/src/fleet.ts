/**
 * `woodpecker fleet` — Woodpecker's hosted agents.
 *
 * Runs as root on one Woodpecker-owned server. Each user gets their own
 * Docker container running `woodpecker serve` (their own filesystem, their
 * own Claude credential, memory-capped), so one user's agent can never read
 * another's. New agents are requested over the relay's well-known provision
 * channel and gated by invite codes; the fleet never sees notebook traffic —
 * that flows browser ⇄ relay ⇄ the user's container, end-to-end encrypted.
 *
 *   woodpecker fleet            supervise + accept provision requests
 *   woodpecker fleet --refresh  recreate every container on the current image
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  DEFAULT_RELAY_URL,
  PROVISION_PAIRING,
  parsePairingHash,
  type AppMessage,
} from "@woodpeckeros/protocol";
import type { ConnectorCore } from "./core";
import { startRelayTransport } from "./transports";
import { statusToPlainText } from "./tutorial";

const STATE_PATH = process.env.WOODPECKER_FLEET_STATE ?? "/var/lib/woodpecker/tenants.json";
const IMAGE = process.env.WOODPECKER_IMAGE ?? "woodpecker-agent:latest";
const MAX_TENANTS = Number(process.env.WOODPECKER_MAX_TENANTS ?? 12);

type Tenant = {
  id: string;
  pairing: string; // channelId.key — the container's env
  invite: string;
  createdAt: string;
};

type FleetState = { tenants: Tenant[] };

function loadState(): FleetState {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as FleetState;
  } catch {
    return { tenants: [] };
  }
}

function saveState(state: FleetState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
}

/** "code:max,code2:max" — each invite may start up to `max` agents. */
function parseInvites(): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of (process.env.WOODPECKER_INVITES ?? "").split(",")) {
    const [code, max] = part.trim().split(":");
    if (code) out.set(code.toLowerCase(), Number(max) || 5);
  }
  return out;
}

function docker(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function containerName(t: Tenant): string {
  return `wp-${t.id}`;
}

function runContainer(t: Tenant): void {
  const name = containerName(t);
  try {
    docker(["rm", "-f", name]);
  } catch {
    // not there yet
  }
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--restart",
    "unless-stopped",
    "--memory",
    process.env.WOODPECKER_TENANT_MEMORY ?? "1g",
    "--memory-swap",
    process.env.WOODPECKER_TENANT_SWAP ?? "2g",
    "--cpus",
    "1",
    "--pids-limit",
    "512",
    "--security-opt",
    "no-new-privileges",
    "-e",
    `WOODPECKER_PAIRING=${t.pairing}`,
    "-e",
    `WOODPECKER_RELAY=${process.env.WOODPECKER_RELAY ?? DEFAULT_RELAY_URL}`,
    "-e",
    `WOODPECKER_REGION=${process.env.WOODPECKER_REGION ?? ""}`,
    "-e",
    "WOODPECKER_HOSTED=1",
    "-v",
    `${name}:/home/woodpecker`,
    IMAGE,
  ]);
}

function isRunning(t: Tenant): boolean {
  try {
    return docker(["inspect", "-f", "{{.State.Running}}", containerName(t)]) === "true";
  } catch {
    return false;
  }
}

export async function fleet(opts: { refresh: boolean }): Promise<void> {
  const state = loadState();

  // Make sure every known agent is up (after a reboot or an image refresh).
  for (const t of state.tenants) {
    if (opts.refresh || !isRunning(t)) {
      try {
        runContainer(t);
        console.log(`[fleet] started ${containerName(t)}`);
      } catch (error) {
        console.error(`[fleet] could not start ${containerName(t)}:`, error);
      }
    }
  }
  if (opts.refresh) return;

  console.log(`[fleet] ${state.tenants.length}/${MAX_TENANTS} agents · image ${IMAGE}`);

  const handle = (msg: AppMessage, send: (m: AppMessage) => void): void => {
    if (msg.kind !== "provision") return;
    const reply = (ok: boolean, message?: string) =>
      send({ kind: "provision-result", reqId: msg.reqId, ok, message });

    const pairing = parsePairingHash(`${msg.pairing?.channelId}.${msg.pairing?.key}`);
    if (!pairing) return reply(false, "That request was malformed.");

    const current = loadState();
    const id = createHash("sha256").update(pairing.channelId).digest("hex").slice(0, 12);
    if (current.tenants.some((t) => t.id === id)) return reply(true, "Already running.");

    const invite = String(msg.invite ?? "").trim().toLowerCase();
    const invites = parseInvites();
    const allowed = invites.get(invite);
    if (!allowed) return reply(false, "That invite code isn't valid.");
    const used = current.tenants.filter((t) => t.invite === invite).length;
    if (used >= allowed) return reply(false, "That invite code has been used up.");
    if (current.tenants.length >= MAX_TENANTS) {
      return reply(false, "We're full right now — try again soon.");
    }

    const tenant: Tenant = {
      id,
      pairing: `${pairing.channelId}.${pairing.key}`,
      invite,
      createdAt: new Date().toISOString(),
    };
    try {
      runContainer(tenant);
    } catch (error) {
      console.error("[fleet] provision failed:", error);
      return reply(false, "Couldn't start your agent — please try again.");
    }
    saveState({ tenants: [...current.tenants, tenant] });
    console.log(`[fleet] provisioned ${containerName(tenant)} (invite ${invite})`);
    reply(true);
  };

  const core: ConnectorCore = {
    handle: (msg, send) => {
      try {
        handle(msg, send);
      } catch (error) {
        console.error("[fleet] handler error:", error);
      }
    },
  };

  if (!existsSync("/var/run/docker.sock")) {
    console.warn("[fleet] docker socket not found — provisioning will fail");
  }

  startRelayTransport({
    relayUrl: process.env.WOODPECKER_RELAY ?? DEFAULT_RELAY_URL,
    pairing: PROVISION_PAIRING,
    core,
    onStatus: (event) => console.log(`[fleet] ${statusToPlainText(event)}`),
  });
}
