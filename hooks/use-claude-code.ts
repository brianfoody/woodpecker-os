import { useCallback, useRef, useState } from "react";
import { createShapeId, TLShapeId } from "tldraw";
import { claudeCodeFetch, extractTextFromImage } from "@/lib/api-client";
import { getReplayWatermark, setReplayWatermark } from "@/lib/canvas-persistence";
import type { StreamEvent } from "@/lib/claude-code";
import { HandwrittenResponseRenderer } from "@/lib/handwritten-response-renderer";
import type { WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";

interface UseClaudeCodeOptions {
  editorRef: React.MutableRefObject<any>;
  responseRendererRef: React.MutableRefObject<HandwrittenResponseRenderer | null>;
  theme?: WoodpeckerCanvasTheme;
}

export interface ThinkingState {
  visible: boolean;
  label: string;
}

const SHAPE_GAP = 16; // vertical gap between response shapes

export function useClaudeCode({ editorRef, responseRendererRef, theme }: UseClaudeCodeOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [thinking, setThinking] = useState<ThinkingState>({
    visible: false,
    label: "thinking...",
  });

  const execute = useCallback(
    async (
      prompt: string,
      opts: { sessionId?: string; canvasKey?: string; image?: string } | undefined,
      position: { x: number; y: number },
      onStrokeCleanup?: () => void,
      sourceShapeId?: TLShapeId,
      branchDirection?: "right" | "under" | "left",
      branchStartAnchorY?: number
    ) => {
      const editor = editorRef.current;
      const renderer = responseRendererRef.current;
      if (!editor || !renderer) return;

      // Abort any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Show pulsing thinking indicator immediately
      setThinking({ visible: true, label: "waking up..." });

      let firstChunkReceived = false;
      let receivedSessionId: string | undefined;

      // Track multiple shapes — each text block gets its own shape
      const allShapeIds: TLShapeId[] = [];
      let currentShapeId: TLShapeId | null = null;
      let currentShapeText = "";
      let nextY = position.y;
      let needNewShape = true; // start true so the first text creates a shape

      // ── User card ID (declared early so closures below can reference it) ──
      let userCardId: TLShapeId | undefined;

      // ── Inline thinking indicator (themed only) ──
      let thinkingShapeId: TLShapeId | null = null;
      let thinkingArrowId: TLShapeId | null = null;

      const createThinkingShape = (label: string) => {
        removeThinkingShape();
        if (!theme) return;
        thinkingShapeId = createShapeId();
        editor.createShapes([{
          id: thinkingShapeId,
          type: "thinking-indicator",
          x: position.x,
          y: nextY,
          props: {
            w: 500,
            h: 90,
            label,
            cardBg: theme.aiCardBg,
            cardBorder: theme.aiCardBorder,
            cardBorderWidth: theme.aiCardBorderWidth,
            cardRadius: theme.aiCardRadius,
            cardShadow: theme.aiCardShadow,
            cardLabelText: theme.aiLabelText,
            cardLabelColor: theme.aiLabelColor,
            cardFont: theme.aiFont,
            thinkingColor: theme.thinkingColor,
          },
        }]);

        // Connect thinking shape to the most recent shape in the chain:
        // last response shape > user card > source shape
        const prevId = allShapeIds.length > 0
          ? allShapeIds[allShapeIds.length - 1]
          : userCardId ?? sourceShapeId;
        if (prevId && thinkingShapeId) {
          thinkingArrowId = createShapeId();
          editor.createShapes([{
            id: thinkingArrowId,
            type: "arrow",
            x: position.x,
            y: nextY,
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
              fromId: thinkingArrowId,
              toId: prevId,
              props: {
                terminal: "start",
                normalizedAnchor: { x: 0.5, y: 1.0 },
                isExact: false,
                isPrecise: false,
                snap: "none",
              },
            },
            {
              type: "arrow",
              fromId: thinkingArrowId,
              toId: thinkingShapeId,
              props: {
                terminal: "end",
                normalizedAnchor: { x: 0.5, y: 0.0 },
                isExact: false,
                isPrecise: false,
                snap: "none",
              },
            },
          ]);
        }
      };

      const removeThinkingShape = () => {
        const toDelete: TLShapeId[] = [];
        if (thinkingArrowId) toDelete.push(thinkingArrowId);
        if (thinkingShapeId) toDelete.push(thinkingShapeId);
        if (toDelete.length > 0) {
          try { editor.deleteShapes(toDelete); } catch {}
        }
        thinkingShapeId = null;
        thinkingArrowId = null;
      };

      const updateThinkingLabel = (label: string) => {
        if (thinkingShapeId) {
          try {
            editor.updateShape({
              id: thinkingShapeId,
              type: "thinking-indicator",
              props: { label },
            });
          } catch {}
        }
      };

      /** Estimate rendered height from text content (autoSize is async, so geometry may be stale) */
      const estimateTextHeight = (text: string, shapeWidth = 500): number => {
        if (!text) return theme ? 80 : 40;
        const charWidth = 10; // approx char width at size "m" (20px font)
        const lineHeight = theme ? 33 : 28; // card uses lineHeight 1.65 vs 1.5
        // Card has 24px horizontal padding on each side
        const contentWidth = theme ? shapeWidth - 48 : shapeWidth;
        const charsPerLine = Math.max(1, Math.floor(contentWidth / charWidth));
        let totalLines = 0;
        for (const para of text.split("\n")) {
          totalLines += Math.max(1, Math.ceil(para.length / charsPerLine));
        }
        // Card: 40px vertical padding + ~27px label with margin
        const padding = theme ? 67 : 16;
        return Math.max(theme ? 80 : 40, totalLines * lineHeight + padding);
      };

      /** Finalize the current shape (advance nextY for positioning the next one) */
      const finalizeCurrentShape = () => {
        if (!currentShapeId) return;
        // Use text-based estimate because autoSize updates h asynchronously
        // via a React useEffect, so getShapeGeometry returns stale bounds.
        const height = estimateTextHeight(currentShapeText);
        nextY += height + SHAPE_GAP;
        currentShapeId = null;
        currentShapeText = "";
      };

      /** Get anchor points for a branch direction */
      const getBranchAnchors = (dir: "right" | "under" | "left") => {
        // For right/left, use the normalized Y from the circle gesture area
        // so the arrow exits the source card at the level where the user interacted
        const startY = branchStartAnchorY ?? 0.5;
        switch (dir) {
          case "right":  return { start: { x: 1.0, y: startY }, end: { x: 0.0, y: 0.5 } };
          case "left":   return { start: { x: 0.0, y: startY }, end: { x: 1.0, y: 0.5 } };
          case "under":
          default:       return { start: { x: 0.5, y: 1.0 }, end: { x: 0.5, y: 0.0 } };
        }
      };

      /** Connect two consecutive shapes with a thin arrow line */
      const connectToPreviousShape = (
        prevId: TLShapeId,
        newId: TLShapeId,
        startAnchor?: { x: number; y: number },
        endAnchor?: { x: number; y: number },
        useElbow?: boolean
      ) => {
        const arrowId = createShapeId();
        editor.createShapes([{
          id: arrowId,
          type: "arrow",
          x: position.x,
          y: nextY,
          props: {
            kind: useElbow ? "elbow" : "arc",
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
              normalizedAnchor: startAnchor ?? { x: 0.5, y: 1.0 },
              isExact: false,
              isPrecise: false,
              snap: "none",
            },
          },
          {
            type: "arrow",
            fromId: arrowId,
            toId: newId,
            props: {
              terminal: "end",
              normalizedAnchor: endAnchor ?? { x: 0.5, y: 0.0 },
              isExact: false,
              isPrecise: false,
              snap: "none",
            },
          },
        ]);
      };

      /** Create a new response shape at the current nextY position */
      const createNewShape = () => {
        currentShapeId = createShapeId();
        currentShapeText = "";
        allShapeIds.push(currentShapeId);

        const shapeProps: Record<string, any> = {
          text: "",
          font: "sans",
          size: "m",
          color: theme ? theme.aiTextColor : "black",
          autoSize: true,
          w: 500,
          h: 40,
        };

        if (theme) {
          shapeProps.cardBg = theme.aiCardBg;
          shapeProps.cardBorder = theme.aiCardBorder;
          shapeProps.cardBorderWidth = theme.aiCardBorderWidth;
          shapeProps.cardRadius = theme.aiCardRadius;
          shapeProps.cardShadow = theme.aiCardShadow;
          shapeProps.cardLabel = theme.aiLabelText;
          shapeProps.cardLabelColor = theme.aiLabelColor;
          shapeProps.cardFont = theme.aiFont;
        }

        editor.createShapes([{
          id: currentShapeId,
          type: "handwritten-text",
          x: position.x,
          y: nextY,
          props: shapeProps,
        }]);

        // Connect to user card, source frame, or previous response shape
        if (allShapeIds.length === 1 && userCardId) {
          // Vertical: user card → AI card (user card already connected to source via branch arrow)
          connectToPreviousShape(userCardId, currentShapeId);
        } else if (allShapeIds.length === 1 && sourceShapeId && branchDirection) {
          // No user card but branching: source AI card →(branch arrow)→ new AI card
          const anchors = getBranchAnchors(branchDirection);
          const useElbow = branchDirection === "right" || branchDirection === "left";
          connectToPreviousShape(sourceShapeId, currentShapeId, anchors.start, anchors.end, useElbow);
        } else if (allShapeIds.length === 1 && sourceShapeId) {
          // Vertical: frame/source → AI card
          connectToPreviousShape(sourceShapeId, currentShapeId);
        } else if (allShapeIds.length >= 2) {
          const previousShapeId = allShapeIds[allShapeIds.length - 2];
          connectToPreviousShape(previousShapeId, currentShapeId);
        }

        needNewShape = false;
      };

      // Show inline thinking indicator on canvas immediately (before OCR)
      createThinkingShape("processing...");

      // Create "YOU" echo card before the AI response (themed only)
      if (theme) {
        let userDisplayText = prompt;

        // For magic wand path (no prompt, image provided), OCR the handwritten text
        if (!userDisplayText && opts?.image) {
          try {
            userDisplayText = await extractTextFromImage(opts.image);
          } catch (err) {
            console.error("OCR failed, skipping user card:", err);
          }
        }

        // OCR complete — remove the orange highlight stroke and gesture
        if (onStrokeCleanup) onStrokeCleanup();

        if (userDisplayText) {
          // Remove the early thinking shape so we can insert user card at this position
          removeThinkingShape();

          userCardId = createShapeId();
          editor.createShapes([{
            id: userCardId,
            type: "handwritten-text",
            x: position.x,
            y: nextY,
            props: {
              text: userDisplayText,
              font: "caveat",
              size: "m",
              color: theme.userTextColor,
              autoSize: true,
              w: 500,
              h: 40,
              cardBg: theme.userCardBg,
              cardBorder: null,
              cardBorderWidth: 0,
              cardRadius: theme.userCardRadius,
              cardShadow: null,
              cardLabel: theme.userLabelText,
              cardLabelColor: theme.userLabelColor,
              cardLabelOpacity: theme.userLabelOpacity,
              cardTextOpacity: theme.userTextOpacity,
              cardPadding: "12px 16px",
              cardFont: theme.userFont,
            },
          }]);

          // Connect source AI card → user card when branching
          if (sourceShapeId && branchDirection) {
            const anchors = getBranchAnchors(branchDirection);
            const useElbow = branchDirection === "right" || branchDirection === "left";
            connectToPreviousShape(sourceShapeId, userCardId, anchors.start, anchors.end, useElbow);
          }

          // Advance past the user card
          const userCardHeight = estimateTextHeight(userDisplayText);
          nextY += userCardHeight + SHAPE_GAP;
        }
      } else {
        // Non-themed: clean up stroke immediately
        if (onStrokeCleanup) onStrokeCleanup();
      }

      // Show thinking indicator below user card (or keep the one from above if no user card)
      createThinkingShape("waking up...");

      try {
        const response = await claudeCodeFetch(prompt, opts);

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (abortController.signal.aborted) break;

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const event: StreamEvent = JSON.parse(line.slice(6));

              if (event.type === "status" && event.content) {
                setThinking((prev) => ({ ...prev, label: event.content! }));
                updateThinkingLabel(event.content);
              }

              if (event.type === "text_delta" && event.content) {
                // Remove inline thinking indicator before rendering text
                removeThinkingShape();

                if (!firstChunkReceived) {
                  firstChunkReceived = true;
                  setThinking((prev) => ({ ...prev, visible: false }));
                }

                // Create a new shape if needed (first text or after tool use)
                if (needNewShape) {
                  createNewShape();
                }

                currentShapeText += event.content;
                if (currentShapeId) {
                  try {
                    const cleanText = currentShapeText.replace(/<[^>]*>/g, "").trim();
                    editor.updateShape({
                      id: currentShapeId,
                      type: "handwritten-text",
                      props: {
                        text: cleanText,
                        h: estimateTextHeight(cleanText),
                      },
                    });
                  } catch {}
                }
              }

              if (event.type === "tool_use" && event.toolName) {
                // Finalize current text shape and mark that next text needs a new shape
                finalizeCurrentShape();
                needNewShape = true;

                const toolLabel =
                  event.toolName === "Read" ? "reading files..." :
                  event.toolName === "Grep" ? "searching code..." :
                  event.toolName === "Glob" ? "finding files..." :
                  event.toolName === "Bash" ? "running command..." :
                  event.toolName === "Edit" ? "editing file..." :
                  event.toolName === "Write" ? "writing file..." :
                  `using ${event.toolName}...`;

                setThinking((prev) => ({ ...prev, visible: true, label: toolLabel }));
                createThinkingShape(toolLabel);
              }

              if (event.type === "error") {
                // Capture session ID even on error so we can resume
                if (event.sessionId) {
                  receivedSessionId = event.sessionId;
                }
                throw new Error(event.content || "Unknown error from Claude Code");
              }

              if (event.type === "done") {
                if (event.sessionId) {
                  receivedSessionId = event.sessionId;
                }
              }
            } catch (parseError) {
              if (parseError instanceof SyntaxError) continue;
              throw parseError;
            }
          }
        }

        // Hide thinking indicator
        removeThinkingShape();
        setThinking((prev) => ({ ...prev, visible: false }));

        // (stroke cleanup already happened after OCR)

        // Tag the last shape with the session ID for multi-turn follow-ups
        if (receivedSessionId && allShapeIds.length > 0) {
          const lastId = allShapeIds[allShapeIds.length - 1];
          try {
            editor.updateShape({
              id: lastId,
              type: "handwritten-text",
              props: { claudeSessionId: receivedSessionId },
            });
          } catch {}

          // Advance replay watermark so these blocks are never re-created on reload
          const current = getReplayWatermark(receivedSessionId);
          setReplayWatermark(receivedSessionId, current + allShapeIds.length);
        }
      } catch (error) {
        removeThinkingShape();
        setThinking((prev) => ({ ...prev, visible: false }));
        if (onStrokeCleanup) onStrokeCleanup();

        if (abortController.signal.aborted) return;

        const errorText = error instanceof Error ? error.message : "Something went wrong";
        const errorId = createShapeId();
        allShapeIds.push(errorId);
        editor.createShapes([{
          id: errorId,
          type: "handwritten-text",
          x: position.x,
          y: nextY,
          props: {
            w: 300,
            h: 40,
            text: errorText,
            font: "sans",
            size: "m",
            color: theme?.errorColor ?? "#dc2626",
            autoSize: true,
          },
        }]);

        // Tag shape with session ID even on error so "Continue" can resume
        if (receivedSessionId && allShapeIds.length > 0) {
          const lastId = allShapeIds[allShapeIds.length - 1];
          try {
            editor.updateShape({
              id: lastId,
              type: "handwritten-text",
              props: { claudeSessionId: receivedSessionId },
            });
          } catch {}
        }
      }
    },
    [editorRef, responseRendererRef]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setThinking((prev) => ({ ...prev, visible: false }));
  }, []);

  return { execute, cancel, thinking };
}
