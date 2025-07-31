/**
 * Synchronizer for TLDraw and iink-ts SSR
 * Converts TLDraw strokes to iink format and handles recognition
 */

import { Editor, type TLShape } from "tldraw";
import { Stroke, type TPointer, DefaultPenStyle } from "iink-ts";
import { InkRecognizer } from "./iink-recognizer";

export class TLDrawInkSynchronizer {
  private editor: Editor;
  private recognizer: InkRecognizer | null = null;
  private strokeIdMap = new Map<string, string>(); // TLDraw ID -> iink ID
  private isProcessing = false;

  // Callbacks
  public onTextRecognized?: (
    text: string,
    position: { x: number; y: number }
  ) => void;
  public onExportUpdate?: (exports: any) => void;

  constructor(editor: Editor, options?: { skipExistingStrokes?: boolean }) {
    this.editor = editor;
    
    // If skipExistingStrokes is true, mark all current strokes as already processed
    if (options?.skipExistingStrokes) {
      const shapes = this.editor.getCurrentPageShapes();
      const drawShapes = shapes.filter((s) => s.type === "draw");
      console.log(`⏭️ Skipping ${drawShapes.length} existing strokes`);
      
      // Add them to the map so they won't be processed
      drawShapes.forEach(shape => {
        this.strokeIdMap.set(shape.id, shape.id);
      });
    }
  }

  setRecognizer(recognizer: InkRecognizer) {
    if (!recognizer) {
      console.error("❌ Cannot set null recognizer");
      return;
    }

    this.recognizer = recognizer;

    // For SSR, export updates come through the message callback
    // We'll handle them in the sync method after calling export
  }

  private getLastStroke(): TLShape | null {
    const shapes = this.editor.getCurrentPageShapes();
    const drawShapes = shapes.filter((s) => s.type === "draw");
    return drawShapes.length > 0 ? drawShapes[drawShapes.length - 1] : null;
  }

  async sync() {
    if (!this.recognizer || this.isProcessing) return;

    this.isProcessing = true;

    try {
      const shapes = this.editor.getCurrentPageShapes();
      const drawShapes = shapes.filter((s) => s.type === "draw");

      // Find new strokes (not in our map)
      const newStrokes = drawShapes.filter(
        (shape) => !this.strokeIdMap.has(shape.id)
      );

      if (newStrokes.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.log(`🖊️ Syncing ${newStrokes.length} new strokes`);

      // Convert all new strokes to iink format
      const strokes: Stroke[] = [];
      for (const shape of newStrokes) {
        const stroke = this.convertTLDrawToStroke(shape);
        if (stroke) {
          strokes.push(stroke);
          this.strokeIdMap.set(shape.id, stroke.id);
        }
      }

      if (strokes.length > 0) {
        // Add all strokes at once
        console.log("📊 Strokes to send:", strokes);
        console.log("📊 First stroke details:", {
          stroke: strokes[0],
          pointers: strokes[0].pointers,
          pointerCount: strokes[0].pointers.length,
          firstPointer: strokes[0].pointers[0],
        });
        const exportResult = await this.recognizer.addStrokes(strokes);

        if (exportResult) {
          console.log("📄 Export result received:", exportResult);

          // Handle both JIIX and plain text formats
          let fullText = "";
          
          if (exportResult["application/vnd.myscript.jiix"]) {
            const jiixData = exportResult["application/vnd.myscript.jiix"];
            fullText = jiixData.label || "";
            console.log("🔤 Full text from JIIX:", JSON.stringify(fullText));
          } else if (exportResult["text/plain"]) {
            fullText = exportResult["text/plain"].trim();
            console.log("🔤 Full text from plain:", JSON.stringify(fullText));
          }

          if (fullText) {
            // Extract only the new text if we have the extractNewText method
            let textToProcess = fullText;
            if (
              "extractNewText" in this.recognizer &&
              typeof this.recognizer.extractNewText === "function"
            ) {
              textToProcess = this.recognizer.extractNewText(fullText);
              console.log("✂️ Filtered text (new only):", JSON.stringify(textToProcess));
              
              // Update the last recognized text for next time
              if (
                "updateLastRecognizedText" in this.recognizer &&
                typeof this.recognizer.updateLastRecognizedText === "function"
              ) {
                this.recognizer.updateLastRecognizedText(fullText);
              }
            }

            if (textToProcess && this.onTextRecognized) {
              // Get position from the last stroke
              const lastStroke = this.getLastStroke();
              if (lastStroke) {
                this.onTextRecognized(textToProcess, {
                  x: lastStroke.x,
                  y: lastStroke.y + 50, // Position below the text
                });
              }
            }
          }

          if (this.onExportUpdate) {
            this.onExportUpdate(exportResult);
          }
        }
      }

      // Handle deleted strokes
      const currentIds = new Set(drawShapes.map((s) => s.id));
      const deletedIds = Array.from(this.strokeIdMap.keys()).filter(
        (id) => !currentIds.has(id as any)
      );

      if (deletedIds.length > 0) {
        // For SSR, we might need to clear and re-add all strokes
        // since there's no removeStroke method
        console.log(
          `🗑️ ${deletedIds.length} strokes deleted, may need to rebuild`
        );
        for (const tlDrawId of deletedIds) {
          this.strokeIdMap.delete(tlDrawId);
        }
      }
    } catch (error) {
      console.error("❌ Sync error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private convertTLDrawToStroke(shape: any): Stroke | null {
    if (shape.type !== "draw") return null;

    const pointers: TPointer[] = [];
    const segments = shape.props.segments || [];
    const timestamp = Date.now();

    segments.forEach((segment: any) => {
      segment.points.forEach((point: any, index: number) => {
        pointers.push({
          x: shape.x + point.x,
          y: shape.y + point.y,
          t: timestamp + index * 10, // Incremental timestamps
          p: point.z || 0.5, // Pressure
        });
      });
    });

    if (pointers.length === 0) return null;

    // Create a proper Stroke instance with style
    const stroke = new Stroke(DefaultPenStyle, "pen");
    stroke.id = shape.id; // Use the TLDraw shape ID
    stroke.pointers = pointers;

    return stroke;
  }

  async clear() {
    if (!this.recognizer) return;

    try {
      // Reset text tracking in the recognizer
      if (
        "resetTextTracking" in this.recognizer &&
        typeof this.recognizer.resetTextTracking === "function"
      ) {
        this.recognizer.resetTextTracking();
      }

      // Clear our local stroke tracking
      this.strokeIdMap.clear();
      console.log("🧹 Cleared stroke tracking and reset text tracking");
    } catch (error) {
      console.error("❌ Clear error:", error);
    }
  }

  destroy() {
    this.strokeIdMap.clear();
    this.recognizer = null;
  }
}
