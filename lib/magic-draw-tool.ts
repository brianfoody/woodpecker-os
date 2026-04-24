import { DrawShapeTool } from "tldraw";

/**
 * A custom tldraw tool that behaves identically to the draw/pen tool
 * but has its own identity ("magic-draw"). This lets it appear as a
 * separate tool in the toolbar, independent of the regular pen.
 *
 * Strokes created while this tool is active get the Mystic Smoke
 * SVG filter, and closed loops trigger AI sessions.
 */
export class MagicDrawTool extends DrawShapeTool {
  static override id = "magic-draw";
  static override initial = "idle";
}
