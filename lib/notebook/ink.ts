/**
 * Ink geometry: pressure-aware stroke outlines (perfect-freehand), eraser
 * hit-testing, and rasterising a single row to a PNG for the agent to read.
 */

import { getStroke } from "perfect-freehand";
import type { Page, Point, Stroke } from "./model";

const BASE_SIZE = 3.4;

export function strokeOptions(stroke: Pick<Stroke, "size">, live = false) {
  return {
    size: BASE_SIZE * stroke.size,
    thinning: 0.62,
    smoothing: 0.55,
    streamline: 0.42,
    simulatePressure: false,
    last: !live,
  };
}

/** Did this stroke come from a device without real pressure (finger/mouse)? */
export function normalisePressure(pointerType: string, pressure: number): number {
  if (pointerType === "pen" && pressure > 0) return Math.min(1, 0.25 + pressure * 0.9);
  return 0.5;
}

function average(a: number, b: number): number {
  return (a + b) / 2;
}

/** perfect-freehand outline → SVG path data (quadratic smoothing). */
export function outlineToPath(outline: number[][]): string {
  const len = outline.length;
  if (len < 4) return "";
  let a = outline[0];
  let b = outline[1];
  const c = outline[2];
  let d = `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${b[0].toFixed(1)},${b[1].toFixed(1)} ${average(b[0], c[0]).toFixed(1)},${average(b[1], c[1]).toFixed(1)} T`;
  for (let i = 2; i < len - 1; i++) {
    a = outline[i];
    b = outline[i + 1];
    d += `${average(a[0], b[0]).toFixed(1)},${average(a[1], b[1]).toFixed(1)} `;
  }
  return d + "Z";
}

export function strokePath(stroke: Pick<Stroke, "points" | "size">, live = false): string {
  const pts = stroke.points;
  // A tap: give it a few points so it renders as a dot (i's and full stops).
  const input =
    pts.length === 1
      ? [pts[0], [pts[0][0] + 0.6, pts[0][1] + 0.6, pts[0][2]] as Point]
      : pts;
  return outlineToPath(getStroke(input, strokeOptions(stroke, live)));
}

export function strokeBounds(strokes: Stroke[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (strokes.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** The row a fresh stroke belongs to: where most of its ink sits. */
export function strokeRow(points: Point[], rowAt: (y: number) => number): number {
  const ys = points.map((p) => p[1]).sort((a, b) => a - b);
  return rowAt(ys[Math.floor(ys.length / 2)]);
}

function distToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return Math.hypot(px - x, py - y);
}

export function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const pts = stroke.points;
  if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= radius;
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(x, y, pts[i], pts[i + 1]) <= radius) return true;
  }
  return false;
}

/**
 * Scratch-out detection: a fast back-and-forth zig-zag over existing ink
 * erases what it covers — the pen-and-paper way of crossing something out.
 */
export function isScratchOut(points: Point[]): boolean {
  if (points.length < 12) return false;
  let reversals = 0;
  let lastDir = 0;
  let travel = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    travel += Math.abs(dx);
    if (Math.abs(dx) < 1.5) continue;
    const dir = Math.sign(dx);
    if (lastDir && dir !== lastDir) reversals++;
    lastDir = dir;
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return reversals >= 5 && width > 24 && travel > width * 3.2 && height < width * 1.4;
}

/**
 * Render one row's ink to a PNG (base64, no prefix): black on white, padded,
 * capped in size. This is all the agent ever sees of your handwriting.
 */
export function rasterizeRow(page: Page, row: number): string | null {
  const strokes = page.strokes.filter((s) => s.row === row);
  const b = strokeBounds(strokes);
  if (!b) return null;
  const pad = 14;
  const w = Math.ceil(b.maxX - b.minX + pad * 2);
  const h = Math.ceil(b.maxY - b.minY + pad * 2);
  const scale = Math.min(1, 1400 / w, 400 / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(w * scale));
  canvas.height = Math.max(8, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(pad - b.minX, pad - b.minY);
  ctx.fillStyle = "#111111";
  for (const s of strokes) {
    const d = strokePath(s);
    if (d) ctx.fill(new Path2D(d));
  }
  return canvas.toDataURL("image/png").split(",")[1] ?? null;
}

/** Rasterise a free-floating set of strokes (the "why not?" scribble pad). */
export function rasterizeStrokes(strokes: Stroke[]): string | null {
  return rasterizeRow(
    { date: "", strokes: strokes.map((s) => ({ ...s, row: 0 })), texts: [], rows: {}, rev: 0 },
    0
  );
}
