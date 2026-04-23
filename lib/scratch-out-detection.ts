import type { Point } from './gesture-detection';

export const SCRATCH_MIN_REVERSALS = 3;
export const SCRATCH_MIN_POINTS = 8;

export interface ScratchOutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Detects scratch-out (scribble) gestures over a target region.
 *
 * A scratch-out is a rapid back-and-forth pattern (like crossing something out)
 * with at least SCRATCH_MIN_REVERSALS X-direction reversals and
 * SCRATCH_MIN_POINTS inside the target bounds.
 *
 * Follows the HoldDetector pattern for consistency.
 */
export class ScratchOutDetector {
  private targetBounds: ScratchOutBounds | null = null;
  private onScratchCallback: (() => void) | null = null;

  setScratchCallback(callback: () => void): void {
    this.onScratchCallback = callback;
  }

  setTargetBounds(bounds: ScratchOutBounds | null): void {
    this.targetBounds = bounds;
  }

  getTargetBounds(): ScratchOutBounds | null {
    return this.targetBounds;
  }

  /**
   * Check if a completed stroke constitutes a scratch-out over the target.
   * Call this on pointer_up with the full stroke points.
   */
  checkStroke(points: Point[]): boolean {
    if (!this.targetBounds || points.length < SCRATCH_MIN_POINTS) return false;

    // Expand target bounds by a generous buffer for fat-finger / stylus tolerance
    const BUFFER = 20;
    const bounds = {
      minX: this.targetBounds.minX - BUFFER,
      maxX: this.targetBounds.maxX + BUFFER,
      minY: this.targetBounds.minY - BUFFER,
      maxY: this.targetBounds.maxY + BUFFER,
    };

    // Filter to points inside the (expanded) target bounds
    const insidePoints = points.filter(
      (p) => p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY
    );

    if (insidePoints.length < SCRATCH_MIN_POINTS) return false;

    // Count X-direction reversals among inside points
    let reversals = 0;
    let prevDx = 0;

    for (let i = 1; i < insidePoints.length; i++) {
      const dx = insidePoints[i].x - insidePoints[i - 1].x;
      if (dx === 0) continue;
      const sign = dx > 0 ? 1 : -1;
      if (prevDx !== 0 && sign !== prevDx) {
        reversals++;
      }
      prevDx = sign;
    }

    if (reversals >= SCRATCH_MIN_REVERSALS) {
      this.onScratchCallback?.();
      return true;
    }

    return false;
  }

  cleanup(): void {
    this.targetBounds = null;
    this.onScratchCallback = null;
  }
}
