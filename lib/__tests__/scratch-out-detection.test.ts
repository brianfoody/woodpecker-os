import { ScratchOutDetector, SCRATCH_MIN_REVERSALS, SCRATCH_MIN_POINTS } from "../scratch-out-detection";

const TARGET_BOUNDS = { minX: 100, maxX: 600, minY: 100, maxY: 190 };

/** Generate a zigzag of N points inside the bounds with R direction reversals */
function makeZigzag(reversals: number, pointsPerLeg: number = 4): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const y = 150; // middle of target
  let x = 200;
  const step = 30;
  let dir = 1;

  for (let r = 0; r <= reversals; r++) {
    for (let i = 0; i < pointsPerLeg; i++) {
      points.push({ x, y });
      x += step * dir;
    }
    dir *= -1;
  }
  return points;
}

describe("ScratchOutDetector", () => {
  let detector: ScratchOutDetector;
  let mockCallback: jest.Mock;

  beforeEach(() => {
    detector = new ScratchOutDetector();
    mockCallback = jest.fn();
    detector.setScratchCallback(mockCallback);
    detector.setTargetBounds(TARGET_BOUNDS);
  });

  afterEach(() => {
    detector.cleanup();
  });

  it("triggers callback on valid scratch-out gesture", () => {
    const points = makeZigzag(SCRATCH_MIN_REVERSALS);
    const result = detector.checkStroke(points);
    expect(result).toBe(true);
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger with too few reversals", () => {
    const points = makeZigzag(SCRATCH_MIN_REVERSALS - 1);
    const result = detector.checkStroke(points);
    expect(result).toBe(false);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it("does not trigger with too few points inside bounds", () => {
    // Points outside bounds
    const points = Array.from({ length: 20 }, (_, i) => ({
      x: 50 + (i % 2 === 0 ? -10 : 10), // outside minX
      y: 150,
    }));
    const result = detector.checkStroke(points);
    expect(result).toBe(false);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it("does not trigger without target bounds", () => {
    detector.setTargetBounds(null);
    const points = makeZigzag(5);
    const result = detector.checkStroke(points);
    expect(result).toBe(false);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it("does not trigger with fewer points than minimum", () => {
    const points = makeZigzag(SCRATCH_MIN_REVERSALS).slice(0, SCRATCH_MIN_POINTS - 1);
    const result = detector.checkStroke(points);
    expect(result).toBe(false);
  });

  it("applies buffer zone around target bounds", () => {
    // Points just outside bounds but within 20px buffer
    const points = makeZigzag(SCRATCH_MIN_REVERSALS).map((p) => ({
      x: p.x,
      y: TARGET_BOUNDS.maxY + 15, // just outside but within 20px buffer
    }));
    const result = detector.checkStroke(points);
    expect(result).toBe(true);
  });

  it("cleanup removes target bounds and callback", () => {
    detector.cleanup();
    expect(detector.getTargetBounds()).toBeNull();
    const points = makeZigzag(5);
    detector.checkStroke(points); // should not throw
  });

  it("handles a straight line (no reversals) correctly", () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      x: 200 + i * 5,
      y: 150,
    }));
    const result = detector.checkStroke(points);
    expect(result).toBe(false);
  });
});
