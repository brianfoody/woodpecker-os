import { useCallback, useEffect, useRef, useState } from "react";
import { createShapeId, TLShapeId } from "tldraw";
import { claudeCodeFetch, extractTextFromImage } from "@/lib/api-client";
import { getReplayWatermark, setReplayWatermark } from "@/lib/canvas-persistence";

type StreamEvent = {
  type: "text_delta" | "tool_use" | "tool_result" | "status" | "error" | "done";
  content?: string;
  toolName?: string;
  sessionId?: string;
  forkSessionId?: string;
};
import { HandwrittenResponseRenderer } from "@/lib/handwritten-response-renderer";
import type { WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";
import { toast } from "@/hooks/use-toast";

interface UseClaudeCodeOptions {
  editorRef: React.MutableRefObject<any>;
  responseRendererRef: React.MutableRefObject<HandwrittenResponseRenderer | null>;
  theme?: WoodpeckerCanvasTheme;
}

export interface ThinkingState {
  visible: boolean;
  label: string;
  cancelled?: boolean;
}

const SHAPE_GAP = 16; // vertical gap between response shapes

export function useClaudeCode({ editorRef, responseRendererRef, theme }: UseClaudeCodeOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingShapeIdRef = useRef<TLShapeId | null>(null);
  const thinkingArrowIdRef = useRef<TLShapeId | null>(null);
  const streamActiveRef = useRef(false);
  const lastStreamActivityRef = useRef(0); // timestamp of last stream event
  const [thinking, setThinking] = useState<ThinkingState>({
    visible: false,
    label: "thinking...",
  });

  // Clean up orphaned thinking-indicator shapes and stale thinking state.
  // This runs when the page becomes visible again after the stream died in the
  // background, OR on mount if a previous session left shapes behind.
  const cleanupOrphanedThinking = useCallback(() => {
    // If a stream is still actively running, don't interfere
    if (streamActiveRef.current) return;

    const editor = editorRef.current;

    // Remove any tracked thinking shapes left over from a lost stream
    const toDelete: TLShapeId[] = [];
    if (thinkingArrowIdRef.current) {
      toDelete.push(thinkingArrowIdRef.current);
      thinkingArrowIdRef.current = null;
    }
    if (thinkingShapeIdRef.current) {
      toDelete.push(thinkingShapeIdRef.current);
      thinkingShapeIdRef.current = null;
    }
    if (toDelete.length > 0 && editor) {
      try { editor.deleteShapes(toDelete); } catch {}
    }

    // Also scan for any orphaned thinking-indicator shapes on the canvas
    // (e.g. from a previous page session that was persisted to localStorage)
    if (editor) {
      try {
        const allShapes = editor.getCurrentPageShapes();
        const orphanedShapes = allShapes
          .filter((s: any) => s.type === "thinking-indicator")
          .map((s: any) => s.id);
        if (orphanedShapes.length > 0) {
          editor.deleteShapes(orphanedShapes);
        }
      } catch {}
    }

    // Reset the React-level thinking state
    setThinking((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, [editorRef]);

  // When the page returns from being hidden, clean up if the stream is no longer active.
  // If the stream is still "active" (reader suspended by browser), wait a few seconds
  // for it to resume, then force cleanup if no activity has occurred — the connection
  // is likely dead/zombie.
  useEffect(() => {
    let zombieTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Immediate cleanup if stream already finished
        cleanupOrphanedThinking();

        // If stream is still "active", schedule a delayed check in case the
        // connection died while the page was hidden. Give the reader ~5s to
        // resume and deliver remaining events before declaring it dead.
        if (streamActiveRef.current) {
          const activitySnapshot = lastStreamActivityRef.current;
          zombieTimer = setTimeout(() => {
            zombieTimer = null;
            // If the stream is still marked active but no new events arrived
            // since we returned, the connection is zombie — force cleanup.
            if (streamActiveRef.current && lastStreamActivityRef.current === activitySnapshot) {
              console.warn("[use-claude-code] Zombie stream detected after visibility change — forcing cleanup");
              streamActiveRef.current = false;
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
              }
              cleanupOrphanedThinking();
            }
          }, 5000);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (zombieTimer) clearTimeout(zombieTimer);
    };
  }, [cleanupOrphanedThinking]);

  const execute = useCallback(
    async (
      prompt: string,
      opts: { resumeSessionId?: string; image?: string } | undefined,
      position: { x: number; y: number },
      onStrokeCleanup?: () => void,
      sourceShapeId?: TLShapeId,
      branchDirection?: "right" | "right-under" | "under" | "left" | "left-under",
      branchStartAnchorY?: number,
      isRetry?: boolean
    ) => {
      const editor = editorRef.current;
      const renderer = responseRendererRef.current;
      if (!editor || !renderer) return;

      // Store args for retry
      lastExecutionRef.current = {
        prompt,
        opts,
        position,
        sourceShapeId,
        branchDirection,
        branchStartAnchorY,
      };

      // Abort any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Mark stream as active so visibility-change cleanup won't interfere
      streamActiveRef.current = true;
      lastStreamActivityRef.current = Date.now();

      // Show pulsing thinking indicator immediately
      setThinking({ visible: true, label: "waking up..." });

      let firstChunkReceived = false;
      let receivedSessionId: string | undefined;
      let receivedForkSessionId: string | undefined;

      // Track multiple shapes — each text block gets its own shape
      const allShapeIds: TLShapeId[] = [];
      let currentShapeId: TLShapeId | null = null;
      let currentShapeText = "";
      let nextY = position.y;
      let needNewShape = true; // start true so the first text creates a shape

      // ── User card ID (declared early so closures below can reference it) ──
      let userCardId: TLShapeId | undefined;

      // ── Inline thinking indicator (themed only) ──
      // Local copies kept in sync with refs so the visibility-change handler
      // can clean up if the stream dies while the page is backgrounded.
      let thinkingShapeId: TLShapeId | null = null;
      let thinkingArrowId: TLShapeId | null = null;

      const createThinkingShape = (label: string) => {
        // On retry, reuse the existing cancelled thinking shape instead of deleting/recreating
        if (isRetry && thinkingShapeIdRef.current) {
          thinkingShapeId = thinkingShapeIdRef.current;
          try {
            editor.updateShape({
              id: thinkingShapeId,
              type: "thinking-indicator",
              props: { cancelled: false, label },
            });
          } catch {}
          setThinking({ visible: true, label, cancelled: false });
          return;
        }
        removeThinkingShape();
        if (!theme) return;
        thinkingShapeId = createShapeId();
        thinkingShapeIdRef.current = thinkingShapeId;
        editor.createShapes([{
          id: thinkingShapeId,
          type: "thinking-indicator",
          x: position.x,
          y: nextY,
          props: {
            w: 665,
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
            thinkingAnimation: theme.thinkingAnimation,
            dotColors: theme.thinkingDotColors,
            labelFont: theme.labelFont,
            labelFontSize: theme.labelFontSize,
            labelFontWeight: theme.labelFontWeight,
            labelLetterSpacing: theme.labelLetterSpacing,
            labelUppercase: theme.labelUppercase,
          },
        }]);

        // Connect thinking shape to the most recent shape in the chain:
        // last response shape > user card > source shape
        const prevId = allShapeIds.length > 0
          ? allShapeIds[allShapeIds.length - 1]
          : userCardId ?? sourceShapeId;
        if (prevId && thinkingShapeId) {
          thinkingArrowId = createShapeId();
          thinkingArrowIdRef.current = thinkingArrowId;
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
        thinkingShapeIdRef.current = null;
        thinkingArrowIdRef.current = null;
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

      /** Get anchor points for a branch direction.
       *  All connectors exit from bottom center of source card.
       *  Left/right variants enter the side of the reply card.
       *  Center-under enters the top of the reply card.
       */
      const getBranchAnchors = (dir: "right" | "right-under" | "under" | "left" | "left-under") => {
        switch (dir) {
          case "right":
          case "right-under": return { start: { x: 0.5, y: 1.0 }, end: { x: 0.0, y: 0.5 } };
          case "left":
          case "left-under":  return { start: { x: 0.5, y: 1.0 }, end: { x: 1.0, y: 0.5 } };
          case "under":
          default:            return { start: { x: 0.5, y: 1.0 }, end: { x: 0.5, y: 0.0 } };
        }
      };

      /** Connect two consecutive shapes with a thin arrow line */
      const connectToPreviousShape = (
        prevId: TLShapeId,
        newId: TLShapeId,
        startAnchor?: { x: number; y: number },
        endAnchor?: { x: number; y: number },
        useElbow?: boolean,
        dash?: "solid" | "dashed" | "dotted"
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
            dash: dash ?? "solid",
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
          w: 665,
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
          shapeProps.labelFont = theme.labelFont ?? null;
          shapeProps.labelFontSize = theme.labelFontSize ?? null;
          shapeProps.labelFontWeight = theme.labelFontWeight ?? null;
          shapeProps.labelLetterSpacing = theme.labelLetterSpacing ?? null;
          shapeProps.labelUppercase = theme.labelUppercase ?? null;
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
          const useElbow = ["right", "left", "right-under", "left-under"].includes(branchDirection);
          const connDash = branchDirection === "under" ? "dashed" as const : "solid" as const;
          connectToPreviousShape(sourceShapeId, currentShapeId, anchors.start, anchors.end, useElbow, connDash);
        } else if (allShapeIds.length === 1 && sourceShapeId) {
          // Vertical: frame/source → AI card
          connectToPreviousShape(sourceShapeId, currentShapeId);
        } else if (allShapeIds.length >= 2) {
          const previousShapeId = allShapeIds[allShapeIds.length - 2];
          connectToPreviousShape(previousShapeId, currentShapeId);
        }

        needNewShape = false;
      };

      // Create "YOU" echo card before the AI response (themed only, skip on retry)
      if (theme && !isRetry) {
        // Show thinking indicator with YOU styling while OCR runs
        const userThinkingId = createShapeId();
        editor.createShapes([{
          id: userThinkingId,
          type: "thinking-indicator",
          x: position.x,
          y: nextY,
          props: {
            w: 665,
            h: 90,
            label: "reading...",
            cardBg: theme.userCardBg,
            cardBorder: theme.userCardBorder ?? theme.aiCardBorder,
            cardBorderWidth: theme.userCardBorderWidth || 1,
            cardRadius: theme.userCardRadius,
            cardShadow: "",
            cardLabelText: theme.userLabelText,
            cardLabelColor: theme.userLabelColor,
            cardFont: theme.userFont,
            thinkingColor: theme.userLabelColor,
            thinkingAnimation: theme.thinkingAnimation,
            dotColors: theme.thinkingDotColors,
            labelFont: theme.labelFont,
            labelFontSize: theme.labelFontSize,
            labelFontWeight: theme.labelFontWeight,
            labelLetterSpacing: theme.labelLetterSpacing,
            labelUppercase: theme.labelUppercase,
          },
        }]);

        // Connect source AI card → user thinking indicator when branching
        if (sourceShapeId && branchDirection) {
          const anchors = getBranchAnchors(branchDirection);
          const useElbow = ["right", "left", "right-under", "left-under"].includes(branchDirection);
          const connDash = branchDirection === "under" ? "dashed" as const : "solid" as const;
          connectToPreviousShape(sourceShapeId, userThinkingId, anchors.start, anchors.end, useElbow, connDash);
        }

        // Run OCR to get actual text
        let userDisplayText = prompt;
        if (!userDisplayText && opts?.image) {
          try {
            userDisplayText = await extractTextFromImage(opts.image);
          } catch (err) {
            console.error("OCR failed, skipping user card:", err);
          }
        }

        // OCR complete — remove the orange highlight stroke and gesture
        if (onStrokeCleanup) onStrokeCleanup();

        // Remove thinking indicator
        try { editor.deleteShape(userThinkingId); } catch {}

        if (userDisplayText) {
          // Create the real YOU card with actual text
          userCardId = createShapeId();
          editor.createShapes([{
            id: userCardId,
            type: "handwritten-text",
            x: position.x,
            y: nextY,
            props: {
              text: userDisplayText,
              font: "sans",
              size: "m",
              color: theme.userTextColor,
              autoSize: true,
              w: 665,
              h: 40,
              cardBg: theme.userCardBg,
              cardBorder: theme.userCardBorder,
              cardBorderWidth: theme.userCardBorderWidth,
              cardRadius: theme.userCardRadius,
              cardShadow: null,
              cardLabel: theme.userLabelText,
              cardLabelColor: theme.userLabelColor,
              cardLabelOpacity: theme.userLabelOpacity,
              cardTextOpacity: theme.userTextOpacity,
              cardPadding: "12px 16px",
              cardFont: theme.userFont,
              labelFont: theme.labelFont ?? null,
              labelFontSize: theme.labelFontSize ?? null,
              labelFontWeight: theme.labelFontWeight ?? null,
              labelLetterSpacing: theme.labelLetterSpacing ?? null,
              labelUppercase: theme.labelUppercase ?? null,
              labelMarginBottom: theme.userLabelMarginBottom ?? null,
              cardLineHeight: theme.userLineHeight ?? null,
            },
          }]);

          // Reconnect source → user card
          if (sourceShapeId && branchDirection) {
            const anchors = getBranchAnchors(branchDirection);
            const useElbow = ["right", "left", "right-under", "left-under"].includes(branchDirection);
            const connDash = branchDirection === "under" ? "dashed" as const : "solid" as const;
            connectToPreviousShape(sourceShapeId, userCardId, anchors.start, anchors.end, useElbow, connDash);
          }

          // Advance past the user card
          const userCardHeight = estimateTextHeight(userDisplayText);
          nextY += userCardHeight + SHAPE_GAP;
        } else {
          // No text extracted — remove the placeholder card
          editor.deleteShapes([userCardId]);
          userCardId = undefined as any;
        }
      } else if (!isRetry) {
        // Non-themed: clean up stroke immediately
        if (onStrokeCleanup) onStrokeCleanup();
      }

      // Show thinking indicator (on retry this transitions the cancelled shape back to active)
      createThinkingShape(isRetry ? "retrying..." : "waking up...");

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

          // Track activity so zombie-stream detection knows we're alive
          lastStreamActivityRef.current = Date.now();

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
                if (event.forkSessionId) {
                  receivedForkSessionId = event.forkSessionId;
                }
              }
            } catch (parseError) {
              if (parseError instanceof SyntaxError) continue;
              throw parseError;
            }
          }
        }

        // Stream finished — mark inactive so visibility-change cleanup can run
        streamActiveRef.current = false;

        // Hide thinking indicator
        removeThinkingShape();
        setThinking((prev) => ({ ...prev, visible: false }));

        // (stroke cleanup already happened after OCR)

        // Tag ALL shapes with forkSessionId (every shape is a fork point)
        // and the LAST shape with claudeSessionId (for session replay)
        if (allShapeIds.length > 0) {
          const lastId = allShapeIds[allShapeIds.length - 1];

          // Store forkSessionId on every response shape
          if (receivedForkSessionId) {
            for (const shapeId of allShapeIds) {
              try {
                editor.updateShape({
                  id: shapeId,
                  type: "handwritten-text",
                  props: { forkSessionId: receivedForkSessionId },
                });
              } catch {}
            }
          }

          // Store claudeSessionId on last shape only (for replay)
          if (receivedSessionId) {
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
        }
      } catch (error) {
        streamActiveRef.current = false;
        removeThinkingShape();
        setThinking((prev) => ({ ...prev, visible: false }));
        if (onStrokeCleanup) onStrokeCleanup();

        if (abortController.signal.aborted) return;

        const errorText = error instanceof Error ? error.message : "Something went wrong";
        toast({
          title: "Woodpecker error",
          description: errorText,
          variant: "destructive",
        });

        // Tag any existing shapes with session IDs so "Continue" can resume
        if (allShapeIds.length > 0) {
          const lastId = allShapeIds[allShapeIds.length - 1];

          if (receivedForkSessionId) {
            for (const shapeId of allShapeIds) {
              try {
                editor.updateShape({
                  id: shapeId,
                  type: "handwritten-text",
                  props: { forkSessionId: receivedForkSessionId },
                });
              } catch {}
            }
          }

          if (receivedSessionId) {
            try {
              editor.updateShape({
                id: lastId,
                type: "handwritten-text",
                props: { claudeSessionId: receivedSessionId },
              });
            } catch {}
          }
        }
      }
    },
    [editorRef, responseRendererRef, theme]
  );

  // Store last execution args so we can retry after cancel
  const lastExecutionRef = useRef<{
    prompt: string;
    opts?: { resumeSessionId?: string; image?: string };
    position: { x: number; y: number };
    sourceShapeId?: any;
    branchDirection?: "right" | "right-under" | "under" | "left" | "left-under";
    branchStartAnchorY?: number;
  } | null>(null);

  const cancel = useCallback(() => {
    streamActiveRef.current = false;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const editor = editorRef.current;

    // Transition thinking shape to cancelled state instead of deleting it
    if (thinkingShapeIdRef.current && editor) {
      try {
        editor.updateShape({
          id: thinkingShapeIdRef.current,
          type: "thinking-indicator",
          props: { cancelled: true, label: "cancelled" },
        });
      } catch {
        // Shape may not exist — fall back to cleanup
        cleanupOrphanedThinking();
      }
    }

    setThinking({ visible: true, label: "cancelled", cancelled: true });
  }, [cleanupOrphanedThinking, editorRef]);

  const retry = useCallback(() => {
    // Re-execute with the same args — isRetry=true reuses the existing shape
    const last = lastExecutionRef.current;
    if (last) {
      execute(
        last.prompt,
        last.opts,
        last.position,
        undefined, // no stroke cleanup on retry
        last.sourceShapeId,
        last.branchDirection,
        last.branchStartAnchorY,
        true // isRetry — reuse cancelled thinking shape in-place
      );
    }
  }, [execute]);

  const dismiss = useCallback(() => {
    cleanupOrphanedThinking();
    setThinking({ visible: false, label: "", cancelled: false });
    lastExecutionRef.current = null;
  }, [cleanupOrphanedThinking]);

  return { execute, cancel, retry, dismiss, thinking };
}
