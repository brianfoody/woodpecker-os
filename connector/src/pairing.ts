/**
 * Pairing between this machine and the woodpeckeros.com canvas.
 * The QR encodes a URL whose FRAGMENT carries the channel id + key —
 * fragments never leave the browser, so the server never sees the secret.
 */

import qrcode from "qrcode-terminal";
import {
  generatePairing,
  pairingUrl,
  type Pairing,
} from "@woodpeckeros/protocol";
import {
  loadPairingFile,
  savePairingFile,
  deletePairingFile,
} from "./storage";

export function loadOrCreatePairing(reset = false): Pairing {
  if (reset) deletePairingFile();
  const existing = loadPairingFile<Pairing>();
  if (existing?.channelId && existing?.key && !reset) return existing;
  const pairing = generatePairing();
  savePairingFile(pairing);
  return pairing;
}

export function printPairing(appUrl: string, pairing: Pairing): void {
  const url = pairingUrl(appUrl, pairing);
  console.log("\nScan this from your iPad or any browser to pair:\n");
  qrcode.generate(url, { small: true }, (qr: string) => console.log(qr));
  console.log(`Or open this link on the device:\n\n  ${url}\n`);
  console.log(
    "Anyone with this link can drive Claude Code on this machine — treat it like a password."
  );
  console.log(
    "Re-pair (and revoke all devices) anytime with: woodpecker connect --reset-pairing\n"
  );
}
