/**
 * End-to-end encryption between canvas and connector.
 *
 * AES-256-GCM via WebCrypto — the same API exists in browsers and in
 * Node >= 20 (`globalThis.crypto`), so this file runs unmodified on both
 * sides and needs zero dependencies.
 *
 * Wire format for an encrypted message: `b64url(iv) + "." + b64url(ciphertext)`.
 * AAD binds each message to the channel and the sender's role, so a frame
 * captured from one direction can't be replayed in the other.
 */

import type { AppMessage, Envelope, Role } from "./types";

export type Pairing = {
  channelId: string;
  /** base64url-encoded 32-byte AES key */
  key: string;
};

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error("WebCrypto unavailable — Node >= 20 or a modern browser is required");
  }
  return c.subtle;
}

export function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function randomB64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return toB64Url(bytes);
}

/** 128-bit channel id + 256-bit AES key. */
export function generatePairing(): Pairing {
  return { channelId: randomB64Url(16), key: randomB64Url(32) };
}

export async function importChannelKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromB64Url(keyB64);
  if (raw.length !== 32) throw new Error("channel key must be 32 bytes");
  return subtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function aad(channelId: string, senderRole: Role): Uint8Array {
  return new TextEncoder().encode(`${channelId}|${senderRole}`);
}

export async function sealEnvelope(
  key: CryptoKey,
  channelId: string,
  senderRole: Role,
  envelope: Envelope
): Promise<string> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad(channelId, senderRole) as BufferSource },
    key,
    plaintext as BufferSource
  );
  return `${toB64Url(iv)}.${toB64Url(new Uint8Array(ct))}`;
}

/** Throws on tampered/undecryptable input. `senderRole` is the OTHER side's role. */
export async function openEnvelope(
  key: CryptoKey,
  channelId: string,
  senderRole: Role,
  wire: string
): Promise<Envelope> {
  const dot = wire.indexOf(".");
  if (dot <= 0) throw new Error("malformed encrypted frame");
  const iv = fromB64Url(wire.slice(0, dot));
  const ct = fromB64Url(wire.slice(dot + 1));
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad(channelId, senderRole) as BufferSource },
    key,
    ct as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(pt)) as Envelope;
}

/**
 * Tracks per-sender monotonic sequence numbers to drop duplicated or
 * replayed envelopes. Epoch is random per sender process, so a page reload
 * or connector restart resets cleanly instead of deadlocking the counter.
 */
export class ReplayGuard {
  private last = new Map<string, { epoch: string; seq: number }>();

  /** Returns true if the envelope is fresh and should be processed. */
  accept(env: Envelope): boolean {
    const prev = this.last.get(env.from);
    if (prev && prev.epoch === env.epoch && env.seq <= prev.seq) return false;
    this.last.set(env.from, { epoch: env.epoch, seq: env.seq });
    return true;
  }
}

/** Builds sequential envelopes for one sender. */
export class EnvelopeBuilder {
  private seq = 0;
  private readonly epoch = randomB64Url(8);
  constructor(private readonly from: string) {}

  next(msg: AppMessage): Envelope {
    this.seq += 1;
    return { v: 1, from: this.from, epoch: this.epoch, seq: this.seq, msg };
  }
}

// ---------------------------------------------------------------------------
// Pairing URL helpers — the secret travels in the URL FRAGMENT, which
// browsers never send to the server.
// ---------------------------------------------------------------------------

export function pairingUrl(appBaseUrl: string, pairing: Pairing): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/pair#${pairing.channelId}.${pairing.key}`;
}

export function parsePairingHash(hash: string): Pairing | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const channelId = raw.slice(0, dot);
  const key = raw.slice(dot + 1);
  try {
    if (fromB64Url(channelId).length !== 16) return null;
    if (fromB64Url(key).length !== 32) return null;
  } catch {
    return null;
  }
  return { channelId, key };
}
