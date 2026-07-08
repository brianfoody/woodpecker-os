/**
 * All durable connector state lives in ~/.woodpecker/ — pairing keys,
 * config, known devices, and canvas snapshots. No cloud storage anywhere.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";

export const WOODPECKER_HOME = join(homedir(), ".woodpecker");
const CANVAS_DIR = join(WOODPECKER_HOME, "canvas");

export type ConnectorConfig = {
  workingDir?: string;
  relayUrl?: string;
  appUrl?: string;
};

export type DeviceRecord = {
  name?: string;
  firstSeen: string;
  lastSeen: string;
};

function ensureHome(): void {
  mkdirSync(CANVAS_DIR, { recursive: true });
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  ensureHome();
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}

// --- config ---------------------------------------------------------------

const CONFIG_PATH = join(WOODPECKER_HOME, "config.json");

export function loadConfig(): ConnectorConfig {
  return readJson<ConnectorConfig>(CONFIG_PATH) ?? {};
}

export function saveConfig(config: ConnectorConfig): void {
  writeJson(CONFIG_PATH, config);
}

// --- pairing ----------------------------------------------------------------

const PAIRING_PATH = join(WOODPECKER_HOME, "pairing.json");

export function loadPairingFile<T>(): T | null {
  return readJson<T>(PAIRING_PATH);
}

export function savePairingFile(pairing: unknown): void {
  writeJson(PAIRING_PATH, pairing);
}

export function deletePairingFile(): void {
  rmSync(PAIRING_PATH, { force: true });
}

// --- devices ----------------------------------------------------------------

const DEVICES_PATH = join(WOODPECKER_HOME, "devices.json");

export function recordDevice(deviceId: string, name?: string): void {
  const devices = readJson<Record<string, DeviceRecord>>(DEVICES_PATH) ?? {};
  const now = new Date().toISOString();
  const existing = devices[deviceId];
  devices[deviceId] = {
    name: name ?? existing?.name,
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
  };
  writeJson(DEVICES_PATH, devices);
}

// --- canvas snapshots -------------------------------------------------------

type CanvasFile = { rev: number; snapshot: unknown };

function canvasPath(canvasKey: string): string {
  const safe = canvasKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(CANVAS_DIR, `${safe}.json`);
}

export function saveCanvasSnapshot(
  canvasKey: string,
  rev: number,
  snapshot: unknown
): void {
  const existing = readJson<CanvasFile>(canvasPath(canvasKey));
  if (existing && existing.rev >= rev) return; // never regress
  writeJson(canvasPath(canvasKey), { rev, snapshot });
}

export function loadCanvasSnapshot(canvasKey: string): CanvasFile | null {
  return readJson<CanvasFile>(canvasPath(canvasKey));
}
