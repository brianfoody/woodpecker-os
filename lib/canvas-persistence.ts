import { TLStore, getSnapshot } from "tldraw";

const STORAGE_KEY = "woodpecker-canvas-data";
const AUTO_SAVE_DELAY = 1000; // 1 second delay for auto-save

/**
 * Validates that a store snapshot is valid before saving
 */
function isValidSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  // Check that it's a non-empty object (basic validation)
  if (Object.keys(snapshot).length === 0) {
    return false;
  }

  return true;
}

/**
 * Saves the canvas data to localStorage
 */
export function saveCanvasData(store: TLStore): void {
  try {
    if (!store) {
      console.warn("⚠️ Cannot save: store is null or undefined");
      return;
    }

    const snapshot = getSnapshot(store);

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

    localStorage.setItem(STORAGE_KEY, serializedData);
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
export function loadCanvasData(): any | null {
  try {
    const serializedData = localStorage.getItem(STORAGE_KEY);
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
export function clearCanvasData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("🗑️ Canvas data cleared from localStorage");
  } catch (error) {
    console.error("❌ Failed to clear canvas data:", error);
  }
}

/**
 * Auto-save functionality with debouncing
 */
export class CanvasAutoSaver {
  private saveTimer: NodeJS.Timeout | null = null;
  private store: TLStore;

  constructor(store: TLStore) {
    this.store = store;
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
      saveCanvasData(this.store);
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
    saveCanvasData(this.store);
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
