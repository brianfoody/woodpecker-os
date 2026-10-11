/**
 * `woodpecker serve` — the headless agent. Woodpecker Cloud runs one per
 * user in its own container (see fleet.ts); it dials out to the relay
 * exactly like a laptop connector does, so nothing is exposed inbound.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_RELAY_URL, parsePairingHash, type Pairing } from "@woodpeckeros/protocol";
import { createCore } from "./core";
import { loadStoredCredential, authState } from "./credentials";
import { startRelayTransport } from "./transports";
import { statusToPlainText } from "./tutorial";
import { loadPairingFile, savePairingFile } from "./storage";

export async function serve(opts: {
  dir?: string;
  relay?: string;
  version: string;
}): Promise<void> {
  const cwd = opts.dir ?? join(homedir(), "workspace");
  mkdirSync(cwd, { recursive: true });

  // The deploy template hands us the pairing via env; persist it so a later
  // `woodpecker pair` on the box can re-print it.
  let pairing: Pairing | null = null;
  const fromEnv = process.env.WOODPECKER_PAIRING;
  if (fromEnv) {
    pairing = parsePairingHash(fromEnv);
    if (!pairing) throw new Error("WOODPECKER_PAIRING is not a valid pairing code");
    savePairingFile(pairing);
  } else {
    pairing = loadPairingFile<Pairing>();
  }
  if (!pairing) {
    throw new Error(
      "No pairing. Set WOODPECKER_PAIRING=<channelId>.<key> (the deploy template does this)."
    );
  }

  loadStoredCredential();
  const region = process.env.WOODPECKER_REGION;
  console.log(
    `[serve] Woodpecker cloud agent v${opts.version} · dir=${cwd} · region=${region ?? "?"} · claude=${authState("cloud")}`
  );

  const core = createCore({
    cwd,
    yolo: false,
    version: opts.version,
    mode: "cloud",
    region,
  });
  startRelayTransport({
    relayUrl: opts.relay ?? process.env.WOODPECKER_RELAY ?? DEFAULT_RELAY_URL,
    pairing,
    core,
    onStatus: (event) => console.log(`[serve] ${statusToPlainText(event)}`),
  });
}
