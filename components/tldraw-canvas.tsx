"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Tldraw,
  TLUiOverrides,
  loadSnapshot,
  TLShape,
  createShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import { Wand2 } from "lucide-react";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import {
  MessageBubbleShapeUtil,
  WebsiteBubbleShapeUtil,
  HandwrittenTextShapeUtil,
  InteractionBubbleShapeUtil,
  ThinkingIndicatorShapeUtil,
} from "@/lib/shapes";

import { analyzeForSingleLoop } from "@/lib/gesture-detection";
import {
  isShapeInLoop,
  rectsIntersect,
  computeReplyLayout,
  RESPONSE_CARD_WIDTH,
  type Rect,
  type BranchDirection,
} from "@/lib/magic-loop-layout";
import { MysticSmokeFilter } from "@/components/explore/mystic-smoke-filter";
import { MagicDrawTool } from "@/lib/magic-draw-tool";
import { cancelClaudeCodeRef, retryClaudeCodeRef, dismissCancelledRef } from "@/lib/shapes/thinking-indicator-shape";
import {
  loadCanvasData,
  CanvasAutoSaver,
  clearCanvasData,
  saveViewport,
  loadViewport,
  getCanvasRev,
  setCanvasRev,
} from "@/lib/canvas-persistence";
import { getConnectorClient } from "@/lib/connector-client";
import { ConnectorStatusPill, useConnectorStatus } from "@/components/connector-status";
import { loadContacts } from "@/lib/contact-storage";
import {
  getLastMessageCheck,
  updateLastMessageCheck,
} from "@/lib/message-tracking";
import type { SmartMessage } from "@/lib/models";
import { FirstRunOverlay, type TutorialStep } from "@/components/first-run-overlay";
import { useOnboardingActions } from "@/hooks/use-onboarding-actions";
import { shouldShowOnboarding, markFirstRunDone } from "@/lib/onboarding-state";
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

