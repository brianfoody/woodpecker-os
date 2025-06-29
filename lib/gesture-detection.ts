'use client';

import { Editor, Vec } from 'tldraw';

interface Point {
  x: number;
  y: number;
  timestamp: number;
}

// Store recent points for gesture analysis
let recentPoints: Point[] = [];
const MAX_POINTS = 50;
const CIRCLE_THRESHOLD = 0.8; // Minimum circularity score
const MIN_RADIUS = 30; // Minimum circle radius in pixels
const MAX_RADIUS = 200; // Maximum circle radius in pixels
const TIME_WINDOW = 2000; // 2 seconds to complete a circle

export function detectCircleGesture(currentPoint: { x: number; y: number }, editor: Editor): boolean {
  const now = Date.now();
  
  // Add current point to recent points
  recentPoints.push({
    x: currentPoint.x,
    y: currentPoint.y,
    timestamp: now,
  });
  
  // Remove old points outside time window
  recentPoints = recentPoints.filter(point => now - point.timestamp < TIME_WINDOW);
  
  // Keep only recent points within limit
  if (recentPoints.length > MAX_POINTS) {
    recentPoints = recentPoints.slice(-MAX_POINTS);
  }
  
  // Need at least 10 points to detect a circle
  if (recentPoints.length < 10) {
    return false;
  }
  
  // Analyze the shape formed by recent points
  return analyzeCircularGesture(recentPoints);
}

function analyzeCircularGesture(points: Point[]): boolean {
  if (points.length < 10) return false;
  
  // Calculate center point (centroid)
  const center = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
  
  // Calculate distances from center to each point
  const distances = points.map(point => 
    Math.sqrt(Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2))
  );
  
  // Calculate average radius
  const avgRadius = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  
  // Check if radius is within acceptable range
  if (avgRadius < MIN_RADIUS || avgRadius > MAX_RADIUS) {
    return false;
  }
  
  // Calculate standard deviation of distances (measure of circularity)
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgRadius, 2), 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  
  // Calculate circularity score (lower standard deviation = more circular)
  const circularityScore = 1 - (stdDev / avgRadius);
  
  // Check angular coverage - ensure we've covered most of the circle
  const angles = points.map(point => 
    Math.atan2(point.y - center.y, point.x - center.x)
  );
  
  // Normalize angles to 0-2π range
  const normalizedAngles = angles.map(angle => angle < 0 ? angle + 2 * Math.PI : angle);
  
  // Sort angles and check coverage
  normalizedAngles.sort((a, b) => a - b);
  
  let angularCoverage = 0;
  for (let i = 1; i < normalizedAngles.length; i++) {
    angularCoverage += normalizedAngles[i] - normalizedAngles[i - 1];
  }
  
  // Add the gap between last and first angle
  if (normalizedAngles.length > 1) {
    angularCoverage += (2 * Math.PI) - (normalizedAngles[normalizedAngles.length - 1] - normalizedAngles[0]);
  }
  
  const angularCoverageRatio = angularCoverage / (2 * Math.PI);
  
  // Detect circle if both circularity and angular coverage are good
  const isCircle = circularityScore > CIRCLE_THRESHOLD && angularCoverageRatio > 0.7;
  
  // Clear points after detection to prevent repeated triggers
  if (isCircle) {
    recentPoints = [];
  }
  
  return isCircle;
}

// Reset gesture detection (useful for manual clearing)
export function resetGestureDetection(): void {
  recentPoints = [];
}

// Get current gesture statistics (for debugging)
export function getGestureStats(): {
  pointCount: number;
  timeSpan: number;
  lastActivity: number;
} {
  const now = Date.now();
  const timeSpan = recentPoints.length > 1 
    ? recentPoints[recentPoints.length - 1].timestamp - recentPoints[0].timestamp 
    : 0;
  const lastActivity = recentPoints.length > 0 
    ? now - recentPoints[recentPoints.length - 1].timestamp 
    : Infinity;
  
  return {
    pointCount: recentPoints.length,
    timeSpan,
    lastActivity,
  };
}

// Advanced gesture detection for different action types
export function detectGestureAction(points: Point[]): 'ask_ai' | 'send_message' | 'add_contact' | null {
  if (points.length < 5) return null;
  
  // For now, we'll use circle detection for AI actions
  // In the future, different gestures could trigger different actions:
  // - Circle: ask_ai
  // - Double-tap: send_message  
  // - Long press: add_contact
  
  return 'ask_ai';
}