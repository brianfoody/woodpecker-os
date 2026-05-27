"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Tldraw,
  TLUiOverrides,
  TLComponents,
  DefaultToolbar,
  DefaultToolbarContent,
  TldrawUiToolbarButton,
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
import { MysticSmokeFilter } from "@/components/explore/mystic-smoke-filter";
import { MagicDrawTool } from "@/lib/magic-draw-tool";
import { cancelClaudeCodeRef, retryClaudeCodeRef, dismissCancelledRef } from "@/lib/shapes/thinking-indicator-shape";
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
import { SessionPanel, SessionPanelToggle } from "@/components/session-panel";

// ── HMR-stable singletons ───────────────────────────────────────────
// These are declared at module scope so they survive hot-module replacement.
// tldraw throws if shapeUtils changes identity between renders, so we
// allocate the array ONCE per module load (which HMR preserves).
const shapeUtils = [
  MessageBubbleShapeUtil,
  WebsiteBubbleShapeUtil,
  HandwrittenTextShapeUtil,
  InteractionBubbleShapeUtil,
  ThinkingIndicatorShapeUtil,
];

// Custom tools registered with tldraw (HMR-stable)
const customTools = [MagicDrawTool];

// Shared refs for cross-component communication (survives HMR)
const magicWandCallbackRef: { current: ((stroke: any, editor: any) => Promise<void>) | null } = { current: null };
const onboardingCallbackRef: { current: ((actionType: string, additionalData?: any) => void) | null } = { current: null };

// ── Error boundary ──────────────────────────────────────────────────
// Catches tldraw internal errors during HMR so the page doesn't go white.
// On error it force-remounts the editor by toggling a key.
class TldrawErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { hasError: boolean; errorKey: number }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorKey: 0 };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn("[tldraw-hmr] Caught error, will remount editor:", error.message);
  }
  componentDidUpdate(_: any, prevState: any) {
    if (this.state.hasError && !prevState.hasError) {
      // Schedule a remount on next tick
      setTimeout(() => {
        this.setState((s) => ({ hasError: false, errorKey: s.errorKey + 1 }));
        this.props.onReset?.();
      }, 100);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#888", fontFamily: "system-ui" }}>
          Reloading canvas...
        </div>
      );
    }
    return <React.Fragment key={this.state.errorKey}>{this.props.children}</React.Fragment>;
  }
}

