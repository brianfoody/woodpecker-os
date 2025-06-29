import { 
  saveCanvasData, 
  loadCanvasData, 
  clearCanvasData, 
  CanvasAutoSaver 
} from "../canvas-persistence";

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock TLStore
const mockStore = {
  getSnapshot: jest.fn(),
  listen: jest.fn(),
};

describe("Canvas Persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("saveCanvasData", () => {
    it("should save canvas data to localStorage", () => {
      const mockSnapshot = { shapes: [], pages: [] };
      mockStore.getSnapshot.mockReturnValue(mockSnapshot);

      saveCanvasData(mockStore as any);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "woodpecker-canvas-data",
        JSON.stringify(mockSnapshot)
      );
    });

    it("should handle save errors gracefully", () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockStore.getSnapshot.mockImplementation(() => {
        throw new Error("Save error");
      });

      expect(() => saveCanvasData(mockStore as any)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith("❌ Failed to save canvas data:", expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe("loadCanvasData", () => {
    it("should load canvas data from localStorage", () => {
      const mockData = { shapes: [], pages: [] };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));

      const result = loadCanvasData();

      expect(localStorageMock.getItem).toHaveBeenCalledWith("woodpecker-canvas-data");
      expect(result).toEqual(mockData);
    });

    it("should return null when no data exists", () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = loadCanvasData();

      expect(result).toBeNull();
    });

    it("should handle corrupted data gracefully", () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      localStorageMock.getItem.mockReturnValue("corrupted json");

      const result = loadCanvasData();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith("❌ Failed to load canvas data:", expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe("clearCanvasData", () => {
    it("should clear canvas data from localStorage", () => {
      clearCanvasData();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("woodpecker-canvas-data");
    });

    it("should handle clear errors gracefully", () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error("Clear error");
      });

      expect(() => clearCanvasData()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith("❌ Failed to clear canvas data:", expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe("CanvasAutoSaver", () => {
    let autoSaver: CanvasAutoSaver;

    beforeEach(() => {
      autoSaver = new CanvasAutoSaver(mockStore as any);
    });

    afterEach(() => {
      autoSaver.cleanup();
    });

    it("should schedule auto-save with debouncing", () => {
      const mockSnapshot = { shapes: [], pages: [] };
      mockStore.getSnapshot.mockReturnValue(mockSnapshot);

      // Schedule save
      autoSaver.scheduleAutoSave();

      // Should not save immediately
      expect(localStorageMock.setItem).not.toHaveBeenCalled();

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      // Should save after delay
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "woodpecker-canvas-data",
        JSON.stringify(mockSnapshot)
      );
    });

    it("should debounce multiple schedule calls", () => {
      const mockSnapshot = { shapes: [], pages: [] };
      mockStore.getSnapshot.mockReturnValue(mockSnapshot);

      // Schedule multiple saves quickly
      autoSaver.scheduleAutoSave();
      autoSaver.scheduleAutoSave();
      autoSaver.scheduleAutoSave();

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      // Should only save once
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    });

    it("should force immediate save", () => {
      const mockSnapshot = { shapes: [], pages: [] };
      mockStore.getSnapshot.mockReturnValue(mockSnapshot);

      // Force save
      autoSaver.forceSave();

      // Should save immediately
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "woodpecker-canvas-data",
        JSON.stringify(mockSnapshot)
      );
    });

    it("should cancel scheduled save when forcing save", () => {
      const mockSnapshot = { shapes: [], pages: [] };
      mockStore.getSnapshot.mockReturnValue(mockSnapshot);

      // Schedule save
      autoSaver.scheduleAutoSave();

      // Force save before timer completes
      autoSaver.forceSave();

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      // Should only have saved once (from force save)
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    });

    it("should cleanup timers", () => {
      autoSaver.scheduleAutoSave();
      autoSaver.cleanup();

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      // Should not save after cleanup
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });
});