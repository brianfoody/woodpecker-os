"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Tldraw,
  TLUiOverrides,
  TLComponents,
  DefaultToolbar,
  DefaultToolbarContent,
  loadSnapshot,
  TLShape,
  createShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import {
  MessageBubbleShapeUtil,
  WebsiteBubbleShapeUtil,
  HandwrittenTextShapeUtil,
  InteractionBubbleShapeUtil,
  ThinkingIndicatorShapeUtil,
} from "@/lib/shapes";

import { analyzeForSingleLoop } from "@/lib/gesture-detection";
import { HoldDetector } from "@/lib/hold-detection";
import {
  loadCanvasData,
  CanvasAutoSaver,
  clearCanvasData,
  saveViewport,
  loadViewport,
} from "@/lib/canvas-persistence";
import { loadContacts } from "@/lib/contact-storage";
import {
  getLastMessageCheck,
  updateLastMessageCheck,
} from "@/lib/message-tracking";
import type { SmartMessage } from "@/lib/models";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { useOnboardingActions } from "@/hooks/use-onboarding-actions";
import { shouldShowOnboarding, startOnboarding } from "@/lib/onboarding-state";
import { HandwrittenResponseRenderer } from "@/lib/handwritten-response-renderer";
import { useClaudeCode } from "@/hooks/use-claude-code";
import { replayMissedSessionContent } from "@/lib/session-replay";
import type { WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";

const GESTURE_CHECK_DELAY = 300;

// Shared refs for cross-component communication (survives HMR)
const magicWandCallbackRef: { current: ((stroke: any, editor: any, holdPosition?: { x: number; y: number }) => Promise<void>) | null } = { current: null };
const onboardingCallbackRef: { current: ((actionType: string, additionalData?: any) => void) | null } = { current: null };

export default function TldrawCanvas({ theme, storageKey, darkMode, onToggleDarkMode }: { theme?: WoodpeckerCanvasTheme; storageKey?: string; darkMode?: boolean; onToggleDarkMode?: () => void }) {
  const editorRef = useRef<any>(null);
  const autoSaverRef = useRef<CanvasAutoSaver | null>(null);
  const responseRendererRef = useRef<HandwrittenResponseRenderer | null>(null);
  const holdDetectorRef = useRef<HoldDetector | null>(null);
  const themeStyleRef = useRef<HTMLStyleElement | null>(null);
  const gestureCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [originalStrokeProps, setOriginalStrokeProps] = useState<{
    color: string;
    size: string;
  } | null>(null);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingActions = useOnboardingActions();

  // Message polling state (kept for existing message bubbles)
  const [isPollingEnabled, setIsPollingEnabled] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Claude Code hook
  const { execute: executeClaudeCode, cancel: cancelClaudeCode, thinking } = useClaudeCode({
    editorRef,
    responseRendererRef,
    theme,
  });

  // Keep canvas background in sync when theme changes (dark mode toggle)
  useEffect(() => {
    if (theme && themeStyleRef.current) {
      themeStyleRef.current.textContent = `.tl-background { background-color: ${theme.canvasBg} !important; }`;
    }
  }, [theme]);

  // Check for message bubbles and enable/disable polling
  const checkMessageBubblesAndUpdatePolling = useCallback(() => {
    if (editorRef.current) {
      const allShapes = editorRef.current.getCurrentPageShapes();
      const messageBubbles = allShapes.filter(
        (shape: TLShape) => shape.type === "message-bubble"
      );
      const hasMessageBubbles = messageBubbles.length > 0;

      if (hasMessageBubbles && !isPollingEnabled) {
        setIsPollingEnabled(true);
      } else if (!hasMessageBubbles && isPollingEnabled) {
        setIsPollingEnabled(false);
      }
    }
  }, [isPollingEnabled]);

  // Function to check for new messages and update message bubbles
  const checkForNewMessages = useCallback(async () => {
    if (!editorRef.current) return;

    try {
      const lastCheck = getLastMessageCheck();

      const response = await fetch("/api/read-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastRetrievedAt: lastCheck?.toISOString(),
        }),
      });

      if (!response.ok) return;

      const result = await response.json();
      if (!result.success) return;

      const newMessages: SmartMessage[] = result.messages;
      if (newMessages.length === 0) return;

      updateLastMessageCheck(new Date(result.lastRetrievedAt));

      const allShapes = editorRef.current.getCurrentPageShapes();
      const messageBubbles = allShapes.filter(
        (shape: TLShape) => shape.type === "message-bubble"
      );
      const contacts = loadContacts();

      newMessages.forEach((message) => {
        const matchingContact = contacts.find(
          (contact) => contact.phoneNumber === message.phoneNumber
        );

        if (matchingContact) {
          const matchingBubble = messageBubbles.find((bubble: TLShape) => {
            const props = bubble.props as any;
            return (
              props.phoneNumber === message.phoneNumber &&
              ["sent", "sending", "reply-available", "reply"].includes(props.state)
            );
          });

          if (matchingBubble) {
            editorRef.current.updateShape({
              id: matchingBubble.id,
              type: "message-bubble",
              props: {
                ...matchingBubble.props,
                state: "reply-available",
                replyText: message.text,
              },
            });

            const onboardingUpdate =
              onboardingActions.checkActionForOnboarding("message_received");
            if (onboardingUpdate) {
              console.log("Onboarding: Advanced due to message reply");
            }
          }
        }
      });
    } catch (error) {
      console.error("Error checking for new messages:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop message polling
  useEffect(() => {
    if (isPollingEnabled && !pollingIntervalRef.current) {
      checkForNewMessages();
      pollingIntervalRef.current = setInterval(checkForNewMessages, 10000);
    } else if (!isPollingEnabled && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPollingEnabled, checkForNewMessages]);

  // Set up editor store listener to monitor shape changes
  useEffect(() => {
    if (editorRef.current) {
      checkMessageBubblesAndUpdatePolling();
      setTimeout(() => checkMessageBubblesAndUpdatePolling(), 500);

      const unsubscribe = editorRef.current.store.listen(() => {
        setTimeout(() => checkMessageBubblesAndUpdatePolling(), 50);
      });

      return unsubscribe;
    }
  }, [checkMessageBubblesAndUpdatePolling]);

  // Resize an image blob to fit within maxDim x maxDim, then return base64
  const resizeAndEncodeImage = useCallback((blob: Blob, maxDim = 1568): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  // ===== MAGIC WAND GESTURE — now a single Claude Code path =====
  const handleMagicWandGesture = useCallback(
    async (
      stroke: any,
      eventEditor: any,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _holdPosition?: { x: number; y: number }
    ) => {
      try {
        // Extract points from the stroke
        const segments = stroke.props?.segments || [];
        const allPoints: { x: number; y: number }[] = [];

        segments.forEach((segment: any) => {
          if (segment.points) {
            segment.points.forEach((point: any) => {
              allPoints.push({
                x: stroke.x + point.x,
                y: stroke.y + point.y,
              });
            });
          }
        });

        // Calculate bounding box of the loop
        const minX = Math.min(...allPoints.map((p) => p.x));
        const maxX = Math.max(...allPoints.map((p) => p.x));
        const minY = Math.min(...allPoints.map((p) => p.y));
        const maxY = Math.max(...allPoints.map((p) => p.y));

        // Get all shapes and find ones inside the loop
        const allShapes = eventEditor.getCurrentPageShapes();
        const shapesInLoop = allShapes.filter((shape: any) => {
          if (shape.id === stroke.id) return false;

          const bounds = eventEditor.getShapeGeometry(shape).bounds;
          const shapeMinX = shape.x + bounds.minX;
          const shapeMaxX = shape.x + bounds.maxX;
          const shapeMinY = shape.y + bounds.minY;
          const shapeMaxY = shape.y + bounds.maxY;

          return !(
            shapeMaxX < minX ||
            shapeMinX > maxX ||
            shapeMaxY < minY ||
            shapeMinY > maxY
          );
        });

        if (shapesInLoop.length === 0) {
          try { eventEditor.deleteShape(stroke.id); } catch {}
          return;
        }

        // Highlight the stroke while processing
        setOriginalStrokeProps({
          color: stroke.props.color || "black",
          size: stroke.props.size || "m",
        });

        try {
          eventEditor.updateShape({
            id: stroke.id,
            type: "draw",
            props: { color: "orange", size: "xl" },
          });
        } catch {}

        // Capture image of the circled area (including the circle stroke)
        // so Claude vision can see exactly what was circled
        let imageBase64: string | undefined;
        try {
          const allShapeIds = [...shapesInLoop.map((s: any) => s.id), stroke.id];
          const imageResult = await eventEditor.toImage(allShapeIds, {
            format: "png",
            background: true,
            scale: 1,
            padding: 20,
          });
          if (imageResult?.blob) {
            imageBase64 = await resizeAndEncodeImage(imageResult.blob);
          }
        } catch (err) {
          console.error("Failed to capture circled area:", err);
        }

        if (!imageBase64) {
          try { eventEditor.deleteShape(stroke.id); } catch {}
          setOriginalStrokeProps(null);
          return;
        }

        // Create a dashed frame around the circled content (unthemed only)
        const FRAME_PADDING = 12;
        const RESPONSE_GAP = 40;
        let frameId: ReturnType<typeof createShapeId> | undefined;

        if (!theme) {
          frameId = createShapeId();
          eventEditor.createShapes([{
            id: frameId,
            type: "geo",
            x: minX - FRAME_PADDING,
            y: minY - FRAME_PADDING,
            props: {
              geo: "rectangle",
              w: (maxX - minX) + FRAME_PADDING * 2,
              h: (maxY - minY) + FRAME_PADDING * 2,
              fill: "none",
              dash: "dashed",
              size: "s",
              color: "light-blue",
            },
            opacity: 0.6,
          }]);
        }

        const prompt = "";

        // Look for a previous AI response shape to resume its session.
        // Prefer forkSessionId (immutable fork point) over claudeSessionId (backward compat).
        // If multiple bubbles are circled, use the one with highest y-position (most recent).
        const aiResponseShapes = shapesInLoop
          .filter((s: any) => s.type === "handwritten-text" && (s.props?.forkSessionId || s.props?.claudeSessionId))
          .sort((a: any, b: any) => b.y - a.y);
        const aiResponseShape = aiResponseShapes.length > 0 ? aiResponseShapes[0] : undefined;

        let resumeId: string | undefined;
        if (aiResponseShape) {
          const props = aiResponseShape.props as any;
          resumeId = props.forkSessionId || props.claudeSessionId;
        }

        const sessionOpts: { resumeSessionId?: string; image?: string } = resumeId
          ? { resumeSessionId: resumeId, image: imageBase64 }
          : { image: imageBase64 };

        // Find any AI card in the circle for layout positioning
        // (not all AI cards have a claudeSessionId — only the last card in a response does)
        const aiCardForLayout = shapesInLoop.find(
          (s: any) => s.type === "handwritten-text" && s.props?.cardBg
        ) ?? aiResponseShape;

        // Determine branch direction and position for themed follow-ups
        let bubbleX = minX;
        let bubbleY = theme
          ? maxY + RESPONSE_GAP
          : maxY + FRAME_PADDING + RESPONSE_GAP;
        let direction: "right" | "under" | "left" | undefined;
        let branchAnchorY: number | undefined;

        if (aiCardForLayout && theme) {
          const sourceBounds = eventEditor.getShapeGeometry(aiCardForLayout).bounds;
          const sourceCenterX = aiCardForLayout.x + sourceBounds.width / 2;
          const sourceW = sourceBounds.width;
          const sourceH = sourceBounds.height;

          // Default to "under" — override if user shapes give a clear direction
          direction = "under";

          // Calculate where the user wrote relative to the source AI card
          const userShapes = shapesInLoop.filter(
            (s: any) => s.id !== aiCardForLayout!.id
          );

          let uMinY = maxY;

          if (userShapes.length > 0) {
            let uMinX = Infinity, uMaxX = -Infinity;
            uMinY = Infinity;
            let uMaxY = -Infinity;
            for (const s of userShapes) {
              const b = eventEditor.getShapeGeometry(s).bounds;
              uMinX = Math.min(uMinX, s.x + b.minX);
              uMaxX = Math.max(uMaxX, s.x + b.maxX);
              uMinY = Math.min(uMinY, s.y + b.minY);
              uMaxY = Math.max(uMaxY, s.y + b.maxY);
            }
            const userCenterX = (uMinX + uMaxX) / 2;

            const dx = userCenterX - sourceCenterX;

            // If the user's content is below the bottom 95% of the source card,
            // they're writing underneath — use vertical layout unless clearly to a side
            const sourceBottomThreshold = aiCardForLayout.y + sourceH * 0.95;
            const userCenterY = (uMinY + uMaxY) / 2;

            if (userCenterY > sourceBottomThreshold) {
              // User wrote below the card — check horizontal offset for direction
              if (dx > 100) direction = "right";
              else if (dx < -100) direction = "left";
              else direction = "under";
            } else {
              // User wrote beside the card (within its height) — horizontal branch
              if (dx < 0) direction = "left";
              else direction = "right";
            }
          }

          const BRANCH_GAP = 80;
          const RESPONSE_CARD_WIDTH = 500;

          if (direction === "right") {
            bubbleX = aiCardForLayout.x + sourceW + BRANCH_GAP;
            // Align Y with where the user wrote, clamped to source card top
            bubbleY = Math.max(uMinY, aiCardForLayout.y);
          } else if (direction === "left") {
            bubbleX = aiCardForLayout.x - RESPONSE_CARD_WIDTH - BRANCH_GAP;
            bubbleY = Math.max(uMinY, aiCardForLayout.y);
          } else {
            bubbleX = aiCardForLayout.x;
            bubbleY = aiCardForLayout.y + sourceH + BRANCH_GAP;
          }

          // Calculate where the circle gesture midpoint falls on the source card
          // so the arrow exits at that level, not from the card center
          if (direction === "right" || direction === "left") {
            const gestureMidY = (minY + maxY) / 2;
            const normalizedY = (gestureMidY - aiCardForLayout.y) / sourceH;
            branchAnchorY = Math.max(0.1, Math.min(0.9, normalizedY));
          }
        }

        // Determine source shape for connecting arrow.
        // Themed continuations use the AI card; unthemed uses the frame.
        let sourceId = aiCardForLayout?.id ?? aiResponseShape?.id ?? frameId;
        let branchDir: "right" | "under" | "left" | undefined =
          aiCardForLayout && theme ? direction : undefined;

        if (!sourceId && theme && shapesInLoop.length > 0) {
          // Sort by Y descending and pick the bottom-most shape as anchor
          const sorted = [...shapesInLoop].sort((a: any, b: any) => b.y - a.y);
          sourceId = sorted[0].id;
          branchDir = "under";
        }

        // Execute Claude Code with image for vision-based content extraction
        await executeClaudeCode(
          prompt, sessionOpts,
          { x: bubbleX, y: bubbleY },
          () => {
            // Cleanup callback: remove gesture stroke
            try { eventEditor.deleteShape(stroke.id); } catch {}
            setOriginalStrokeProps(null);
          },
          sourceId,
          branchDir,
          branchAnchorY
        );

        // If cleanup wasn't triggered (no content received), clean up now
        setOriginalStrokeProps(null);
      } catch (error) {
        console.error("Magic wand processing failed:", error);

        // Restore original stroke appearance
        if (originalStrokeProps && stroke.id) {
          try {
            eventEditor.updateShape({
              id: stroke.id,
              type: "draw",
              props: originalStrokeProps,
            });
          } catch {}
        }
        setOriginalStrokeProps(null);
      }
    },
    [originalStrokeProps, executeClaudeCode, resizeAndEncodeImage]
  );

  // Handler for onboarding actions
  const handleOnboardingAction = useCallback(
    (actionType: string, additionalData?: any) => {
      const onboardingUpdate = onboardingActions.checkActionForOnboarding(
        actionType,
        additionalData
      );
      if (onboardingUpdate && onboardingUpdate.isActive) {
        setTimeout(() => setShowOnboarding(true), 1000);
      }
    },
    [onboardingActions]
  );

  // Register the magic wand callback
  useEffect(() => {
    magicWandCallbackRef.current = handleMagicWandGesture;
    return () => {
      if (magicWandCallbackRef.current === handleMagicWandGesture) {
        magicWandCallbackRef.current = null;
      }
    };
  }, [handleMagicWandGesture]);

  // Register the onboarding callback
  useEffect(() => {
    onboardingCallbackRef.current = handleOnboardingAction;
    return () => {
      if (onboardingCallbackRef.current === handleOnboardingAction) {
        onboardingCallbackRef.current = null;
      }
    };
  }, [handleOnboardingAction]);

  // Ensure pen tool is selected when editor is ready
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setCurrentTool("draw");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaverRef.current) {
        autoSaverRef.current.forceSave();
        autoSaverRef.current.cleanup();
      }
    };
  }, []);

  const uiOverrides: TLUiOverrides = {};

  const uiComponents: TLComponents = onToggleDarkMode
    ? {
        Toolbar: (props) => (
          <DefaultToolbar {...props}>
            <DefaultToolbarContent />
            <button
              onClick={onToggleDarkMode}
              aria-label="Toggle dark mode"
              style={{
                width: 40,
                height: 40,
                background: "none",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {darkMode ? "\u{1F319}" : "\u2600\uFE0F"}
            </button>
          </DefaultToolbar>
        ),
      }
    : {};

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        shapeUtils={[
          MessageBubbleShapeUtil,
          WebsiteBubbleShapeUtil,
          HandwrittenTextShapeUtil,
          InteractionBubbleShapeUtil,
          ThinkingIndicatorShapeUtil,
        ]}
        overrides={uiOverrides}
        components={uiComponents}
        onMount={(editor) => {
          console.log("tldraw mounted");

          try {
            localStorage.removeItem("tldraw-current-tool");
            sessionStorage.removeItem("tldraw-current-tool");
          } catch {}

          editorRef.current = editor;

          // Expose for Playwright / dev-console testing
          if (typeof window !== "undefined") {
            (window as any).__woodpecker_editor = editor;
            (window as any).__woodpecker_magicWand = magicWandCallbackRef;
          }

          // IMPORTANT: Disable tldraw's shape culling. tldraw sets display:none on
          // shapes whose geometry bounds are completely outside the viewport. For our
          // custom HTML shapes (cards, thinking indicators) this causes a vicious
          // cycle: culled elements report zero dimensions → ResizeObserver collapses
          // the height → geometry bounds shrink to ~20px → shape stays culled even
          // when the user pans back. Since we have a limited number of shapes on the
          // canvas (not thousands), the performance cost of keeping all shapes in the
          // DOM is negligible. This is a defensive rule to prevent this regression.
          editor.getCulledShapes = () => new Set();

          // Theme: inject canvas background and load Google Font
          let themeLinkEl: HTMLLinkElement | null = null;
          if (theme) {
            const styleEl = document.createElement("style");
            styleEl.textContent = `.tl-background { background-color: ${theme.canvasBg} !important; }`;
            document.head.appendChild(styleEl);
            themeStyleRef.current = styleEl;

            if (theme.googleFontsUrl) {
              themeLinkEl = document.createElement("link");
              themeLinkEl.rel = "stylesheet";
              themeLinkEl.href = theme.googleFontsUrl;
              document.head.appendChild(themeLinkEl);
            }
          }

          // Handwriting WebSocket recognizer disabled for now
          responseRendererRef.current = new HandwrittenResponseRenderer(editor);

          // Load saved canvas data
          const savedData = loadCanvasData(storageKey);
          if (savedData) {
            try {
              loadSnapshot(editor.store, savedData);
              console.log("Restored canvas from localStorage");
            } catch (error) {
              console.error("Failed to restore canvas data:", error);
              clearCanvasData(storageKey);
            }
          }

          // Restore last viewport position
          const savedViewport = loadViewport(storageKey);
          if (savedViewport) {
            editor.setCamera(savedViewport);
          }

          // Clean up any orphaned thinking-indicator shapes left from a
          // previous session that finished while the page was closed
          try {
            const allShapes = editor.getCurrentPageShapes();
            const orphanedThinking = allShapes
              .filter((s: any) => s.type === "thinking-indicator")
              .map((s: any) => s.id);
            if (orphanedThinking.length > 0) {
              editor.deleteShapes(orphanedThinking);
              console.log(`Cleaned up ${orphanedThinking.length} orphaned thinking indicator(s)`);
            }
          } catch {}

          // Replay any missed Claude Code session content after reload
          setTimeout(() => replayMissedSessionContent(editor), 500);

          // Check if onboarding should be shown
          setTimeout(() => {
            const shouldShow = shouldShowOnboarding();
            if (shouldShow) {
              setShowOnboarding(true);
              startOnboarding();
            }
          }, 100);

          // Load saved contacts
          try {
            const savedContacts = loadContacts();
            console.log(`Loaded ${savedContacts.length} saved contacts`);
          } catch {}

          // Set up auto-save
          autoSaverRef.current = new CanvasAutoSaver(editor.store, storageKey);

          const unsubscribe = editor.store.listen((event) => {
            const addedRecords = Object.values(event.changes.added);
            const updatedRecords = Object.values(event.changes.updated).map(
              ([, record]) => record
            );
            const removedRecords = Object.values(event.changes.removed);

            // Persist viewport position on camera changes
            const hasCameraChange = updatedRecords.some(
              (record: any) => record.typeName === "camera"
            );
            if (hasCameraChange) {
              const cam = editor.getCamera();
              saveViewport(cam, storageKey);
            }

            if (autoSaverRef.current) {
              const isDrawOperation =
                addedRecords.some(
                  (record: any) =>
                    record.typeName === "shape" && record.type === "draw"
                ) ||
                updatedRecords.some(
                  (record: any) =>
                    record.typeName === "shape" && record.type === "draw"
                ) ||
                removedRecords.some(
                  (record: any) =>
                    record.typeName === "shape" && record.type === "draw"
                );

              // Keep draw (handwritten) strokes above cards and connectors
              // so handwriting is never hidden behind response nodes or arrows.
              const newDrawShapeIds = addedRecords
                .filter((r: any) => r.typeName === "shape" && r.type === "draw")
                .map((r: any) => r.id);
              if (newDrawShapeIds.length > 0) {
                editor.bringToFront(newDrawShapeIds);
              }

              // When a shape is deleted, also delete any arrows bound to it.
              // tldraw removes bindings automatically but leaves orphaned arrows.
              const removedBindings = removedRecords.filter(
                (record: any) => record.typeName === "binding"
              );
              if (removedBindings.length > 0) {
                const arrowIds = new Set<string>();
                for (const binding of removedBindings) {
                  arrowIds.add((binding as any).fromId);
                }
                const toDelete = Array.from(arrowIds).filter((id) => {
                  try {
                    const shape = editor.getShape(id as any);
                    return shape && shape.type === "arrow";
                  } catch {
                    return false;
                  }
                });
                if (toDelete.length > 0) {
                  editor.deleteShapes(toDelete.map((id) => ({ id, type: "arrow" } as any)));
                }
              }

              const hasDeletedShapes = removedRecords.some(
                (record: any) => record.typeName === "shape"
              );

              if (isDrawOperation || hasDeletedShapes) {
                autoSaverRef.current.forceSave();
              } else {
                autoSaverRef.current.scheduleAutoSave();
              }
            }
          });

          editor.setCurrentTool("draw");

          // Force pen tool selection with delays to ensure it sticks
          setTimeout(() => editor.setCurrentTool("draw"), 50);
          setTimeout(() => editor.setCurrentTool("draw"), 100);
          setTimeout(() => editor.setCurrentTool("draw"), 200);

          // Initialize hold detector
          holdDetectorRef.current = new HoldDetector();
          holdDetectorRef.current.setHoldCallback(async (stroke, holdPosition) => {
            console.log("Magic wand gesture triggered!");
            if (magicWandCallbackRef.current) {
              try {
                await magicWandCallbackRef.current(stroke, editor, holdPosition);
              } catch (error) {
                console.error("Error in magic wand callback:", error);
              }
            }
          });

          // Auto-revert to pen after other tools
          editor.on("event", (info) => {
            if (info.type === "pointer" && info.name === "pointer_up") {
              const currentTool = editor.getCurrentToolId();
              if (
                ["arrow", "rectangle", "ellipse", "text"].includes(currentTool)
              ) {
                setTimeout(() => {
                  if (editor.getCurrentToolId() === currentTool) {
                    editor.setCurrentTool("draw");
                  }
                }, 200);
              }
            }
          });

          // Gesture detection
          editor.on("event", async (info) => {
            if (info.type === "pointer" && info.name === "pointer_down") {
              if (holdDetectorRef.current) {
                holdDetectorRef.current.cancelHoldDetection();
              }
              if (gestureCheckTimerRef.current) {
                clearTimeout(gestureCheckTimerRef.current);
                gestureCheckTimerRef.current = null;
              }
            }

            if (info.type === "pointer" && info.name === "pointer_move") {
              const allShapes = editor.getCurrentPageShapes();
              const drawShapes = allShapes.filter(
                (shape) => shape.type === "draw"
              );
              const currentStroke = drawShapes[drawShapes.length - 1];

              if (currentStroke && currentStroke.type === "draw") {
                const currentHoldShape = holdDetectorRef.current?.getCurrentShape();
                if (
                  !currentHoldShape ||
                  currentHoldShape.id !== currentStroke.id
                ) {
                  if (gestureCheckTimerRef.current) {
                    clearTimeout(gestureCheckTimerRef.current);
                  }

                  gestureCheckTimerRef.current = setTimeout(() => {
                    const latestShapes = editor.getCurrentPageShapes();
                    const latestDrawShapes = latestShapes.filter(
                      (shape) => shape.type === "draw"
                    );
                    const latestStroke =
                      latestDrawShapes[latestDrawShapes.length - 1];

                    if (latestStroke && latestStroke.id === currentStroke.id) {
                      const isEnclosingGesture = analyzeForSingleLoop(
                        latestStroke as any
                      );

                      if (isEnclosingGesture) {
                        const initialPosition = info.point
                          ? { x: info.point.x, y: info.point.y }
                          : undefined;
                        holdDetectorRef.current?.startHoldDetection(
                          latestStroke,
                          initialPosition
                        );
                      }
                    }
                    gestureCheckTimerRef.current = null;
                  }, GESTURE_CHECK_DELAY);
                }
              }

              if (holdDetectorRef.current && info.point) {
                holdDetectorRef.current.updatePosition({ x: info.point.x, y: info.point.y });
              }
            }
          });

          // Cleanup
          return () => {
            if (autoSaverRef.current) {
              autoSaverRef.current.forceSave();
            }
            if (holdDetectorRef.current) {
              holdDetectorRef.current.cancelHoldDetection();
            }
            if (gestureCheckTimerRef.current) {
              clearTimeout(gestureCheckTimerRef.current);
              gestureCheckTimerRef.current = null;
            }
            if (responseRendererRef.current) {
              responseRendererRef.current.clearResponses();
            }
            unsubscribe();
            if (autoSaverRef.current) {
              autoSaverRef.current.cleanup();
            }
            if (themeStyleRef.current) {
              themeStyleRef.current.remove();
              themeStyleRef.current = null;
            }
            if (themeLinkEl) {
              themeLinkEl.remove();
            }
          };
        }}
      />

      {thinking.visible && !theme && (
        <ThinkingIndicator label={thinking.label} theme={theme} onCancel={cancelClaudeCode} />
      )}

      <OnboardingDialog
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onStepChange={(step) => {
          if (step === "complete") {
            setShowOnboarding(false);
          }
        }}
      />
    </div>
  );
}

// Export the global onboarding callback for use in shape utils
export function triggerOnboardingAction(
  actionType: string,
  additionalData?: any
) {
  if (onboardingCallbackRef.current) {
    onboardingCallbackRef.current(actionType, additionalData);
  }
}
