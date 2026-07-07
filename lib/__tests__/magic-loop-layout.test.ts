import {
  pointInPolygon,
  isShapeInLoop,
  rectsIntersect,
  computeReplyLayout,
  RESPONSE_CARD_WIDTH,
  BRANCH_GAP,
  RESPONSE_GAP,
  Rect,
} from "../magic-loop-layout";

/** Generate points approximating a circle, for use as a loop polygon */
function circlePoints(cx: number, cy: number, r: number, n = 32) {
  return Array.from({ length: n }, (_, i) => ({
    x: cx + r * Math.cos((2 * Math.PI * i) / n),
    y: cy + r * Math.sin((2 * Math.PI * i) / n),
  }));
}

function boundsOf(points: { x: number; y: number }[]): Rect {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

describe("pointInPolygon", () => {
  const loop = circlePoints(100, 100, 50);

  it("detects a point inside the loop", () => {
    expect(pointInPolygon(100, 100, loop)).toBe(true);
    expect(pointInPolygon(120, 90, loop)).toBe(true);
  });

  it("rejects a point outside the loop", () => {
    expect(pointInPolygon(200, 100, loop)).toBe(false);
    expect(pointInPolygon(100, 160, loop)).toBe(false);
  });
});

describe("isShapeInLoop", () => {
  const loopPoints = circlePoints(100, 100, 50);
  const loop = boundsOf(loopPoints);

  it("includes writing whose center is inside the loop", () => {
    const stroke: Rect = { minX: 80, minY: 90, maxX: 120, maxY: 110 };
    expect(isShapeInLoop(stroke, loop, loopPoints)).toBe(true);
  });

  it("includes writing that pokes out of the loop but is centered in it", () => {
    const stroke: Rect = { minX: 40, minY: 90, maxX: 150, maxY: 110 };
    expect(isShapeInLoop(stroke, loop, loopPoints)).toBe(true);
  });

  it("includes a card the loop was drawn ON (circling content on the card)", () => {
    // Big card; small circle drawn entirely within its area
    const card: Rect = { minX: 0, minY: 0, maxX: 665, maxY: 400 };
    expect(isShapeInLoop(card, loop, loopPoints)).toBe(true);
  });

  it("EXCLUDES neighbouring ink whose bbox merely grazes the loop", () => {
    // Writing at the edge of the circled area: strokes that touch the
    // circle's bbox but weren't circled must not pollute the ink bounds
    // the reply is anchored to.
    const strayStroke: Rect = { minX: 145, minY: 0, maxX: 810, maxY: 400 };
    expect(isShapeInLoop(strayStroke, loop, loopPoints)).toBe(false);
    // …but a grazing AI CARD is still captured via rectsIntersect so its
    // session resumes (cards deliberately use the looser test).
    expect(rectsIntersect(strayStroke, loop)).toBe(true);
  });

  it("excludes shapes entirely outside the loop bounds", () => {
    const far: Rect = { minX: 500, minY: 500, maxX: 600, maxY: 600 };
    expect(isShapeInLoop(far, loop, loopPoints)).toBe(false);
  });

  it("includes a shape whose majority area sits inside the loop bounds", () => {
    // Center slightly outside the polygon but >50% of the shape within loop bbox
    const stroke: Rect = { minX: 60, minY: 140, maxX: 130, maxY: 160 };
    expect(isShapeInLoop(stroke, loop, loopPoints)).toBe(true);
  });
});

describe("computeReplyLayout", () => {
  const card: Rect = { minX: 0, minY: 0, maxX: 800, maxY: 400 };

  it("anchors the reply to the writing, not to card-relative slots", () => {
    // Writing at the LEFT edge of a wide card — old engine placed the reply
    // 685px left of the card; it must instead sit under the writing.
    const ink: Rect = { minX: 20, minY: 360, maxX: 200, maxY: 390 };
    const loop: Rect = { minX: 10, minY: 350, maxX: 210, maxY: 400 };

    const layout = computeReplyLayout({ loop, ink, sourceCard: card });

    expect(layout.x).toBe(20); // left-aligned with the ink
    expect(layout.y).toBe(card.maxY + BRANCH_GAP); // just below the card
    expect(layout.direction).toBe("under"); // reply overlaps the card horizontally
  });

  it("clears the card bottom even when the circle is high on the card body", () => {
    const ink: Rect = { minX: 100, minY: 50, maxX: 300, maxY: 90 };
    const loop: Rect = { minX: 90, minY: 40, maxX: 310, maxY: 100 };

    const layout = computeReplyLayout({ loop, ink, sourceCard: card });

    expect(layout.y).toBe(card.maxY + BRANCH_GAP); // below the card, not beside its top
  });

  it("keeps the reply level with writing beside a tall card (right)", () => {
    // Writing next to the top of a tall card must NOT push the reply below
    // the card's bottom — it stays beside the card, under the writing.
    const tallCard: Rect = { minX: 0, minY: 0, maxX: 800, maxY: 1500 };
    const ink: Rect = { minX: 900, minY: 100, maxX: 1100, maxY: 150 };
    const loop: Rect = { minX: 890, minY: 90, maxX: 1110, maxY: 160 };

    const layout = computeReplyLayout({ loop, ink, sourceCard: tallCard });

    expect(layout.x).toBe(900);
    expect(layout.y).toBe(160 + BRANCH_GAP); // level with the writing
    expect(layout.direction).toBe("right");
  });

  it("derives left when the reply card fits fully left of the card", () => {
    const ink: Rect = { minX: -900, minY: 100, maxX: -700, maxY: 150 };
    const loop: Rect = { minX: -910, minY: 90, maxX: -690, maxY: 160 };

    const layout = computeReplyLayout({ loop, ink, sourceCard: card });

    expect(layout.x).toBe(-900);
    expect(layout.x + RESPONSE_CARD_WIDTH).toBeLessThan(card.minX);
    expect(layout.y).toBe(160 + BRANCH_GAP);
    expect(layout.direction).toBe("left");
  });

  it("falls back to the loop bounds when only cards were circled", () => {
    const loop: Rect = { minX: 100, minY: 100, maxX: 300, maxY: 200 };

    const layout = computeReplyLayout({ loop, ink: null, sourceCard: card });

    expect(layout.x).toBe(100);
    expect(layout.y).toBe(card.maxY + BRANCH_GAP);
  });

  it("uses the plain response gap when no source card is involved", () => {
    const ink: Rect = { minX: 50, minY: 500, maxX: 250, maxY: 540 };
    const loop: Rect = { minX: 40, minY: 490, maxX: 260, maxY: 550 };

    const layout = computeReplyLayout({ loop, ink });

    expect(layout.x).toBe(50);
    expect(layout.y).toBe(550 + RESPONSE_GAP);
    expect(layout.direction).toBeUndefined();
  });

  it("nudges the reply below obstacles instead of landing on them", () => {
    const ink: Rect = { minX: 20, minY: 360, maxX: 200, maxY: 390 };
    const loop: Rect = { minX: 10, minY: 350, maxX: 210, maxY: 400 };
    // An existing card sits exactly where the reply would go
    const obstacle: Rect = { minX: 0, minY: 430, maxX: 665, maxY: 700 };

    const layout = computeReplyLayout({
      loop,
      ink,
      sourceCard: card,
      obstacles: [card, obstacle],
    });

    expect(layout.y).toBe(obstacle.maxY + BRANCH_GAP);
  });

  it("does not nudge when obstacles are clear of the reply", () => {
    const ink: Rect = { minX: 20, minY: 360, maxX: 200, maxY: 390 };
    const loop: Rect = { minX: 10, minY: 350, maxX: 210, maxY: 400 };
    // Obstacle far to the right
    const obstacle: Rect = { minX: 2000, minY: 400, maxX: 2600, maxY: 700 };

    const layout = computeReplyLayout({
      loop,
      ink,
      sourceCard: card,
      obstacles: [card, obstacle],
    });

    expect(layout.y).toBe(card.maxY + BRANCH_GAP);
  });
});
