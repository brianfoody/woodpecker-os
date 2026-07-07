import type { Point } from "./gesture-detection";

/** Axis-aligned rectangle in page space */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type BranchDirection =
  | "right"
  | "right-under"
  | "under"
  | "left"
  | "left-under";

export const RESPONSE_CARD_WIDTH = 665;
export const BRANCH_GAP = 20;
export const RESPONSE_GAP = 60;

/** Estimated height of the reply chain used for collision checks before it renders */
export const REPLY_ESTIMATED_HEIGHT = 200;

/** Standard ray-casting point-in-polygon test */
export function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Plain bounding-box overlap. Used for AI cards: circling writing at the
 *  edge of a card must still capture the card so its session resumes. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Whether an INK shape (stroke, text, bubble — anything that isn't an AI
 * card) counts as "circled" by the magic pen loop.
 *
 * A shape is in the loop when:
 *  - its center lies inside the drawn loop polygon (writing that was circled), or
 *  - the loop's center lies on the shape (a circle drawn ON it), or
 *  - the majority of the shape's area sits inside the loop's bounds.
 *
 * Mere bounding-box contact is NOT enough — neighbouring strokes that graze
 * the loop must not pollute the ink bounds the reply is anchored to.
 * (AI cards deliberately use the looser rectsIntersect instead.)
 */
export function isShapeInLoop(shape: Rect, loop: Rect, loopPoints: Point[]): boolean {
  // Fast reject: bounding boxes don't even touch
  if (
    shape.maxX < loop.minX ||
    shape.minX > loop.maxX ||
    shape.maxY < loop.minY ||
    shape.minY > loop.maxY
  ) {
    return false;
  }

  const centerX = (shape.minX + shape.maxX) / 2;
  const centerY = (shape.minY + shape.maxY) / 2;
  if (pointInPolygon(centerX, centerY, loopPoints)) return true;

  const loopCenterX = (loop.minX + loop.maxX) / 2;
  const loopCenterY = (loop.minY + loop.maxY) / 2;
  if (
    loopCenterX >= shape.minX &&
    loopCenterX <= shape.maxX &&
    loopCenterY >= shape.minY &&
    loopCenterY <= shape.maxY
  ) {
    return true;
  }

  const overlapW = Math.min(shape.maxX, loop.maxX) - Math.max(shape.minX, loop.minX);
  const overlapH = Math.min(shape.maxY, loop.maxY) - Math.max(shape.minY, loop.minY);
  const shapeArea = (shape.maxX - shape.minX) * (shape.maxY - shape.minY);
  return shapeArea > 0 && (overlapW * overlapH) / shapeArea >= 0.5;
}

export interface ReplyLayoutInput {
  /** Bounds of the magic pen loop stroke */
  loop: Rect;
  /** Bounds of the user's circled ink (non-card shapes), if any */
  ink?: Rect | null;
  /** Bounds of the source AI card the reply branches from, if one was circled */
  sourceCard?: Rect | null;
  /** Existing cards/bubbles the reply must not land on */
  obstacles?: Rect[];
  /** Estimated height of the reply chain for collision checks */
  estimatedReplyHeight?: number;
}

export interface ReplyLayout {
  x: number;
  y: number;
  direction?: BranchDirection;
}

/**
 * Position the reply (YOU card + AI response) for a magic pen gesture.
 *
 * The reply is anchored to the user's WRITING — left-aligned with the circled
 * ink, directly below the circled area — never to fixed slots around the
 * source card. When the reply column horizontally overlaps the source card it
 * additionally clears the card's bottom edge so it can't land on the card;
 * writing beside a (possibly tall) card keeps the reply level with the
 * writing instead of pushing it below the card. The branch direction (used
 * only for connector anchors) is derived from where the reply actually
 * ends up relative to the card.
 */
export function computeReplyLayout(input: ReplyLayoutInput): ReplyLayout {
  const { loop, ink, sourceCard } = input;
  const obstacles = input.obstacles ?? [];
  const replyHeight = input.estimatedReplyHeight ?? REPLY_ESTIMATED_HEIGHT;

  const x = ink ? ink.minX : loop.minX;
  const contentBottom = Math.max(loop.maxY, ink?.maxY ?? loop.maxY);

  let y: number;
  let direction: BranchDirection | undefined;

  if (sourceCard) {
    const replyRight = x + RESPONSE_CARD_WIDTH;
    const overlapsCard = replyRight > sourceCard.minX && x < sourceCard.maxX;
    if (overlapsCard) {
      direction = "under";
      y = Math.max(contentBottom, sourceCard.maxY) + BRANCH_GAP;
    } else {
      // Beside the card — stay level with the writing
      direction = replyRight <= sourceCard.minX ? "left" : "right";
      y = contentBottom + BRANCH_GAP;
    }
  } else {
    y = contentBottom + RESPONSE_GAP;
  }

  // Nudge downward until the reply doesn't land on an existing card/bubble.
  // Only moves down, so the derived direction stays valid.
  for (let i = 0; i < 20; i++) {
    const hit = obstacles.find(
      (o) =>
        o.minX < x + RESPONSE_CARD_WIDTH &&
        o.maxX > x &&
        o.minY < y + replyHeight &&
        o.maxY > y
    );
    if (!hit) break;
    y = hit.maxY + BRANCH_GAP;
  }

  return { x, y, direction };
}
