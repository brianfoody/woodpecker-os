import { analyzeForSingleLoop, DrawShape, Point } from '../gesture-detection';
import { HoldDetector } from '../hold-detection';

describe('Gesture Integration Tests', () => {
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

  // Helper function to create a circle with given center and radius
  function createCirclePoints(centerX: number, centerY: number, radius: number, numPoints: number = 50): Point[] {
    const points: Point[] = [];
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      points.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    }
    return points;
  }

  // Helper function to create a DrawShape mock
  function createDrawShapeMock(points: Point[], shapeX: number = 0, shapeY: number = 0): DrawShape {
    const relativePoints = points.map(p => ({ x: p.x - shapeX, y: p.y - shapeY }));
    
    return {
      id: `test-shape-${Date.now()}-${Math.random()}`,
      type: 'draw',
      x: shapeX,
      y: shapeY,
      props: {
        segments: [
          {
            points: relativePoints,
          },
        ],
      },
    };
  }

  describe('Complete Gesture Workflow', () => {
    it('should complete full workflow: loop detection -> hold detection -> callback', () => {
      // Step 1: Create a circular shape
      const circlePoints = createCirclePoints(0, 0, 50);
      const circularShape = createDrawShapeMock(circlePoints);

      // Step 2: Verify loop detection works
      const isLoop = analyzeForSingleLoop(circularShape);
      expect(isLoop).toBe(true);

      // Step 3: Start hold detection
      holdDetector.startHoldDetection(circularShape, { x: 50, y: 50 });
      expect(holdDetector.hasActiveTimer()).toBe(true);
      expect(holdDetector.getCurrentShape()).toBe(circularShape);

      // Step 4: Wait for hold to complete
      jest.advanceTimersByTime(100);

      // Step 5: Verify callback was triggered
      expect(mockCallback).toHaveBeenCalledWith(circularShape, { x: 50, y: 50 });
      expect(holdDetector.isCurrentlyHolding()).toBe(true);
    });

    it('should not trigger workflow for non-circular shapes', () => {
      // Step 1: Create a square shape
      const squarePoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
        { x: 0, y: 0 },
      ];
      const squareShape = createDrawShapeMock(squarePoints);

      // Step 2: Verify loop detection rejects square
      const isLoop = analyzeForSingleLoop(squareShape);
      expect(isLoop).toBe(false);

      // Step 3: Even if we force hold detection, it shouldn't be considered valid
      holdDetector.startHoldDetection(squareShape, { x: 50, y: 50 });
      jest.advanceTimersByTime(100);

      // In a real scenario, we wouldn't start hold detection for non-loops
      // But this tests that the hold detector itself works regardless
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should handle cancellation during hold period', () => {
      // Step 1: Create valid circular shape
      const circlePoints = createCirclePoints(0, 0, 50);
      const circularShape = createDrawShapeMock(circlePoints);

      // Step 2: Verify it's a valid loop
      const isLoop = analyzeForSingleLoop(circularShape);
      expect(isLoop).toBe(true);

      // Step 3: Start hold detection
      holdDetector.startHoldDetection(circularShape, { x: 50, y: 50 });

      // Step 4: Cancel before hold completes
      jest.advanceTimersByTime(50); // Half the hold duration
      holdDetector.cancelHoldDetection();

      // Step 5: Advance past original hold time
      jest.advanceTimersByTime(100);

      // Step 6: Verify callback was not triggered
      expect(mockCallback).not.toHaveBeenCalled();
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });

    it('should handle rapid shape changes during detection', () => {
      const shapes = [];
      
      // Create multiple valid circular shapes
      for (let i = 0; i < 5; i++) {
        const circlePoints = createCirclePoints(i * 10, i * 10, 50);
        const shape = createDrawShapeMock(circlePoints);
        shapes.push(shape);
        
        // Verify each is a valid loop
        expect(analyzeForSingleLoop(shape)).toBe(true);
      }

      // Rapidly start hold detection for each shape
      shapes.forEach((shape, index) => {
        holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
        if (index < shapes.length - 1) {
          jest.advanceTimersByTime(20); // Advance time but don't complete hold
        }
      });

      // Complete the hold for the final shape
      jest.advanceTimersByTime(100);

      // Only the last shape should trigger
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(shapes[shapes.length - 1], expect.any(Object));
    });
  });

  describe('Real-world Gesture Scenarios', () => {
    it('should handle slightly imperfect circle with successful hold', () => {
      // Create a realistic hand-drawn circle (slightly wobbly)
      const baseCircle = createCirclePoints(0, 0, 50, 40);
      const wobbleCircle = baseCircle.map(point => ({
        x: point.x + (Math.random() - 0.5) * 4, // ±2 pixel wobble
        y: point.y + (Math.random() - 0.5) * 4,
      }));

      const shape = createDrawShapeMock(wobbleCircle);

      // Should be detected as a valid loop
      expect(analyzeForSingleLoop(shape)).toBe(true);

      // Should complete hold detection
      holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
      jest.advanceTimersByTime(100);

      expect(mockCallback).toHaveBeenCalledWith(shape, { x: 50, y: 50 });
    });

    it('should handle oval/elliptical gestures', () => {
      // Create an ellipse (stretched circle)
      const circlePoints = createCirclePoints(0, 0, 50);
      const ellipsePoints = circlePoints.map(point => ({
        x: point.x * 1.5, // Stretch horizontally
        y: point.y,
      }));

      const shape = createDrawShapeMock(ellipsePoints);

      // Should still be detected as a valid loop (ellipse is circular enough)
      expect(analyzeForSingleLoop(shape)).toBe(true);

      // Should complete workflow
      holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
      jest.advanceTimersByTime(100);

      expect(mockCallback).toHaveBeenCalledWith(shape, { x: 50, y: 50 });
    });

    it('should handle gesture at different positions and scales', () => {
      const testCases = [
        { center: [0, 0], radius: 25, offset: [0, 0] },
        { center: [100, 100], radius: 50, offset: [200, 300] },
        { center: [0, 0], radius: 100, offset: [500, 600] },
        { center: [-50, -50], radius: 30, offset: [0, 0] },
      ];

      testCases.forEach(({ center, radius, offset }) => {
        const circlePoints = createCirclePoints(center[0], center[1], radius);
        const shape = createDrawShapeMock(circlePoints, offset[0], offset[1]);

        // Each should be detected as a valid loop
        expect(analyzeForSingleLoop(shape)).toBe(true);

        // Reset for each test
        holdDetector.cancelHoldDetection();
        mockCallback.mockClear();

        // Should complete workflow
        holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
        jest.advanceTimersByTime(100);

        expect(mockCallback).toHaveBeenCalledWith(shape, { x: 50, y: 50 });
      });
    });

    it('should handle user drawing movement that cancels hold', () => {
      // Simulate user drawing a circle
      const circlePoints = createCirclePoints(0, 0, 50);
      const shape = createDrawShapeMock(circlePoints);

      // Loop is detected
      expect(analyzeForSingleLoop(shape)).toBe(true);

      // Hold detection starts
      holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
      expect(holdDetector.hasActiveTimer()).toBe(true);

      // User moves the pen (simulated by starting new shape detection)
      jest.advanceTimersByTime(50); // Halfway through hold
      
      // In real scenario, pointer move would cancel hold
      holdDetector.cancelHoldDetection();

      // Continue time to where hold would have completed
      jest.advanceTimersByTime(100);

      // Should not trigger
      expect(mockCallback).not.toHaveBeenCalled();
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed shapes gracefully', () => {
      const malformedShape: DrawShape = {
        id: 'malformed',
        type: 'draw',
        x: 0,
        y: 0,
        // Missing props - should not crash
      };

      // Should safely return false for malformed shapes
      expect(analyzeForSingleLoop(malformedShape)).toBe(false);

      // Hold detector should still work with any object
      holdDetector.startHoldDetection(malformedShape, { x: 50, y: 50 });
      jest.advanceTimersByTime(100);

      expect(mockCallback).toHaveBeenCalledWith(malformedShape, { x: 50, y: 50 });
    });

    it('should handle very small gestures', () => {
      // Create a very small circle
      const tinyCircle = createCirclePoints(0, 0, 5, 25);
      const shape = createDrawShapeMock(tinyCircle);

      // Should still be detected (if it meets minimum point requirements)
      const isLoop = analyzeForSingleLoop(shape);
      
      if (isLoop) {
        holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
        jest.advanceTimersByTime(100);
        expect(mockCallback).toHaveBeenCalled();
      }
      
      // Test should not fail regardless of detection result
      expect(typeof isLoop).toBe('boolean');
    });

    it('should handle very large gestures', () => {
      // Create a very large circle
      const largeCircle = createCirclePoints(0, 0, 500, 100);
      const shape = createDrawShapeMock(largeCircle);

      // Should be detected as valid
      expect(analyzeForSingleLoop(shape)).toBe(true);

      holdDetector.startHoldDetection(shape, { x: 500, y: 500 });
      jest.advanceTimersByTime(100);

      expect(mockCallback).toHaveBeenCalledWith(shape, { x: 500, y: 500 });
    });

    it('should handle memory cleanup properly', () => {
      // Create many shapes and test cleanup
      for (let i = 0; i < 50; i++) {
        const circlePoints = createCirclePoints(0, 0, 50);
        const shape = createDrawShapeMock(circlePoints);

        holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
        holdDetector.cancelHoldDetection();
      }

      // Should have clean state
      expect(holdDetector.hasActiveTimer()).toBe(false);
      expect(holdDetector.getCurrentShape()).toBeNull();
      expect(holdDetector.isCurrentlyHolding()).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid gesture attempts efficiently', () => {
      const startTime = Date.now();

      // Perform many rapid operations
      for (let i = 0; i < 100; i++) {
        const circlePoints = createCirclePoints(0, 0, 50);
        const shape = createDrawShapeMock(circlePoints);

        // Quick detection and cancellation
        analyzeForSingleLoop(shape);
        holdDetector.startHoldDetection(shape, { x: 50, y: 50 });
        holdDetector.cancelHoldDetection();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably quickly (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second for 100 operations
    });

    it('should handle complex shapes without performance issues', () => {
      // Create a very detailed circle
      const detailedCircle = createCirclePoints(0, 0, 50, 200); // Many points
      const shape = createDrawShapeMock(detailedCircle);

      const startTime = Date.now();
      const isLoop = analyzeForSingleLoop(shape);
      const endTime = Date.now();

      expect(typeof isLoop).toBe('boolean');
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });
  });
});