export interface Point {
  x: number;
  y: number;
}

export interface DrawShape {
  id: string;
  type: string;
  x: number;
  y: number;
  props?: {
    segments?: Array<{
      points?: Point[];
    }>;
  };
}

export function extractPointsFromShape(drawShape: DrawShape): Point[] {
  const segments = drawShape.props?.segments || [];
  const allPoints: Point[] = [];

  segments.forEach((segment) => {
    if (segment.points) {
      segment.points.forEach((point) => {
        allPoints.push({
          x: drawShape.x + point.x,
          y: drawShape.y + point.y,
        });
      });
    }
  });

  return allPoints;
}

export function checkEnclosingIntent(points: Point[]): boolean {
  if (points.length < 6) return false;

  // For enclosing intent, we just care that it's not a straight line
  // Calculate the bounding box
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  const width = maxX - minX;
  const height = maxY - minY;
  const area = width * height;

  // Reject if it's too narrow (likely a line)
  const aspectRatio = Math.max(width, height) / (Math.min(width, height) || 1);
  if (aspectRatio > 10) {
    return false; // Too linear
  }

  // Reject if area is too small (likely a dot or very short line)
  if (area < 100) {
    return false;
  }

  // If it has reasonable dimensions and isn't too linear, consider it enclosing intent
  return true;
}

export function detectEnclosingGesture(points: Point[]): boolean {
  // iPad touch input produces fewer points than desktop — lower minimum
  if (points.length < 8) return false;

  // Check if the start and end points are reasonably close (suggesting enclosing intent)
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const closureDistance = Math.sqrt(
    Math.pow(endPoint.x - startPoint.x, 2) +
    Math.pow(endPoint.y - startPoint.y, 2)
  );

  // Calculate the perimeter to set a reasonable closure threshold
  let perimeter = 0;
  for (let i = 1; i < points.length; i++) {
    const dist = Math.sqrt(
      Math.pow(points[i].x - points[i - 1].x, 2) +
        Math.pow(points[i].y - points[i - 1].y, 2)
    );
    perimeter += dist;
  }

  // Be generous with closure — up to 25% of perimeter (touch is less precise)
  const closureThreshold = perimeter * 0.25;

  // Check if the shape shows enclosing intent (not a straight line)
  const hasEnclosingIntent = checkEnclosingIntent(points);

  const isValidGesture = closureDistance < closureThreshold && hasEnclosingIntent;

  return isValidGesture;
}

export function analyzeForEnclosingGesture(drawShape: DrawShape): boolean {
  try {
    // Extract points from the draw shape segments
    const allPoints = extractPointsFromShape(drawShape);

    if (allPoints.length < 8) return false; // Need enough points for analysis

    // Check if the stroke shows enclosing intent
    const hasEnclosingIntent = detectEnclosingGesture(allPoints);

    return hasEnclosingIntent;
  } catch (error) {
    console.error("Error analyzing stroke:", error);
    return false;
  }
}

// Keep the old function name for backward compatibility
export function analyzeForSingleLoop(drawShape: DrawShape): boolean {
  return analyzeForEnclosingGesture(drawShape);
}