import { TLStore } from "tldraw";

const DEFAULT_STORAGE_KEY = "woodpecker-canvas-data";
const AUTO_SAVE_DELAY = 1000; // 1 second delay for auto-save

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
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.error("❌ localStorage quota exceeded, cannot save canvas data");
    } else {
      console.error("❌ Failed to save canvas data:", error);
    }
  }
}

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

export class CanvasAutoSaver {
  private saveTimer: NodeJS.Timeout | null = null;
  private store: TLStore;
  private storageKey: string;

  constructor(store: TLStore, storageKey = DEFAULT_STORAGE_KEY) {
    this.store = store;
    this.storageKey = storageKey;
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