export default function TldrawCanvas({
  theme,
  storageKey,
  darkMode,
  onEditorMount,
}: {
  theme?: WoodpeckerCanvasTheme;
  storageKey?: string;
  darkMode?: boolean;
  /** Called once the editor is mounted and the saved snapshot is loaded */
  onEditorMount?: (editor: any) => void;
}) {
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
  const [magicShapeIds] = useState<string[]>([]);

  // Session panel state
  const [showSessionPanel, setShowSessionPanel] = useState(false);

  // Connector link (status pill + cross-device canvas pull)
  const { status: connectorStatus, info: connectorInfo } = useConnectorStatus();
  const remoteCanvasLoadedRef = useRef(false);
  useEffect(() => {
    if (connectorStatus !== "connected" || remoteCanvasLoadedRef.current) return;
    remoteCanvasLoadedRef.current = true;
    const key = storageKey ?? "woodpecker-canvas-data";
    getConnectorClient()
      .loadCanvas(key)
      .then(({ rev, snapshot }) => {
        const editor = editorRef.current;
        if (!snapshot || !editor) return;
        if (rev <= getCanvasRev(key)) return; // local copy is as new or newer
        try {
          loadSnapshot(editor.store, snapshot as any);
          setCanvasRev(rev, key);
          console.log(`📥 Loaded canvas rev ${rev} from connector`);
        } catch (error) {
          console.error("Failed to load canvas from connector:", error);
        }
      });
  }, [connectorStatus, storageKey]);

  // First-run tutorial state (null = hidden)
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const onboardingActions = useOnboardingActions();

  // Tutorial "write" step: advance to "circle" once the user has typed or
  // handwritten something and paused for a beat
  useEffect(() => {
    if (tutorialStep !== "write") return;
    const editor = editorRef.current;
    if (!editor) return;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = editor.store.listen(
      (event: any) => {
        const records = [
          ...Object.values(event.changes.added),
          ...Object.values(event.changes.updated).map((pair: any) =>
            Array.isArray(pair) ? pair[1] : pair
          ),
        ] as any[];
        const wroteSomething = records.some(
          (r) => r?.typeName === "shape" && (r.type === "draw" || r.type === "text")
        );
        if (wroteSomething) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            setTutorialStep((s) => (s === "write" ? "circle" : s));
          }, 2500);
        }
      },
      { source: "user", scope: "document" }
    );
    return () => {
      unsubscribe();
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [tutorialStep]);

  // Tutorial "reply" step: the user has completed the loop — persist that
  // and let the final hint linger briefly
  useEffect(() => {
    if (tutorialStep !== "reply") return;
    markFirstRunDone();
    const timer = setTimeout(() => setTutorialStep(null), 15000);
    return () => clearTimeout(timer);
  }, [tutorialStep]);

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
        const loopRect: Rect = { minX, minY, maxX, maxY };

        const getPageRect = (shape: any): Rect | null => {
          const b = eventEditor.getShapePageBounds(shape);
          if (!b) return null;
          return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
        };

        // Get all shapes and find ones actually circled by the loop.
        // AI cards use generous bbox overlap — circling writing at the edge
        // of a card must still capture the card so its session resumes.
        // Everything else (ink) requires polygon containment so neighbouring
        // strokes don't pollute the bounds the reply is anchored to.
        // Connector arrows and thinking indicators are never content.
        const isAiCard = (s: any) => s.type === "handwritten-text" && s.props?.cardBg;
        const allShapes = eventEditor.getCurrentPageShapes();
        const shapesInLoop = allShapes.filter((shape: any) => {
          if (shape.id === stroke.id) return false;
          if (shape.type === "arrow" || shape.type === "thinking-indicator") return false;
          const rect = getPageRect(shape);
          if (!rect) return false;
          return isAiCard(shape)
            ? rectsIntersect(rect, loopRect)
            : isShapeInLoop(rect, loopRect, allPoints);
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

        // The AI card the reply branches from. Uses the same bottom-most-first
        // ordering as the session selection above so the connector anchor and
        // the resumed session always agree.
        const cardsInLoop = shapesInLoop
          .filter(isAiCard)
          .sort((a: any, b: any) => b.y - a.y);
        const aiCardForLayout =
          aiResponseShape ?? (cardsInLoop.length > 0 ? cardsInLoop[0] : undefined);

        // Bounds of the user's circled ink (everything that isn't a card) —
        // the reply is anchored to where the user actually wrote, falling
        // back to the loop bounds when only cards were circled.
        let inkRect: Rect | null = null;
        for (const s of shapesInLoop) {
          if (isAiCard(s)) continue;
          const rect = getPageRect(s);
          if (!rect) continue;
          inkRect = inkRect
            ? {
                minX: Math.min(inkRect.minX, rect.minX),
                minY: Math.min(inkRect.minY, rect.minY),
                maxX: Math.max(inkRect.maxX, rect.maxX),
                maxY: Math.max(inkRect.maxY, rect.maxY),
              }
            : rect;
        }

        // Position the reply chain — anchored to the writing, not the card
        let bubbleX = minX;
        let bubbleY = maxY + FRAME_PADDING + RESPONSE_GAP;
        let direction: BranchDirection | undefined;
        const branchAnchorY: number | undefined = undefined;

        if (theme) {
          const obstacles = allShapes
            .filter((s: any) =>
              ["handwritten-text", "thinking-indicator", "message-bubble", "website-bubble", "interaction-bubble"].includes(s.type)
            )
            .map(getPageRect)
            .filter(Boolean) as Rect[];

          const layout = computeReplyLayout({
            loop: loopRect,
            ink: inkRect,
            sourceCard: aiCardForLayout ? getPageRect(aiCardForLayout) : null,
            obstacles,
          });
          bubbleX = layout.x;
          bubbleY = layout.y;
          direction = layout.direction;

          // Bring the reply into view if the (possibly nudged) position
          // landed outside the current viewport
          try {
            const vp = eventEditor.getViewportPageBounds();
            const visible =
              bubbleX < vp.maxX &&
              bubbleX + RESPONSE_CARD_WIDTH > vp.minX &&
              bubbleY < vp.maxY &&
              bubbleY + 100 > vp.minY;
            if (!visible) {
              eventEditor.centerOnPoint(
                { x: bubbleX + RESPONSE_CARD_WIDTH / 2, y: bubbleY + 150 },
                { animation: { duration: 400 } }
              );
            }
          } catch {}
        }

        // Determine source shape for connecting arrow.
        // Themed continuations use the AI card; unthemed uses the frame.
        let sourceId = aiCardForLayout?.id ?? frameId;
        let branchDir: BranchDirection | undefined =
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

        // Tutorial: a successful circle completes the tour
        setTutorialStep((s) => (s === "circle" || s === "write" ? "reply" : s));

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
    [originalStrokeProps, executeClaudeCode, resizeAndEncodeImage, theme]
  );

  // Handler for onboarding actions
  const handleOnboardingAction = useCallback(
    (actionType: string, additionalData?: any) => {
      onboardingActions.checkActionForOnboarding(actionType, additionalData);
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
    const next = editor.getCurrentToolId() === "magic-draw" ? "draw" : "magic-draw";
    editor.setCurrentTool(next);
    // Set state directly — the editor's change event doesn't reliably fire
    // for the magic-draw → draw transition, which left the FAB looking
    // armed after toggling off.
    setMagicPenActive(next === "magic-draw");
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

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <TldrawErrorBoundary>
      <Tldraw
        shapeUtils={shapeUtils}
        tools={customTools}
        overrides={uiOverrides}
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

          // Snapshot + viewport are in — hand the editor to the wrapper
          // (the Daily Drive shell uses this to seed/capture canvases)
          if (onEditorMount) {
            try {
              onEditorMount(editor);
            } catch (error) {
              console.error("onEditorMount callback failed:", error);
            }
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

          // Check if the first-run tutorial should be shown
          setTimeout(() => {
            if (shouldShowOnboarding()) {
              setTutorialStep("welcome");
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
          // Session-scope store listener: currentToolId lives on the session
          // records, and the editor "change" event proved unreliable for the
          // magic-draw → draw transition (FAB stayed lit after toggling off).
          const syncMagicState = () => {
            const isMagic = editor.getCurrentToolId() === "magic-draw";
            setMagicPenActive(isMagic);
          };
          const stopSyncMagicState = editor.store.listen(syncMagicState, {
            scope: "session",
          });

          // Track shapes created while magic-draw tool is active.
          // Tint magic-draw strokes neon green so they're visually distinct.
          const MAGIC_INK_COLOR = "light-green";
          let lastMagicDrawId: string | null = null;
          // Strokes that already triggered (or are triggering) a session.
          // The gesture handler recolors/deletes its stroke, which fires
          // store updates — without this set those updates would re-arm
          // lastMagicDrawId with a dead id, and every later pointerup/tap
          // would burn ~1.5s retrying a deleted shape, silently eating the
          // pointerup of any circle drawn in that window (the "works once,
          // then broken" iPad/Safari bug).
          const consumedMagicIds = new Set<string>();
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

            // Track latest updated draw shape — only strokes the magic pen
            // created and that haven't already triggered a session
            const updated = Object.values(event.changes.updated) as any[];
            for (const pair of updated) {
              const after = Array.isArray(pair) ? pair[1] : pair;
              if (
                after?.typeName === "shape" &&
                after.type === "draw" &&
                magicShapeIdsRef.current.has(after.id) &&
                !consumedMagicIds.has(after.id)
              ) {
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
          let loopCheckGeneration = 0;
          let thinkingWaitTimer: ReturnType<typeof setTimeout> | null = null;

          // Try at increasing delays — iPad shape finalization timing varies.
          // A newer stroke supersedes any pending ladder (generation check),
          // so a slow ladder can never swallow the pointerup of a new circle.
          const runLoopCheck = (idToCheck: string, delay: number, gen: number) => {
            setTimeout(async () => {
              if (gen !== loopCheckGeneration) return; // superseded by a newer stroke
              const shape = editor.getShape(idToCheck as any);
              if (!shape) return; // stroke was deleted — nothing to check
              if (analyzeForSingleLoop(shape as any)) {
                consumedMagicIds.add(idToCheck);
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
                runLoopCheck(idToCheck, delay * 2, gen);
              }
            }, delay);
          };

          const checkMagicLoop = () => {
            if (!lastMagicDrawId) return;

            const hasThinking = editor.getCurrentPageShapes().some(
              (s: any) => s.type === "thinking-indicator"
            );
            if (hasThinking) {
              // A session is running — keep the newest stroke queued and
              // re-check once the indicator clears, instead of silently
              // dropping the gesture and leaving a dead stroke behind
              if (thinkingWaitTimer) clearTimeout(thinkingWaitTimer);
              thinkingWaitTimer = setTimeout(() => {
                thinkingWaitTimer = null;
                checkMagicLoop();
              }, 500);
              return;
            }

            // Consume the id now — a failed check must not leave a stale id
            // behind to spawn dead retry ladders on every later pointerup
            const idToCheck = lastMagicDrawId;
            lastMagicDrawId = null;
            runLoopCheck(idToCheck, 50, ++loopCheckGeneration);
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

                    // Remove the magic pen stroke that started this session —
                    // never the user's handwriting (magic strokes only)
                    const drawShapes = editor.getCurrentPageShapes().filter(
                      (s: any) => s.type === "draw" && magicShapeIdsRef.current.has(s.id)
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
            if (thinkingWaitTimer) {
              clearTimeout(thinkingWaitTimer);
              thinkingWaitTimer = null;
            }
            loopCheckGeneration++; // abort any pending loop-check ladder
            document.removeEventListener("pointerup", checkMagicLoop);
            document.removeEventListener("touchend", checkMagicLoop);
            stopSyncMagicState();
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

      <FirstRunOverlay
        step={tutorialStep}
        onStart={() => setTutorialStep("write")}
        onSkip={() => {
          setTutorialStep(null);
          markFirstRunDone();
        }}
        darkMode={darkMode}
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

      <ConnectorStatusPill
        status={connectorStatus}
        info={connectorInfo}
        darkMode={darkMode}
      />

      <MagicPenFab
        active={magicPenActive}
        onClick={handleToggleMagicPen}
        darkMode={darkMode}
      />
    </div>
  );
}

/**
 * Floating action button for the magic pen — separated from the tldraw
 * toolbar so the product's signature action stands on its own at the
 * bottom-right. Filled with the brand's green gradient so it reads as
 * THE action on the canvas; breathes a glow ring while armed. Keeps
 * data-testid="magic-pen-tool": the first-run tutorial pulse and the
 * verify-e2e pipeline both target it.
 */
function MagicPenFab({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
  darkMode?: boolean;
}) {
  return (
    <>
      <style>{`
        @keyframes wp-fab-armed {
          0%, 100% { box-shadow: 0 0 0 0 rgba(94, 234, 212, 0.55), 0 12px 32px -12px rgba(94, 234, 212, 0.65); }
          50% { box-shadow: 0 0 0 14px rgba(94, 234, 212, 0), 0 12px 32px -12px rgba(94, 234, 212, 0.65); }
        }
      `}</style>
      <button
        type="button"
        data-testid="magic-pen-tool"
        data-value="magic-draw"
        aria-pressed={active ? "true" : "false"}
        aria-label="Magic pen"
        title="Magic Pen"
        onClick={onClick}
        style={{
          position: "fixed",
          // sits above tldraw's "made with tldraw" watermark in the corner
          bottom: 64,
          right: 20,
          zIndex: 900,
          width: 64,
          height: 64,
          display: "grid",
          placeItems: "center",
          borderRadius: 999,
          cursor: "pointer",
          border: "none",
          background: "linear-gradient(135deg, #9ff0c6, #5eead4)",
          color: "#06231c",
          boxShadow: active
            ? undefined
            : "0 0 0 1px rgba(94, 234, 212, 0.35), 0 12px 32px -12px rgba(94, 234, 212, 0.55)",
          animation: active ? "wp-fab-armed 1.4s ease-in-out infinite" : undefined,
          transform: active ? "scale(1.07) rotate(-8deg)" : undefined,
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        <Wand2 size={28} strokeWidth={2} />
      </button>
    </>
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
