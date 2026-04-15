import { createShapeId, TLShapeId } from "tldraw";
import { fetchSessionTranscript } from "@/lib/api-client";
import { getReplayWatermark, setReplayWatermark } from "@/lib/canvas-persistence";

const SHAPE_GAP = 16;

/**
 * After a page reload, find all shapes with claudeSessionId, fetch the full
 * session transcript, and render any text blocks that are missing from the canvas.
 */
export async function replayMissedSessionContent(editor: any) {
  const allShapes = editor.getCurrentPageShapes();

  // Group handwritten-text shapes by claudeSessionId
  const sessionShapes = new Map<string, any[]>();
  for (const shape of allShapes) {
    if (shape.type === "handwritten-text" && shape.props?.claudeSessionId) {
      const sid = shape.props.claudeSessionId;
      if (!sessionShapes.has(sid)) {
        sessionShapes.set(sid, []);
      }
      sessionShapes.get(sid)!.push(shape);
    }
  }

  if (sessionShapes.size === 0) return;

  for (const [sessionId, shapes] of Array.from(sessionShapes.entries())) {
    try {
      await replaySession(editor, sessionId, shapes);
    } catch (err) {
      console.error(`[session-replay] Failed to replay session ${sessionId}:`, err);
    }
  }
}

async function replaySession(editor: any, sessionId: string, shapes: any[]) {
  const transcript = await fetchSessionTranscript(sessionId);
  if (!transcript || !transcript.textBlocks || transcript.textBlocks.length === 0) {
    return;
  }

  // Check watermark — blocks before this index have already been rendered at least once
  const watermark = getReplayWatermark(sessionId);
  if (watermark >= transcript.textBlocks.length) return;

  const newBlocks = transcript.textBlocks.slice(watermark);
  if (newBlocks.length === 0) return;

  // Sort shapes by Y position to determine order
  shapes.sort((a: any, b: any) => a.y - b.y);

  // Position new shapes below the last existing one
  const lastShape = shapes[shapes.length - 1];
  const baseX = lastShape.x;
  let nextY: number;
  try {
    const bounds = editor.getShapeGeometry(editor.getShape(lastShape.id))?.bounds;
    nextY = lastShape.y + (bounds ? bounds.height : 60) + SHAPE_GAP;
  } catch {
    nextY = lastShape.y + 60 + SHAPE_GAP;
  }

  const newShapeIds: TLShapeId[] = [];
  let previousShapeId: TLShapeId = lastShape.id;

  const STAGGER_DELAY = 350; // ms between each message appearing

  for (let i = 0; i < newBlocks.length; i++) {
    const block = newBlocks[i];

    // Stagger each message with a delay (skip delay for the first one)
    if (i > 0) {
      await delay(STAGGER_DELAY);
    }

    const shapeId = createShapeId();
    newShapeIds.push(shapeId);

    // Create shape with opacity 0 initially for fade-in
    editor.createShapes([{
      id: shapeId,
      type: "handwritten-text",
      x: baseX,
      y: nextY,
      props: {
        text: block,
        font: "sans",
        size: "m",
        color: "black",
        autoSize: true,
        w: 500,
        h: 40,
      },
      opacity: 0,
    }]);

    // Connect with arrow to previous shape
    connectShapes(editor, previousShapeId, shapeId, baseX, nextY);

    // Animate fade-in
    animateShapeIn(editor, shapeId);

    // Measure actual height for next shape positioning
    try {
      const bounds = editor.getShapeGeometry(editor.getShape(shapeId))?.bounds;
      nextY += (bounds ? bounds.height : 60) + SHAPE_GAP;
    } catch {
      nextY += 60 + SHAPE_GAP;
    }

    previousShapeId = shapeId;
  }

  // Advance watermark now that all new blocks have been rendered
  setReplayWatermark(sessionId, transcript.textBlocks.length);

  // Move claudeSessionId to the last new shape
  if (newShapeIds.length > 0) {
    // Clear from old shape
    editor.updateShape({
      id: lastShape.id,
      type: "handwritten-text",
      props: { claudeSessionId: null },
    });
    // Tag last new shape
    editor.updateShape({
      id: newShapeIds[newShapeIds.length - 1],
      type: "handwritten-text",
      props: { claudeSessionId: sessionId },
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Animate a shape fading in from 0 to full opacity over ~300ms
 */
function animateShapeIn(editor: any, shapeId: TLShapeId) {
  const steps = 8;
  const stepDuration = 40; // ~320ms total
  let step = 0;

  const interval = setInterval(() => {
    step++;
    const opacity = step / steps;
    try {
      editor.updateShape({
        id: shapeId,
        type: "handwritten-text",
        opacity: Math.min(opacity, 1),
      });
    } catch {
      clearInterval(interval);
      return;
    }
    if (step >= steps) {
      clearInterval(interval);
    }
  }, stepDuration);
}

function connectShapes(editor: any, prevId: TLShapeId, newId: TLShapeId, x: number, y: number) {
  const arrowId = createShapeId();
  editor.createShapes([{
    id: arrowId,
    type: "arrow",
    x,
    y,
    props: {
      kind: "arc",
      bend: 0,
      size: "s",
      color: "grey",
      dash: "solid",
      fill: "none",
      arrowheadStart: "none",
      arrowheadEnd: "none",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      text: "",
      labelPosition: 0.5,
      scale: 1,
      elbowMidPoint: 0.5,
    },
  }]);

  editor.createBindings([
    {
      type: "arrow",
      fromId: arrowId,
      toId: prevId,
      props: {
        terminal: "start",
        normalizedAnchor: { x: 0.5, y: 1.0 },
        isExact: false,
        isPrecise: true,
        snap: "none",
      },
    },
    {
      type: "arrow",
      fromId: arrowId,
      toId: newId,
      props: {
        terminal: "end",
        normalizedAnchor: { x: 0.5, y: 0.0 },
        isExact: false,
        isPrecise: true,
        snap: "none",
      },
    },
  ]);
}
