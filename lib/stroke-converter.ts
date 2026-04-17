export interface TLDrawStroke {
  id: string;
  type: 'draw';
  x: number;
  y: number;
  props: {
    segments: Array<{
      type: 'free' | 'straight';
      points: Array<{
        x: number;
        y: number;
        z?: number; // pressure
      }>;
    }>;
    size: string;
    color: string;
    fill: string;
    dash: string;
    isClosed: boolean;
    isComplete: boolean;
  };
}

export interface StrokeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert TLDraw stroke to iInk pointer events
 */
export function convertToIInkPointerEvents(stroke: TLDrawStroke): any[] {
  const pointerEvents: any[] = [];
  const timestamp = Date.now();
  
  stroke.props.segments.forEach((segment, segmentIndex) => {
    segment.points.forEach((point, pointIndex) => {
      // Convert TLDraw coordinates to absolute coordinates
      const x = stroke.x + point.x;
      const y = stroke.y + point.y;
      
      // Determine event type
      let eventType: string;
      if (pointIndex === 0) {
        eventType = 'pointerdown';
      } else if (pointIndex === segment.points.length - 1) {
        eventType = 'pointerup';
      } else {
        eventType = 'pointermove';
      }
      
      const pointerEvent = {
        pointerType: 'pen',
        pointerId: 1,
        eventType,
        x,
        y,
        t: timestamp + (segmentIndex * 100) + (pointIndex * 10), // Incremental timestamps
        p: point.z || 0.5, // Pressure (default to 0.5 if not available)
      };
      
      pointerEvents.push(pointerEvent);
    });
  });
  
  return pointerEvents;
}

/**
 * Convert multiple TLDraw strokes to a single iInk stroke sequence
 */
export function convertMultipleStrokes(strokes: TLDrawStroke[]): any[] {
  const allPointerEvents: any[] = [];
  const baseTimestamp = Date.now();
  
  strokes.forEach((stroke, strokeIndex) => {
    const strokeEvents = convertToIInkPointerEvents(stroke);
    
    // Adjust timestamps to ensure proper sequencing
    strokeEvents.forEach(event => {
      event.t = baseTimestamp + (strokeIndex * 1000) + (event.t - baseTimestamp);
      event.pointerId = strokeIndex + 1; // Different pointer ID for each stroke
      allPointerEvents.push(event);
    });
  });
  
  return allPointerEvents;
}

/**
 * Calculate bounds of a stroke or multiple strokes
 */
export function calculateStrokeBounds(strokes: TLDrawStroke | TLDrawStroke[]): StrokeBounds {
  const strokeArray = Array.isArray(strokes) ? strokes : [strokes];
  
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  strokeArray.forEach(stroke => {
    stroke.props.segments.forEach(segment => {
      segment.points.forEach(point => {
        const x = stroke.x + point.x;
        const y = stroke.y + point.y;
        
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
    });
  });
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Extract draw shapes from a list of shapes
 */
export function extractDrawShapes(shapes: any[]): TLDrawStroke[] {
  return shapes.filter((shape): shape is TLDrawStroke => shape.type === 'draw');
}

/**
 * Check if strokes are likely part of the same word/line based on proximity
 */
export function areStrokesRelated(stroke1: TLDrawStroke, stroke2: TLDrawStroke, threshold = 50): boolean {
  const bounds1 = calculateStrokeBounds(stroke1);
  const bounds2 = calculateStrokeBounds(stroke2);
  
  // Check horizontal proximity (for text on same line)
  const horizontalDistance = Math.min(
    Math.abs(bounds1.x + bounds1.width - bounds2.x),
    Math.abs(bounds2.x + bounds2.width - bounds1.x)
  );
  
  // Check vertical alignment
  const verticalOverlap = !(bounds1.y + bounds1.height < bounds2.y || bounds2.y + bounds2.height < bounds1.y);
  
  return horizontalDistance < threshold && verticalOverlap;
}

/**
 * Group strokes that are likely part of the same text
 */
export function groupRelatedStrokes(strokes: TLDrawStroke[], threshold = 50): TLDrawStroke[][] {
  const groups: TLDrawStroke[][] = [];
  const processed = new Set<string>();
  
  strokes.forEach(stroke => {
    if (processed.has(stroke.id)) return;
    
    const group: TLDrawStroke[] = [stroke];
    processed.add(stroke.id);
    
    // Find all related strokes
    strokes.forEach(otherStroke => {
      if (processed.has(otherStroke.id)) return;
      
      // Check if related to any stroke in the group
      const isRelated = group.some(groupStroke => 
        areStrokesRelated(groupStroke, otherStroke, threshold)
      );
      
      if (isRelated) {
        group.push(otherStroke);
        processed.add(otherStroke.id);
      }
    });
    
    groups.push(group);
  });
  
  return groups;
}