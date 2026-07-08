import { TLStore } from "tldraw";
import { MAX_SNAPSHOT_BYTES } from "@woodpeckeros/protocol";
import { peekConnectorClient } from "@/lib/connector-client";

const DEFAULT_STORAGE_KEY = "woodpecker-canvas-data";
const AUTO_SAVE_DELAY = 1000; // 1 second delay for auto-save
const REV_KEY_PREFIX = "woodpecker-canvas-rev-";
// Pushing to the connector ships the full snapshot over the relay, so it is
// throttled much harder than the local save and skipped when nothing changed.
const CONNECTOR_PUSH_MIN_INTERVAL = 4000;
let lastPushedData: string | null = null;
let lastPushAt = 0;
let pushRetryTimer: ReturnType<typeof setTimeout> | null = null;

// ── Canvas revision counter (cross-device last-writer-wins) ──

export function getCanvasRev(storageKey = DEFAULT_STORAGE_KEY): number {
  try {
    return Number(localStorage.getItem(REV_KEY_PREFIX + storageKey)) || 0;
  } catch {
    return 0;
  }
}

export function setCanvasRev(rev: number, storageKey = DEFAULT_STORAGE_KEY): void {
  try {
    localStorage.setItem(REV_KEY_PREFIX + storageKey, String(rev));
  } catch {}
}

/**
 * Validates that a store snapshot is valid before saving
 */
function isValidSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  // Allow empty objects - they represent valid but empty canvas state
  return true;
}

/**
 * Saves the canvas data to localStorage
 */
export function saveCanvasData(store: TLStore, storageKey = DEFAULT_STORAGE_KEY): void {
  try {
    if (!store) {
      console.warn("⚠️ Cannot save: store is null or undefined");
      return;
    }

    const snapshot = store.getSnapshot();

    if (!isValidSnapshot(snapshot)) {
      console.warn("⚠️ Cannot save: invalid snapshot structure");
      return;
    }

    const serializedData = JSON.stringify(snapshot);

    // Check if serialized data is reasonable size (not corrupted)
    if (serializedData.length > 50 * 1024 * 1024) {
      // 50MB limit
      console.warn(
        "⚠️ Canvas data is very large, skipping save to prevent corruption"
      );
      return;
    }

    localStorage.setItem(storageKey, serializedData);
    console.log("💾 Canvas data saved to localStorage");

    // Best-effort push to the paired connector so other devices can pick
    // this canvas up. Oversized snapshots stay localStorage-only.
    try {
      pushToConnector(serializedData, snapshot, storageKey);
    } catch {}
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.error("❌ localStorage quota exceeded, cannot save canvas data");
    } else {
      console.error("❌ Failed to save canvas data:", error);
    }
  }
}

/**
 * Rate-limited, deduplicated push of the snapshot to the connector. At most
 * one push per CONNECTOR_PUSH_MIN_INTERVAL, and only when the snapshot
 * actually changed — an idle canvas sends nothing.
 */
function pushToConnector(
  serializedData: string,
  snapshot: unknown,
  storageKey: string
): void {
  if (serializedData === lastPushedData) return;
  if (serializedData.length > MAX_SNAPSHOT_BYTES) {
    console.warn("⚠️ Canvas snapshot too large to sync — kept local only");
    return;
  }

  const now = Date.now();
  const wait = lastPushAt + CONNECTOR_PUSH_MIN_INTERVAL - now;
  if (wait > 0) {
    // Too soon — re-save from the live store when the window opens.
    if (!pushRetryTimer) {
      pushRetryTimer = setTimeout(() => {
        pushRetryTimer = null;
        retrySave?.();
      }, wait);
    }
    return;
  }

  lastPushAt = now;
  lastPushedData = serializedData;
  const rev = getCanvasRev(storageKey) + 1;
  setCanvasRev(rev, storageKey);
  peekConnectorClient()?.saveCanvas(storageKey, rev, snapshot);
}

let retrySave: (() => void) | null = null;

/**
 * Loads canvas data from localStorage
 */
export function loadCanvasData(storageKey = DEFAULT_STORAGE_KEY): any | null {
  try {
    const serializedData = localStorage.getItem(storageKey);
    if (!serializedData) {
      console.log("📝 No saved canvas data found");
      return null;
    }

    const snapshot = JSON.parse(serializedData);
    console.log("📂 Canvas data loaded from localStorage");
    return snapshot;
  } catch (error) {
    console.error("❌ Failed to load canvas data:", error);
    return null;
  }
}

/**
 * Clears canvas data from localStorage
 */
export function clearCanvasData(storageKey = DEFAULT_STORAGE_KEY): void {
  try {
    localStorage.removeItem(storageKey);
    console.log("🗑️ Canvas data cleared from localStorage");
  } catch (error) {
    console.error("❌ Failed to clear canvas data:", error);
  }
}

/**
 * Auto-save functionality with debouncing
 */
const REPLAY_WATERMARKS_KEY = "woodpecker-replay-watermarks";

export function getReplayWatermark(sessionId: string): number {
  try {
    const raw = localStorage.getItem(REPLAY_WATERMARKS_KEY);
    if (!raw) return 0;
    const watermarks = JSON.parse(raw);
    return watermarks[sessionId] ?? 0;
  } catch {
    return 0;
  }
}

export function setReplayWatermark(sessionId: string, count: number): void {
  try {
    const raw = localStorage.getItem(REPLAY_WATERMARKS_KEY);
    const watermarks = raw ? JSON.parse(raw) : {};
    watermarks[sessionId] = count;
    localStorage.setItem(REPLAY_WATERMARKS_KEY, JSON.stringify(watermarks));
  } catch (error) {
    console.error("Failed to save replay watermark:", error);
  }
}

// ── Viewport position persistence ──

const VIEWPORT_KEY_PREFIX = "woodpecker-viewport-";

export function saveViewport(
  camera: { x: number; y: number; z: number },
  storageKey = DEFAULT_STORAGE_KEY
): void {
  try {
    localStorage.setItem(
      VIEWPORT_KEY_PREFIX + storageKey,
      JSON.stringify(camera)
    );
  } catch {}
}

export function loadViewport(
  storageKey = DEFAULT_STORAGE_KEY
): { x: number; y: number; z: number } | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY_PREFIX + storageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class CanvasAutoSaver {
  private saveTimer: NodeJS.Timeout | null = null;
  private store: TLStore;
  private storageKey: string;

  constructor(store: TLStore, storageKey = DEFAULT_STORAGE_KEY) {
    this.store = store;
    this.storageKey = storageKey;
    retrySave = () => saveCanvasData(this.store, this.storageKey);
  }

  /**
   * Schedule an auto-save with debouncing
   */
  scheduleAutoSave(): void {
    // Clear existing timer
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    // Schedule new save
    this.saveTimer = setTimeout(() => {
      saveCanvasData(this.store, this.storageKey);
      this.saveTimer = null;
    }, AUTO_SAVE_DELAY);
  }

  /**
   * Force immediate save
   */
  forceSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    saveCanvasData(this.store, this.storageKey);
  }

  /**
   * Cleanup timers
   */
  cleanup(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}
