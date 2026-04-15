"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Tldraw,
  TLUiOverrides,
  loadSnapshot,
  TLShape,
  createShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import { PointSpinner } from "@/components/point-spinner";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import {
  MessageBubbleShapeUtil,
  WebsiteBubbleShapeUtil,
  HandwrittenTextShapeUtil,
  InteractionBubbleShapeUtil,
} from "@/lib/shapes";

import { analyzeForSingleLoop } from "@/lib/gesture-detection";
import { HoldDetector } from "@/lib/hold-detection";
import {
  loadCanvasData,
  CanvasAutoSaver,
  clearCanvasData,
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
import { HandwritingContextManagerV2 } from "@/lib/handwriting-context-manager-v2";
import { HandwrittenResponseRenderer } from "@/lib/handwritten-response-renderer";
import { ChatModeToggle } from "@/components/chat-mode-toggle";
import { useClaudeCode } from "@/hooks/use-claude-code";
import { replayMissedSessionContent } from "@/lib/session-replay";
import type { WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";

// Hold detection
let holdDetector: HoldDetector | null = null;

// Gesture detection state
let gestureCheckTimer: NodeJS.Timeout | null = null;
const GESTURE_CHECK_DELAY = 300;

// Global callback for magic wand gesture
let globalMagicWandCallback:
  | ((
      stroke: any,
      editor: any,
      holdPosition?: { x: number; y: number }
    ) => Promise<void>)
  | null = null;

// Global callback for onboarding actions
let globalOnboardingCallback:
  | ((actionType: string, additionalData?: any) => void)
  | null = null;

function cancelHoldDetection() {
  if (holdDetector) {
    holdDetector.cancelHoldDetection();
  }
  if (gestureCheckTimer) {
    clearTimeout(gestureCheckTimer);
    gestureCheckTimer = null;
  }
}

async function triggerMagicWandGesture(
  latestStroke: any,
  editor: any,
  holdPosition?: { x: number; y: number }
) {
  console.log("Magic wand gesture triggered!");

  if (globalMagicWandCallback) {
    try {
      await globalMagicWandCallback(latestStroke, editor, holdPosition);
    } catch (error) {
      console.error("Error in magic wand callback:", error);
    }
  }
}

export default function TldrawCanvas({ theme, storageKey }: { theme?: WoodpeckerCanvasTheme; storageKey?: string }) {
  const editorRef = useRef<any>(null);
  const autoSaverRef = useRef<CanvasAutoSaver | null>(null);
  const handwritingManagerRef = useRef<HandwritingContextManagerV2 | null>(null);
  const responseRendererRef = useRef<HandwrittenResponseRenderer | null>(null);
  const isProcessingHandwritingResponseRef = useRef(false);
  const [spinnerPosition, setSpinnerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
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

  // Chat mode state
  const [chatModeEnabled, setChatModeEnabled] = useState(false);

  // Claude Code hook
  const { execute: executeClaudeCode, thinking } = useClaudeCode({
    editorRef,
    responseRendererRef,
    theme,
  });

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
      holdPosition?: { x: number; y: number }
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

        // Set loading state
        let spinnerScreenPos;
        if (holdPosition) {
          spinnerScreenPos = holdPosition;
        } else {
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          spinnerScreenPos = eventEditor.pageToScreen({ x: centerX, y: centerY });
        }
        setSpinnerPosition(spinnerScreenPos);

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
          setSpinnerPosition(null);
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

        // Look for a previous AI response shape to resume its session
        const aiResponseShape = shapesInLoop.find(
          (s: any) => s.type === "handwritten-text" && s.props?.claudeSessionId
        );
        const sessionOpts: { sessionId?: string; image?: string } = aiResponseShape
          ? { sessionId: (aiResponseShape.props as any).claudeSessionId, image: imageBase64 }
          : { image: imageBase64 };

        // Determine branch direction and position for themed follow-ups
        let bubbleX = minX;
        let bubbleY = theme
          ? maxY + RESPONSE_GAP
          : maxY + FRAME_PADDING + RESPONSE_GAP;
        let direction: "right" | "under" | "left" | undefined;

        if (aiResponseShape && theme) {
          const sourceBounds = eventEditor.getShapeGeometry(aiResponseShape).bounds;
          const sourceCenterX = aiResponseShape.x + sourceBounds.width / 2;
          const sourceCenterY = aiResponseShape.y + sourceBounds.height / 2;
          const sourceW = sourceBounds.width;
          const sourceH = sourceBounds.height;

          // Default to "under" — override if user shapes give a clear direction
          direction = "under";

          // Calculate where the user wrote relative to the source AI card
          const userShapes = shapesInLoop.filter(
            (s: any) => s.id !== aiResponseShape!.id
          );

          if (userShapes.length > 0) {
            let uMinX = Infinity, uMaxX = -Infinity, uMinY = Infinity, uMaxY = -Infinity;
            for (const s of userShapes) {
              const b = eventEditor.getShapeGeometry(s).bounds;
              uMinX = Math.min(uMinX, s.x + b.minX);
              uMaxX = Math.max(uMaxX, s.x + b.maxX);
              uMinY = Math.min(uMinY, s.y + b.minY);
              uMaxY = Math.max(uMaxY, s.y + b.maxY);
            }
            const userCenterX = (uMinX + uMaxX) / 2;
            const userCenterY = (uMinY + uMaxY) / 2;

            const dx = userCenterX - sourceCenterX;
            const dy = userCenterY - sourceCenterY;

            if (Math.abs(dx) > Math.abs(dy) && dx > 0) direction = "right";
            else if (Math.abs(dx) > Math.abs(dy)) direction = "left";
            else direction = "under";
          }

          // Position the response: always below the source, offset horizontally for right/left
          const BRANCH_GAP = 80;
          const RESPONSE_CARD_WIDTH = 500;

          if (direction === "right") {
            bubbleX = aiResponseShape.x + sourceW + BRANCH_GAP;
            bubbleY = aiResponseShape.y + sourceH + BRANCH_GAP;
          } else if (direction === "left") {
            bubbleX = aiResponseShape.x - RESPONSE_CARD_WIDTH - BRANCH_GAP;
            bubbleY = aiResponseShape.y + sourceH + BRANCH_GAP;
          } else {
            bubbleX = aiResponseShape.x;
            bubbleY = aiResponseShape.y + sourceH + BRANCH_GAP;
          }
        }

        // Determine source shape for connecting arrow.
        // Themed continuations use the AI response shape; unthemed uses the frame.
        // For themed NEW interactions (no aiResponseShape, no frame), pick the
        // bottom-most circled shape so the response connects back to the source.
        let sourceId = aiResponseShape ? aiResponseShape.id : frameId;
        let branchDir: "right" | "under" | "left" | undefined =
          aiResponseShape && theme ? direction : undefined;

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
            // Cleanup callback: remove spinner and gesture stroke
            setSpinnerPosition(null);
            try { eventEditor.deleteShape(stroke.id); } catch {}
            setOriginalStrokeProps(null);
          },
          sourceId,
          branchDir
        );

        // If cleanup wasn't triggered (no content received), clean up now
        setSpinnerPosition(null);
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
        setSpinnerPosition(null);
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
    globalMagicWandCallback = handleMagicWandGesture;
    return () => {
      if (globalMagicWandCallback === handleMagicWandGesture) {
        globalMagicWandCallback = null;
      }
    };
  }, [handleMagicWandGesture]);

  // Register the onboarding callback
  useEffect(() => {
    globalOnboardingCallback = handleOnboardingAction;
    return () => {
      if (globalOnboardingCallback === handleOnboardingAction) {
        globalOnboardingCallback = null;
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

  // Sync chat mode to handwriting manager
  useEffect(() => {
    if (handwritingManagerRef.current) {
      handwritingManagerRef.current.setChatMode(chatModeEnabled);
    }
  }, [chatModeEnabled]);

  const uiOverrides: TLUiOverrides = {};

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        shapeUtils={[
          MessageBubbleShapeUtil,
          WebsiteBubbleShapeUtil,
          HandwrittenTextShapeUtil,
          InteractionBubbleShapeUtil,
        ]}
        overrides={uiOverrides}
        onMount={(editor) => {
          console.log("tldraw mounted");

          try {
            localStorage.removeItem("tldraw-current-tool");
            sessionStorage.removeItem("tldraw-current-tool");
          } catch {}

          editorRef.current = editor;

          // Theme: inject canvas background and load Google Font
          let themeStyleEl: HTMLStyleElement | null = null;
          let themeLinkEl: HTMLLinkElement | null = null;
          if (theme) {
            themeStyleEl = document.createElement("style");
            themeStyleEl.textContent = `.tl-background { background-color: ${theme.canvasBg} !important; }`;
            document.head.appendChild(themeStyleEl);

            if (theme.googleFontsUrl) {
              themeLinkEl = document.createElement("link");
              themeLinkEl.rel = "stylesheet";
              themeLinkEl.href = theme.googleFontsUrl;
              document.head.appendChild(themeLinkEl);
            }
          }

          // Initialize handwriting recognition
          handwritingManagerRef.current = new HandwritingContextManagerV2(editor);
          responseRendererRef.current = new HandwrittenResponseRenderer(editor);

          // Set up intent detection — now uses Claude Code instead of Groq
          handwritingManagerRef.current.onIntentDetected = async (result) => {
            console.log("AI intent detected:", result);

            if (isProcessingHandwritingResponseRef.current) return;
            isProcessingHandwritingResponseRef.current = true;

            if (responseRendererRef.current && result.responsePosition) {
              try {
                await executeClaudeCode(
                  result.fullQuestion,
                  { canvasKey: "handwriting-chat" },
                  result.responsePosition,
                  undefined
                );

                // Update conversation history
                // Note: with streaming, we don't easily get the full response text here.
                // The renderer handles display. For conversation context, the session
                // ID handles multi-turn continuity.
              } catch (error) {
                console.error("Failed to get AI response:", error);
                responseRendererRef.current?.hideCursor();
              } finally {
                isProcessingHandwritingResponseRef.current = false;
              }
            } else {
              isProcessingHandwritingResponseRef.current = false;
            }
          };

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

              if (isDrawOperation && handwritingManagerRef.current) {
                handwritingManagerRef.current.sync();
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
          holdDetector = new HoldDetector();
          holdDetector.setHoldCallback((stroke, holdPosition) => {
            triggerMagicWandGesture(stroke, editor, holdPosition);
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
              cancelHoldDetection();
            }

            if (info.type === "pointer" && info.name === "pointer_move") {
              const allShapes = editor.getCurrentPageShapes();
              const drawShapes = allShapes.filter(
                (shape) => shape.type === "draw"
              );
              const currentStroke = drawShapes[drawShapes.length - 1];

              if (currentStroke && currentStroke.type === "draw") {
                const currentHoldShape = holdDetector?.getCurrentShape();
                if (
                  !currentHoldShape ||
                  currentHoldShape.id !== currentStroke.id
                ) {
                  if (gestureCheckTimer) {
                    clearTimeout(gestureCheckTimer);
                  }

                  gestureCheckTimer = setTimeout(() => {
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
                        holdDetector?.startHoldDetection(
                          latestStroke,
                          initialPosition
                        );
                      }
                    }
                    gestureCheckTimer = null;
                  }, GESTURE_CHECK_DELAY);
                }
              }

              if (holdDetector && info.point) {
                holdDetector.updatePosition({ x: info.point.x, y: info.point.y });
              }
            }
          });

          // Cleanup
          return () => {
            if (autoSaverRef.current) {
              autoSaverRef.current.forceSave();
            }
            cancelHoldDetection();
            if (handwritingManagerRef.current) {
              handwritingManagerRef.current.clear();
            }
            if (responseRendererRef.current) {
              responseRendererRef.current.clearResponses();
            }
            unsubscribe();
            if (autoSaverRef.current) {
              autoSaverRef.current.cleanup();
            }
            if (themeStyleEl) {
              themeStyleEl.remove();
            }
            if (themeLinkEl) {
              themeLinkEl.remove();
            }
          };
        }}
      />

      {spinnerPosition && <PointSpinner position={spinnerPosition} theme={theme} />}

      {thinking.visible && (
        <ThinkingIndicator label={thinking.label} theme={theme} />
      )}

      <ChatModeToggle
        enabled={chatModeEnabled}
        onToggle={setChatModeEnabled}
        theme={theme}
      />

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
  if (globalOnboardingCallback) {
    globalOnboardingCallback(actionType, additionalData);
  }
}
