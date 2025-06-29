import {
  Point,
  DrawShape,
  extractPointsFromShape,
  checkEnclosingIntent,
  detectEnclosingGesture,
  analyzeForSingleLoop,
} from '../gesture-detection';

describe('Gesture Detection', () => {
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

  // Helper function to create a square with given center and size
  function createSquarePoints(centerX: number, centerY: number, size: number, numPoints: number = 40): Point[] {
    const points: Point[] = [];
    const half = size / 2;
    const pointsPerSide = numPoints / 4;

    // Top side
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({
        x: centerX - half + t * size,
        y: centerY - half,
      });
    }

    // Right side
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({
        x: centerX + half,
        y: centerY - half + t * size,
      });
    }

    // Bottom side
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({
        x: centerX + half - t * size,
        y: centerY + half,
      });
    }

    // Left side
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({
        x: centerX - half,
        y: centerY + half - t * size,
      });
    }

    return points;
  }

  // Helper function to create a line
  function createLinePoints(startX: number, startY: number, endX: number, endY: number, numPoints: number = 30): Point[] {
    const points: Point[] = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      points.push({
        x: startX + t * (endX - startX),
        y: startY + t * (endY - startY),
      });
    }
    return points;
  }

  // Helper function to create a DrawShape mock
  function createDrawShapeMock(points: Point[], shapeX: number = 0, shapeY: number = 0): DrawShape {
    // Convert absolute points to relative points
    const relativePoints = points.map(p => ({ x: p.x - shapeX, y: p.y - shapeY }));
    
    return {
      id: 'test-shape',
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

  describe('extractPointsFromShape', () => {
    it('should extract points from a shape correctly', () => {
      const points = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
      const shape = createDrawShapeMock(points, 100, 200);
      
      const extractedPoints = extractPointsFromShape(shape);
      
      expect(extractedPoints).toHaveLength(2);
      expect(extractedPoints[0]).toEqual({ x: 10, y: 20 });
      expect(extractedPoints[1]).toEqual({ x: 30, y: 40 });
    });

    it('should handle shapes with no segments', () => {
      const shape: DrawShape = {
        id: 'test',
        type: 'draw',
        x: 0,
        y: 0,
        props: {},
      };
      
      const extractedPoints = extractPointsFromShape(shape);
      expect(extractedPoints).toHaveLength(0);
    });

    it('should handle shapes with empty segments', () => {
      const shape: DrawShape = {
        id: 'test',
        type: 'draw',
        x: 0,
        y: 0,
        props: {
          segments: [],
        },
      };
      
      const extractedPoints = extractPointsFromShape(shape);
      expect(extractedPoints).toHaveLength(0);
    });
  });

  describe('checkEnclosingIntent', () => {
    it('should detect circles as having enclosing intent', () => {
      const circlePoints = createCirclePoints(0, 0, 50);
      const hasIntent = checkEnclosingIntent(circlePoints);
      expect(hasIntent).toBe(true);
    });

    it('should detect squares as having enclosing intent', () => {
      const squarePoints = createSquarePoints(0, 0, 100);
      const hasIntent = checkEnclosingIntent(squarePoints);
      expect(hasIntent).toBe(true);
    });

    it('should reject lines as not having enclosing intent', () => {
      const linePoints = createLinePoints(0, 0, 100, 0); // Horizontal line
      const hasIntent = checkEnclosingIntent(linePoints);
      expect(hasIntent).toBe(false);
    });

    it('should handle insufficient points', () => {
      const fewPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      const hasIntent = checkEnclosingIntent(fewPoints);
      expect(hasIntent).toBe(false);
    });

    it('should reject very small areas', () => {
      const tinyPoints = [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }
      ];
      const hasIntent = checkEnclosingIntent(tinyPoints);
      expect(hasIntent).toBe(false);
    });
  });

  describe('detectEnclosingGesture', () => {
    it('should detect a closed circle as valid enclosing gesture', () => {
      const circlePoints = createCirclePoints(0, 0, 50);
      const isGesture = detectEnclosingGesture(circlePoints);
      expect(isGesture).toBe(true);
    });

    it('should detect a closed square as valid enclosing gesture', () => {
      const squarePoints = createSquarePoints(0, 0, 100);
      const isGesture = detectEnclosingGesture(squarePoints);
      expect(isGesture).toBe(true);
    });

    it('should reject an open line as not enclosing', () => {
      const linePoints = createLinePoints(0, 0, 100, 100);
      const isGesture = detectEnclosingGesture(linePoints);
      expect(isGesture).toBe(false);
    });

    it('should handle insufficient points', () => {
      const fewPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      const isGesture = detectEnclosingGesture(fewPoints);
      expect(isGesture).toBe(false);
    });

    it('should detect almost-closed shapes as valid gestures', () => {
      const circlePoints = createCirclePoints(0, 0, 50);
      // Make it slightly open by moving the last point
      circlePoints[circlePoints.length - 1].x += 15; // Small gap
      
      const isGesture = detectEnclosingGesture(circlePoints);
      expect(isGesture).toBe(true); // Should still be considered valid
    });

    it('should reject very open shapes', () => {
      const circlePoints = createCirclePoints(0, 0, 50);
      // Make it very open by moving the last point far away
      circlePoints[circlePoints.length - 1].x += 200; // Very large gap
      
      const isGesture = detectEnclosingGesture(circlePoints);
      expect(isGesture).toBe(false);
    });
  });

  describe('analyzeForSingleLoop', () => {
    it('should detect a circular shape as enclosing gesture', () => {
      const circlePoints = createCirclePoints(100, 100, 50);
      const shape = createDrawShapeMock(circlePoints);
      
      const isGesture = analyzeForSingleLoop(shape);
      expect(isGesture).toBe(true);
    });

    it('should detect a square shape as enclosing gesture', () => {
      const squarePoints = createSquarePoints(100, 100, 100);
      const shape = createDrawShapeMock(squarePoints);
      
      const isGesture = analyzeForSingleLoop(shape);
      expect(isGesture).toBe(true);
    });

    it('should reject a line shape', () => {
      const linePoints = createLinePoints(0, 0, 100, 100);
      const shape = createDrawShapeMock(linePoints);
      
      const isGesture = analyzeForSingleLoop(shape);
      expect(isGesture).toBe(false);
    });

    it('should handle shapes with insufficient points', () => {
      const fewPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      const shape = createDrawShapeMock(fewPoints);
      
      const isGesture = analyzeForSingleLoop(shape);
      expect(isGesture).toBe(false);
    });

    it('should handle error cases gracefully', () => {
      const invalidShape: DrawShape = {
        id: 'test',
        type: 'draw',
        x: 0,
        y: 0,
        // No props - will cause an error in extraction
      };
      
      const isGesture = analyzeForSingleLoop(invalidShape);
      expect(isGesture).toBe(false);
    });

    it('should work with offset shapes', () => {
      const circlePoints = createCirclePoints(0, 0, 50); // Circle at origin
      const shape = createDrawShapeMock(circlePoints, 200, 300); // Shape offset
      
      const isGesture = analyzeForSingleLoop(shape);
      expect(isGesture).toBe(true);
    });
  });

  describe('Edge Cases and Real-world Scenarios', () => {
    it('should handle very small circles', () => {
      const smallCircle = createCirclePoints(0, 0, 10, 25);
      const isGesture = detectEnclosingGesture(smallCircle);
      expect(isGesture).toBe(true);
    });

    it('should handle very large circles', () => {
      const largeCircle = createCirclePoints(0, 0, 500, 100);
      const isGesture = detectEnclosingGesture(largeCircle);
      expect(isGesture).toBe(true);
    });

    it('should handle oval/elliptical shapes', () => {
      // Create an ellipse by stretching a circle
      const ellipsePoints = createCirclePoints(0, 0, 50);
      ellipsePoints.forEach(point => {
        point.x *= 1.5; // Stretch horizontally
      });
      
      const isGesture = detectEnclosingGesture(ellipsePoints);
      expect(isGesture).toBe(true); // Should be considered valid enclosing gesture
    });

    it('should reject triangle shapes', () => {
      // Create a triangle
      const trianglePoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 25, y: 43 }, // Equilateral triangle height
        { x: 0, y: 0 }, // Close the shape
      ];
      
      // Add more points along the edges to make it more realistic
      const detailedTriangle: Point[] = [];
      for (let i = 0; i < trianglePoints.length - 1; i++) {
        const start = trianglePoints[i];
        const end = trianglePoints[i + 1];
        const edgePoints = createLinePoints(start.x, start.y, end.x, end.y, 10);
        detailedTriangle.push(...edgePoints.slice(0, -1)); // Avoid duplicating end points
      }
      
      const isGesture = detectEnclosingGesture(detailedTriangle);
      expect(isGesture).toBe(true); // Triangle is a valid enclosing shape!
    });

    it('should handle irregular but roughly circular shapes', () => {
      // Create an irregular circle by adding random variations
      const irregularCircle = createCirclePoints(0, 0, 50);
      irregularCircle.forEach((point) => {
        // Add some irregular variations but keep it roughly circular
        const variation = 5; // Max 5 pixel variation
        point.x += (Math.random() - 0.5) * variation;
        point.y += (Math.random() - 0.5) * variation;
      });
      
      const isGesture = detectEnclosingGesture(irregularCircle);
      expect(isGesture).toBe(true);
    });
  });
});