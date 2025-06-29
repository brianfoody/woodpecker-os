import { HOLD_DURATION, HoldDetector } from "../hold-detection";

// Mock shape object for testing
const createMockShape = (id: string = "test-shape") => ({
  id,
  type: "draw",
  x: 100,
  y: 100,
  props: {
    segments: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
      },
    ],
  },
});

describe("HoldDetector", () => {
  let holdDetector: HoldDetector;
  let mockCallback: jest.Mock;

  beforeEach(() => {
    holdDetector = new HoldDetector(100); // Short duration for testing
    mockCallback = jest.fn();
    holdDetector.setHoldCallback(mockCallback);
    jest.useFakeTimers();
  });

  afterEach(() => {
    holdDetector.cancelHoldDetection();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should initialize with default hold duration", () => {
      const detector = new HoldDetector();
      const state = detector.getState();
      expect(state.holdDuration).toBe(HOLD_DURATION);
      expect(state.holdTimer).toBeNull();
      expect(state.currentDrawShape).toBeNull();
      expect(state.isHolding).toBe(false);
    });

    it("should initialize with custom hold duration", () => {
      const detector = new HoldDetector(1500);
      const state = detector.getState();
      expect(state.holdDuration).toBe(1500);
    });
  });

  describe("setHoldCallback", () => {
    it("should set the callback function", () => {
      const newCallback = jest.fn();
      holdDetector.setHoldCallback(newCallback);

      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      holdDetector.forceHoldTrigger();

      expect(newCallback).toHaveBeenCalledWith(mockShape, { x: 50, y: 50 });
    });
  });

  describe("startHoldDetection", () => {
    it("should start hold detection with a timer", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      const state = holdDetector.getState();
      expect(state.currentDrawShape).toBe(mockShape);
      expect(state.isHolding).toBe(false);
      expect(holdDetector.hasActiveTimer()).toBe(true);
    });

    it("should cancel previous timer when starting new detection", () => {
      const mockShape1 = createMockShape("shape1");
      const mockShape2 = createMockShape("shape2");

      holdDetector.startHoldDetection(mockShape1);
      const firstTimer = holdDetector.getState().holdTimer;

      holdDetector.startHoldDetection(mockShape2);
      const secondTimer = holdDetector.getState().holdTimer;

      expect(firstTimer).not.toBe(secondTimer);
      expect(holdDetector.getCurrentShape()).toBe(mockShape2);
    });

    it("should trigger callback after hold duration", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      // Fast-forward time
      jest.advanceTimersByTime(100);

      expect(mockCallback).toHaveBeenCalledWith(mockShape, { x: 50, y: 50 });
      expect(holdDetector.isCurrentlyHolding()).toBe(true);
    });

    it("should not trigger callback if shape changes", () => {
      const mockShape1 = createMockShape("shape1");
      const mockShape2 = createMockShape("shape2");

      holdDetector.startHoldDetection(mockShape1, { x: 50, y: 50 });
      holdDetector.startHoldDetection(mockShape2, { x: 60, y: 60 });

      // Fast-forward time
      jest.advanceTimersByTime(100);

      // Should trigger for shape2, not shape1
      expect(mockCallback).toHaveBeenCalledWith(mockShape2, { x: 60, y: 60 });
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancelHoldDetection", () => {
    it("should cancel active timer and reset state", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      expect(holdDetector.hasActiveTimer()).toBe(true);
      expect(holdDetector.getCurrentShape()).toBe(mockShape);

      holdDetector.cancelHoldDetection();

      expect(holdDetector.hasActiveTimer()).toBe(false);
      expect(holdDetector.getCurrentShape()).toBeNull();
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });

    it("should prevent callback from firing after cancellation", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      holdDetector.cancelHoldDetection();

      // Fast-forward time
      jest.advanceTimersByTime(200);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    it("should handle multiple cancellations gracefully", () => {
      holdDetector.cancelHoldDetection();
      holdDetector.cancelHoldDetection();

      // Should not throw or cause issues
      expect(holdDetector.hasActiveTimer()).toBe(false);
    });
  });

  describe("isCurrentlyHolding", () => {
    it("should return false initially", () => {
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });

    it("should return true after hold is triggered", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      jest.advanceTimersByTime(100);

      expect(holdDetector.isCurrentlyHolding()).toBe(true);
    });

    it("should return false after cancellation", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      jest.advanceTimersByTime(100);
      expect(holdDetector.isCurrentlyHolding()).toBe(true);

      holdDetector.cancelHoldDetection();
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });
  });

  describe("getCurrentShape", () => {
    it("should return null initially", () => {
      expect(holdDetector.getCurrentShape()).toBeNull();
    });

    it("should return current shape during detection", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      expect(holdDetector.getCurrentShape()).toBe(mockShape);
    });

    it("should return null after cancellation", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      holdDetector.cancelHoldDetection();

      expect(holdDetector.getCurrentShape()).toBeNull();
    });
  });

  describe("hasActiveTimer", () => {
    it("should return false initially", () => {
      expect(holdDetector.hasActiveTimer()).toBe(false);
    });

    it("should return true when timer is active", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      expect(holdDetector.hasActiveTimer()).toBe(true);
    });

    it("should return false after timer completes", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      jest.advanceTimersByTime(100);

      // Timer should have completed and been cleared
      expect(holdDetector.hasActiveTimer()).toBe(false);
    });

    it("should return false after cancellation", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      holdDetector.cancelHoldDetection();

      expect(holdDetector.hasActiveTimer()).toBe(false);
    });
  });

  describe("forceHoldTrigger", () => {
    it("should trigger hold without waiting for timer", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      holdDetector.forceHoldTrigger();

      expect(mockCallback).toHaveBeenCalledWith(mockShape, { x: 50, y: 50 });
      expect(holdDetector.isCurrentlyHolding()).toBe(true);
    });

    it("should not trigger if no current shape", () => {
      holdDetector.forceHoldTrigger();

      expect(mockCallback).not.toHaveBeenCalled();
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });

    it("should set holding state even if no callback set", () => {
      const detectorWithoutCallback = new HoldDetector(100);
      const mockShape = createMockShape();

      detectorWithoutCallback.startHoldDetection(mockShape, { x: 50, y: 50 });
      detectorWithoutCallback.forceHoldTrigger();

      // Should not throw, and holding state should be true
      expect(detectorWithoutCallback.isCurrentlyHolding()).toBe(true);
    });
  });

  describe("Movement Tracking", () => {
    it("should not trigger hold when movement exceeds threshold", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 100, y: 100 });

      // Move beyond threshold immediately (default is 10px)
      holdDetector.updatePosition({ x: 120, y: 120 }); // ~28px movement
      
      // Fast-forward less than the hold duration
      jest.advanceTimersByTime(50);

      // Should not trigger yet because timer was reset
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
      
      // Now move again to reset timer again
      holdDetector.updatePosition({ x: 140, y: 140 }); // another large movement
      
      // Fast-forward the rest of the time
      jest.advanceTimersByTime(50);

      // Should still not trigger because of continuous movement
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });

    it("should reset timer when movement exceeds threshold", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 100, y: 100 });

      // Move slightly (within threshold)
      holdDetector.updatePosition({ x: 105, y: 105 }); // ~7px movement
      
      // Fast-forward half the time
      jest.advanceTimersByTime(50);

      // Move beyond threshold
      holdDetector.updatePosition({ x: 120, y: 120 }); // ~21px from last position

      // Fast-forward original remaining time (shouldn't trigger)
      jest.advanceTimersByTime(50);
      expect(mockCallback).not.toHaveBeenCalled();

      // Fast-forward full duration again (should trigger now)
      jest.advanceTimersByTime(100);
      expect(mockCallback).toHaveBeenCalledWith(mockShape, { x: 120, y: 120 });
    });

    it("should trigger hold when movement stays within threshold", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 100, y: 100 });

      // Make small movements within threshold
      holdDetector.updatePosition({ x: 105, y: 105 }); // ~7px
      holdDetector.updatePosition({ x: 103, y: 107 }); // ~4px from last
      holdDetector.updatePosition({ x: 101, y: 104 }); // ~3px from last

      // Fast-forward time
      jest.advanceTimersByTime(100);

      // Should trigger because all movements were small
      expect(mockCallback).toHaveBeenCalledWith(mockShape, { x: 100, y: 100 });
      expect(holdDetector.isCurrentlyHolding()).toBe(true);
    });

    it("should handle updatePosition when no hold detection is active", () => {
      // Should not throw or cause issues
      expect(() => holdDetector.updatePosition({ x: 100, y: 100 })).not.toThrow();
    });

    it("should ignore position updates when already holding", () => {
      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 100, y: 100 });

      // Trigger hold
      jest.advanceTimersByTime(100);
      expect(holdDetector.isCurrentlyHolding()).toBe(true);

      // Large movement after hold triggered should be ignored
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      holdDetector.updatePosition({ x: 200, y: 200 });

      // Should not log movement reset message
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Movement detected')
      );

      consoleSpy.mockRestore();
    });

    it("should work with custom movement threshold", () => {
      const customHoldDetector = new HoldDetector(100, 20); // 20px threshold
      const customCallback = jest.fn();
      customHoldDetector.setHoldCallback(customCallback);

      const mockShape = createMockShape();
      customHoldDetector.startHoldDetection(mockShape, { x: 100, y: 100 });

      // Move 15px (within 20px threshold)
      customHoldDetector.updatePosition({ x: 115, y: 100 });

      jest.advanceTimersByTime(100);

      // Should trigger because movement was within threshold
      expect(customCallback).toHaveBeenCalledWith(mockShape, { x: 100, y: 100 });

      customHoldDetector.cleanup();
    });
  });

  describe("Edge Cases and Real-world Scenarios", () => {
    it("should handle rapid start/cancel cycles", () => {
      const mockShape = createMockShape();

      for (let i = 0; i < 10; i++) {
        holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
        holdDetector.cancelHoldDetection();
      }

      expect(holdDetector.hasActiveTimer()).toBe(false);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it("should handle multiple shapes in quick succession", () => {
      const shapes = [
        createMockShape("shape1"),
        createMockShape("shape2"),
        createMockShape("shape3"),
      ];

      shapes.forEach((shape) => {
        holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
        jest.advanceTimersByTime(50); // Half the hold duration
      });

      // Only the last shape should trigger
      jest.advanceTimersByTime(100);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(shapes[2], { x: 50, y: 50 });
    });

    it("should work with different hold durations", () => {
      const shortHoldDetector = new HoldDetector(50);
      const longHoldDetector = new HoldDetector(200);

      const shortCallback = jest.fn();
      const longCallback = jest.fn();

      shortHoldDetector.setHoldCallback(shortCallback);
      longHoldDetector.setHoldCallback(longCallback);

      const mockShape = createMockShape();

      shortHoldDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      longHoldDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      // After 50ms, only short detector should trigger
      jest.advanceTimersByTime(50);
      expect(shortCallback).toHaveBeenCalled();
      expect(longCallback).not.toHaveBeenCalled();

      // After 200ms total, long detector should also trigger
      jest.advanceTimersByTime(150);
      expect(longCallback).toHaveBeenCalled();
    });

    it("should handle callback that throws errors", () => {
      const errorCallback = jest.fn(() => {
        throw new Error("Callback error");
      });

      holdDetector.setHoldCallback(errorCallback);

      const mockShape = createMockShape();
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      // Should not prevent the hold state from being set
      // The error is caught and logged, so no exception should be thrown
      jest.advanceTimersByTime(100);

      expect(holdDetector.isCurrentlyHolding()).toBe(true);
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe("Performance and Memory", () => {
    it("should clean up timers to prevent memory leaks", () => {
      const shapes = Array.from({ length: 100 }, (_, i) =>
        createMockShape(`shape${i}`)
      );

      shapes.forEach((shape) => {
        holdDetector.startHoldDetection(shape);
        holdDetector.cancelHoldDetection();
      });

      // After all operations, should have no active timer
      expect(holdDetector.hasActiveTimer()).toBe(false);
      expect(holdDetector.getCurrentShape()).toBeNull();
    });

    it("should handle concurrent hold detection attempts", () => {
      const mockShape = createMockShape();

      // Simulate concurrent calls (though in practice this shouldn't happen)
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });
      holdDetector.startHoldDetection(mockShape, { x: 50, y: 50 });

      // Should only have one active timer
      expect(holdDetector.hasActiveTimer()).toBe(true);
      expect(holdDetector.getCurrentShape()).toBe(mockShape);

      jest.advanceTimersByTime(100);

      // Should only trigger once
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });
});