export default function TldrawCanvas({ theme, storageKey, darkMode }: { theme?: WoodpeckerCanvasTheme; storageKey?: string; darkMode?: boolean }) {
  const editorRef = useRef<any>(null);
  const autoSaverRef = useRef<CanvasAutoSaver | null>(null);
  const responseRendererRef = useRef<HandwrittenResponseRenderer | null>(null);
  const themeStyleRef = useRef<HTMLStyleElement | null>(null);
  const [originalStrokeProps, setOriginalStrokeProps] = useState<{
    color: string;
    size: string;
  } | null>(null);

  // Magic pen — tracked via tldraw's current tool ("magic-draw")
  const [magicPenActive, setMagicPenActive] = useState(false);
  const magicShapeIdsRef = useRef<Set<string>>(new Set());
  const [magicShapeIds, setMagicShapeIds] = useState<string[]>([]);

  // Session panel state
  const [showSessionPanel, setShowSessionPanel] = useState(false);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingActions = useOnboardingActions();

  // Message polling state (kept for existing message bubbles)
  const [isPollingEnabled, setIsPollingEnabled] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Claude Code hook
  const { execute: executeClaudeCode, cancel: cancelClaudeCode, retry: retryClaudeCode, dismiss: dismissCancelledClaudeCode, thinking } = useClaudeCode({
    editorRef,
    responseRendererRef,
    theme,
  });

  // Keep canvas background and color scheme in sync when theme/dark mode changes
  useEffect(() => {
    if (theme && themeStyleRef.current) {
      themeStyleRef.current.textContent = `.tl-background { background-color: ${theme.canvasBg} !important; }`;
    }
    // Tell tldraw about dark mode so "black" pen renders as white on dark canvas
    const editor = editorRef.current;
    if (editor) {
      editor.user.updateUserPreferences({
        colorScheme: darkMode ? "dark" : "light",
      });

      // Re-theme existing handwritten-text shapes so cards match the new palette
      if (theme) {
        const allShapes = editor.getCurrentPageShapes();
        const updates: any[] = [];

        for (const shape of allShapes) {
          if (shape.type !== "handwritten-text") continue;
          const p = shape.props as any;

          // AI cards have a cardBg + cardLabel
          if (p.cardBg && p.cardLabel === theme.aiLabelText) {
            updates.push({
              id: shape.id,
              type: "handwritten-text",
              props: {
                color: theme.aiTextColor,
                cardBg: theme.aiCardBg,
                cardBorder: theme.aiCardBorder,
                cardBorderWidth: theme.aiCardBorderWidth,
                cardRadius: theme.aiCardRadius,
                cardShadow: theme.aiCardShadow,
                cardLabelColor: theme.aiLabelColor,
              },
            });
          }
          // User echo cards
          else if (p.cardBg && p.cardLabel === (theme.userLabelText ?? "YOU")) {
            updates.push({
              id: shape.id,
              type: "handwritten-text",
              props: {
                color: theme.userTextColor,
                cardBg: theme.userCardBg,
                cardLabelColor: theme.userLabelColor,
              },
            });
          }
        }

        if (updates.length > 0) {
          editor.updateShapes(updates);
        }
      }
    }
  }, [theme, darkMode]);

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

  // ===== MAGIC PEN GESTURE — triggered on pen lift when loop detected =====
  const handleMagicWandGesture = useCallback(
    async (
      stroke: any,
      eventEditor: any,
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
        const RESPONSE_GAP = 60;
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
        let direction: "right" | "right-under" | "under" | "left" | "left-under" | undefined;
        let branchAnchorY: number | undefined;

        if (aiCardForLayout && theme) {
          const sourceBounds = eventEditor.getShapeGeometry(aiCardForLayout).bounds;
          const sourceCenterX = aiCardForLayout.x + sourceBounds.width / 2;
          const sourceW = sourceBounds.width;
          const sourceH = sourceBounds.height;
          const sourceBottom = aiCardForLayout.y + sourceH;

          const BRANCH_GAP = 20;
          const RESPONSE_CARD_WIDTH = 665;

          // Calculate where the user wrote relative to the source AI card
          const userShapes = shapesInLoop.filter(
            (s: any) => s.id !== aiCardForLayout!.id
          );

          let uMinY = maxY;

          if (userShapes.length > 0) {
            uMinY = Infinity;
            for (const s of userShapes) {
              const b = eventEditor.getShapeGeometry(s).bounds;
              uMinY = Math.min(uMinY, s.y + b.minY);
            }
          }

          // Direction detection using circle center against source center.
          // "Center" only if the circle center is within 25% of source width
          // from the source center — prevents large body-level circles from
          // being misdetected as center on tall cards.
          const circleCenterX = (minX + maxX) / 2;
          const circleCenterY = (minY + maxY) / 2;
          const circleMaxY = maxY;

          let hDir: "center" | "left" | "right";
          const centerThreshold = sourceW * 0.25;
          if (Math.abs(circleCenterX - sourceCenterX) < centerThreshold) {
            hDir = "center";
          } else {
            hDir = circleCenterX < sourceCenterX ? "left" : "right";
          }

          const isBodyLevel = circleCenterY < sourceBottom;

          // Apply the 5-scenario positioning table.
          // For all left/right scenarios the YOU card goes BELOW both the
          // source card and the circle so the elbow connector forms a clean L.
          if (hDir === "center") {
            // Center + under (scenario 1)
            direction = "under";
            bubbleX = aiCardForLayout.x + (sourceW - RESPONSE_CARD_WIDTH) / 2;
            bubbleY = circleMaxY + BRANCH_GAP;
          } else if (hDir === "left" && isBodyLevel) {
            // Left + body (scenario 2)
            direction = "left";
            bubbleX = aiCardForLayout.x - RESPONSE_CARD_WIDTH - BRANCH_GAP;
            bubbleY = circleMaxY + BRANCH_GAP;
          } else if (hDir === "left" && !isBodyLevel) {
            // Left + under (scenario 3)
            direction = "left-under";
            bubbleX = aiCardForLayout.x - RESPONSE_CARD_WIDTH - BRANCH_GAP;
            bubbleY = circleMaxY + BRANCH_GAP;
          } else if (hDir === "right" && isBodyLevel) {
            // Right + body (scenario 4)
            direction = "right";
            bubbleX = aiCardForLayout.x + sourceW + BRANCH_GAP;
            bubbleY = circleMaxY + BRANCH_GAP;
          } else {
            // Right + under (scenario 5)
            direction = "right-under";
            bubbleX = aiCardForLayout.x + sourceW + BRANCH_GAP;
            bubbleY = circleMaxY + BRANCH_GAP;
          }

          // All connectors exit from bottom center — branchAnchorY not needed
        }

        // Determine source shape for connecting arrow.
        // Themed continuations use the AI card; unthemed uses the frame.
        let sourceId = aiCardForLayout?.id ?? aiResponseShape?.id ?? frameId;
        let branchDir: "right" | "right-under" | "under" | "left" | "left-under" | undefined =
          aiCardForLayout && theme ? direction : undefined;

        if (!sourceId && theme && shapesInLoop.length > 0) {
          // Sort by Y descending and pick the bottom-most shape as anchor
          const sorted = [...shapesInLoop].sort((a: any, b: any) => b.y - a.y);
          sourceId = sorted[0].id;
          branchDir = "under";
        }

        // Discard the magic pen stroke immediately — don't wait for API
        try { eventEditor.deleteShape(stroke.id); } catch {}
        setOriginalStrokeProps(null);

        // Execute Claude Code with image for vision-based content extraction
        await executeClaudeCode(
          prompt, sessionOpts,
          { x: bubbleX, y: bubbleY },
          undefined,
          sourceId,
          branchDir,
          branchAnchorY
        );
      } catch (error) {
        console.error("Magic wand processing failed:", error);
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

  const handleToggleMagicPen = useCallback(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    if (editor.getCurrentToolId() === "magic-draw") {
      editor.setCurrentTool("draw");
    } else {
      editor.setCurrentTool("magic-draw");
    }
  }, []);

  // Expose cancel/retry/dismiss to the thinking-indicator shape
  useEffect(() => {
    cancelClaudeCodeRef.current = cancelClaudeCode;
    retryClaudeCodeRef.current = retryClaudeCode;
    dismissCancelledRef.current = dismissCancelledClaudeCode;
    return () => {
      if (cancelClaudeCodeRef.current === cancelClaudeCode) {
        cancelClaudeCodeRef.current = null;
      }
      if (retryClaudeCodeRef.current === retryClaudeCode) {
        retryClaudeCodeRef.current = null;
      }
      if (dismissCancelledRef.current === dismissCancelledClaudeCode) {
        dismissCancelledRef.current = null;
      }
    };
  }, [cancelClaudeCode, retryClaudeCode, dismissCancelledClaudeCode]);

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

  const uiOverrides: TLUiOverrides = useMemo(() => ({}), []);

  const uiComponents: TLComponents = useMemo(() => ({
    Toolbar: (props: any) => (
      <DefaultToolbar {...props}>
        <MagicPenToolButton active={magicPenActive} onClick={handleToggleMagicPen} />
        <DefaultToolbarContent />
      </DefaultToolbar>
    ),
  }), [magicPenActive, handleToggleMagicPen]);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <TldrawErrorBoundary>
      <Tldraw
        shapeUtils={shapeUtils}
        tools={customTools}
        overrides={uiOverrides}
        components={uiComponents}
        onMount={(editor) => {
          console.log("tldraw mounted");

          try {
            localStorage.removeItem("tldraw-current-tool");
            sessionStorage.removeItem("tldraw-current-tool");
          } catch {}

          editorRef.current = editor;

          // Set color scheme immediately so pen color matches canvas bg from the start
          if (darkMode !== undefined) {
            editor.user.updateUserPreferences({
              colorScheme: darkMode ? "dark" : "light",
            });
          }

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

          // Re-theme existing handwritten-text shapes so cards match the dark palette
          if (theme) {
            const shapesToRetheme = editor.getCurrentPageShapes();
            const themeUpdates: any[] = [];
            for (const shape of shapesToRetheme) {
              if (shape.type !== "handwritten-text") continue;
              const p = shape.props as any;
              if (p.cardBg && p.cardLabel === theme.aiLabelText) {
                themeUpdates.push({
                  id: shape.id,
                  type: "handwritten-text",
                  props: {
                    color: theme.aiTextColor,
                    cardBg: theme.aiCardBg,
                    cardBorder: theme.aiCardBorder,
                    cardBorderWidth: theme.aiCardBorderWidth,
                    cardRadius: theme.aiCardRadius,
                    cardShadow: theme.aiCardShadow,
                    cardLabelColor: theme.aiLabelColor,
                  },
                });
              } else if (p.cardBg && p.cardLabel === (theme.userLabelText ?? "YOU")) {
                themeUpdates.push({
                  id: shape.id,
                  type: "handwritten-text",
                  props: {
                    color: theme.userTextColor,
                    cardBg: theme.userCardBg,
                    cardLabelColor: theme.userLabelColor,
                  },
                });
              }
            }
            if (themeUpdates.length > 0) {
              editor.updateShapes(themeUpdates);
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

          // Sync magicPenActive state when tool changes
          const syncMagicState = () => {
            const isMagic = editor.getCurrentToolId() === "magic-draw";
            setMagicPenActive(isMagic);
          };
          editor.on("change", syncMagicState);

          // Track shapes created while magic-draw tool is active.
          // Tint magic-draw strokes neon green so they're visually distinct.
          const MAGIC_INK_COLOR = "light-green";
          let lastMagicDrawId: string | null = null;
          const trackMagicShapes = editor.store.listen((event: any) => {
            if (editor.getCurrentToolId() !== "magic-draw") return;

            const added = Object.values(event.changes.added) as any[];
            for (const record of added) {
              if (record.typeName === "shape" && record.type === "draw") {
                magicShapeIdsRef.current.add(record.id);
                lastMagicDrawId = record.id;
                // Tint stroke neon green
                try {
                  editor.updateShape({
                    id: record.id,
                    type: "draw",
                    props: { color: MAGIC_INK_COLOR },
                  });
                } catch {}
              }
            }

            // Track latest updated draw shape
            const updated = Object.values(event.changes.updated) as any[];
            for (const pair of updated) {
              const after = Array.isArray(pair) ? pair[1] : pair;
              if (after?.typeName === "shape" && after.type === "draw") {
                lastMagicDrawId = after.id;
              }
            }
          });

          // Magic pen loop detection via native DOM event.
          // tldraw's pointer events can be unreliable on iPad Safari,
          // but native pointerup/touchend always fire on document.
          // We don't re-check getCurrentToolId() here because by the
          // time the event fires, tldraw may have already transitioned
          // the tool state. lastMagicDrawId is only set inside the
          // store listener which already gates on magic-draw.
          let loopCheckInFlight = false;
          const checkMagicLoop = () => {
            if (!lastMagicDrawId || loopCheckInFlight) return;

            const hasThinking = editor.getCurrentPageShapes().some(
              (s: any) => s.type === "thinking-indicator"
            );
            if (hasThinking) return;

            const idToCheck = lastMagicDrawId;
            loopCheckInFlight = true;

            // Try at increasing delays — iPad shape finalization timing varies
            const tryCheck = (delay: number) => {
              setTimeout(async () => {
                const shape = editor.getShape(idToCheck as any);
                if (shape && analyzeForSingleLoop(shape as any)) {
                  loopCheckInFlight = false;
                  lastMagicDrawId = null;
                  console.log("Magic pen loop detected — triggering session");
                  if (magicWandCallbackRef.current) {
                    try {
                      await magicWandCallbackRef.current(shape, editor);
                    } catch (error) {
                      console.error("Error in magic pen callback:", error);
                    }
                  }
                } else if (delay < 500) {
                  // Shape may not be finalized yet — retry
                  tryCheck(delay * 2);
                } else {
                  loopCheckInFlight = false;
                }
              }, delay);
            };

            tryCheck(50);
          };

          document.addEventListener("pointerup", checkMagicLoop);
          document.addEventListener("touchend", checkMagicLoop);

          // Auto-revert to pen after other tools (not magic-draw)
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

          // Tap-to-cancel/retry on thinking indicator + magic pen loop detection
          const TAP_CANCEL_THRESHOLD = 15;
          let tapStartPagePoint: { x: number; y: number } | null = null;
          let thinkingBoundsOnDown: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
          let wasCancelledOnDown = false;

          editor.on("event", async (info) => {
            if (info.type === "pointer" && info.name === "pointer_down") {
              tapStartPagePoint = info.point ? { x: info.point.x, y: info.point.y } : null;
              thinkingBoundsOnDown = null;

              const allShapes = editor.getCurrentPageShapes();
              const thinkingShape = allShapes.find(
                (s: any) => s.type === "thinking-indicator"
              );
              if (thinkingShape) {
                const bounds = editor.getShapeGeometry(thinkingShape).bounds;
                thinkingBoundsOnDown = {
                  minX: thinkingShape.x + bounds.minX,
                  maxX: thinkingShape.x + bounds.maxX,
                  minY: thinkingShape.y + bounds.minY,
                  maxY: thinkingShape.y + bounds.maxY,
                };
                wasCancelledOnDown = !!(thinkingShape as any).props?.cancelled;
              }
            }

            if (info.type === "pointer" && info.name === "pointer_up") {
              const isCancelledState = wasCancelledOnDown;

              // Tap-to-cancel/retry on thinking indicator
              if (tapStartPagePoint && thinkingBoundsOnDown && info.point) {
                const camera = editor.getCamera();
                const pageX = (info.point.x - camera.x) / camera.z;
                const pageY = (info.point.y - camera.y) / camera.z;
                const startPageX = (tapStartPagePoint.x - camera.x) / camera.z;
                const startPageY = (tapStartPagePoint.y - camera.y) / camera.z;

                const dist = Math.sqrt(
                  (pageX - startPageX) ** 2 + (pageY - startPageY) ** 2
                );

                if (dist < TAP_CANCEL_THRESHOLD) {
                  const b = thinkingBoundsOnDown;
                  if (pageX >= b.minX && pageX <= b.maxX && pageY >= b.minY && pageY <= b.maxY) {
                    if (isCancelledState) {
                      if (retryClaudeCodeRef.current) retryClaudeCodeRef.current();
                    } else {
                      if (cancelClaudeCodeRef.current) cancelClaudeCodeRef.current();
                    }

                    const drawShapes = editor.getCurrentPageShapes().filter(
                      (s: any) => s.type === "draw"
                    );
                    const lastStroke = drawShapes[drawShapes.length - 1];
                    if (lastStroke) {
                      try { editor.deleteShape(lastStroke.id); } catch {}
                    }
                  }
                }
              }

              tapStartPagePoint = null;
              thinkingBoundsOnDown = null;

              // Magic pen loop detection handled by native DOM pointerup/touchend.
            }
          });

          // Cleanup
          return () => {
            if (autoSaverRef.current) {
              autoSaverRef.current.forceSave();
            }
            if (responseRendererRef.current) {
              responseRendererRef.current.clearResponses();
            }
            unsubscribe();
            trackMagicShapes();
            document.removeEventListener("pointerup", checkMagicLoop);
            document.removeEventListener("touchend", checkMagicLoop);
            editor.off("change", syncMagicState);
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
      </TldrawErrorBoundary>

      {/* Mystic Smoke filter for magic pen strokes */}
      {!theme && <MysticSmokeFilter shapeIds={magicShapeIds} />}

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

      {!showSessionPanel && (
        <SessionPanelToggle onClick={() => setShowSessionPanel(true)} darkMode={darkMode} />
      )}
      <SessionPanel
        editorRef={editorRef}
        open={showSessionPanel}
        onClose={() => setShowSessionPanel(false)}
        darkMode={darkMode}
      />
    </div>
  );
}

function MagicPenToolButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <TldrawUiToolbarButton
      type="tool"
      data-testid="magic-pen-tool"
      data-value="magic-draw"
      aria-pressed={active ? "true" : "false"}
      onClick={onClick}
      aria-label="Magic pen"
      title="Magic Pen"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2C7.5 2 6.2 2.8 5.6 4C4.4 4.2 3.5 5.2 3.5 6.5C3.5 7 3.6 7.4 3.9 7.8C3.3 8.3 3 9.1 3 9.8C3 10.8 3.6 11.6 4.5 12C4.5 13.2 5.5 14.2 6.8 14.2C7.5 14.2 8.1 13.9 8.5 13.4" />
        <path d="M9 2C10.5 2 11.8 2.8 12.4 4C13.6 4.2 14.5 5.2 14.5 6.5C14.5 7 14.4 7.4 14.1 7.8C14.7 8.3 15 9.1 15 9.8C15 10.8 14.4 11.6 13.5 12C13.5 13.2 12.5 14.2 11.2 14.2C10.5 14.2 9.9 13.9 9.5 13.4" />
        <line x1="9" y1="2" x2="9" y2="16" />
        <path d="M7.5 16C7.5 15.2 8.2 14.5 9 14.5C9.8 14.5 10.5 15.2 10.5 16" />
      </svg>
    </TldrawUiToolbarButton>
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
