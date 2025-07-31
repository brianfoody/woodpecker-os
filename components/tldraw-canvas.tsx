"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Tldraw,
  TLUiOverrides,
  loadSnapshot,
  createShapeId,
  toRichText,
  TLShape,
} from "tldraw";
import "tldraw/tldraw.css";
// import { debounce } from "lodash";
import { AIActionsContextMenu } from "@/components/ai-actions-context-menu";
import type { AIAction } from "@/lib/models";
import { PointSpinner } from "@/components/point-spinner";
import {
  AIBubbleShapeUtil,
  MessageBubbleShapeUtil,
  WebsiteBubbleShapeUtil,
  HandwrittenTextShapeUtil,
} from "@/lib/shapes";

import { analyzeForSingleLoop } from "@/lib/gesture-detection";
import { HoldDetector } from "@/lib/hold-detection";
import { sendToAI } from "@/lib/ai-processing";
import { startWebsiteJobPolling, blobToBase64 } from "@/lib/website-polling";
// Removed direct import of askAI - now using API endpoint
import {
  loadCanvasData,
  CanvasAutoSaver,
  clearCanvasData,
} from "@/lib/canvas-persistence";
import { toast } from "@/hooks/use-toast";
import { saveContact, loadContacts } from "@/lib/contact-storage";
import {
  getLastMessageCheck,
  updateLastMessageCheck,
} from "@/lib/message-tracking";
import type { SmartMessage } from "@/lib/models";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { useOnboardingActions } from "@/hooks/use-onboarding-actions";
import { shouldShowOnboarding, startOnboarding } from "@/lib/onboarding-state";
import { HandwritingContextManager } from "@/lib/handwriting-context-manager";
import { HandwrittenResponseRenderer } from "@/lib/handwritten-response-renderer";

// Hold detection
let holdDetector: HoldDetector | null = null;

// Gesture detection state
let gestureCheckTimer: NodeJS.Timeout | null = null;
const GESTURE_CHECK_DELAY = 300; // Wait 300ms before checking for gesture

// Global callback for magic wand gesture - will be set by React component
let globalMagicWandCallback:
  | ((
      stroke: any,
      editor: any,
      holdPosition?: { x: number; y: number }
    ) => Promise<void>)
  | null = null;

// Global callback for onboarding actions - will be set by React component
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
  console.log("🪄 Magic wand gesture triggered!");
  console.log("🔍 Current callback state:", !!globalMagicWandCallback);

  if (globalMagicWandCallback) {
    console.log(
      "🚀 Calling global magic wand callback with stroke:",
      latestStroke.id
    );
    try {
      await globalMagicWandCallback(latestStroke, editor, holdPosition);
      console.log("✅ Magic wand callback completed successfully");
    } catch (error) {
      console.error("❌ Error in magic wand callback:", error);
    }
  } else {
    console.error("❌ No magic wand callback registered!");
    // console.error("🔍 Debugging - isEditorSetup:", isEditorSetup);
  }
}

// Helper function to calculate AI bubble dimensions based on content
function calculateAIBubbleDimensions(content: string) {
  // Reduced by additional 30% for more compact bubbles
  const minWidth = 180; // 30% smaller: 255 * 0.7 = 178.5 ≈ 180
  const minHeight = 55; // 30% smaller: 75 * 0.7 = 52.5 ≈ 55
  const maxWidth = 470; // 30% smaller: 675 * 0.7 = 472.5 ≈ 470
  const maxHeight = 350; // 30% smaller: 500 * 0.7 = 350

  // Character-based estimation with more compact sizing
  const charCount = content.length;
  const lineCount = Math.max(1, content.split("\n").length);

  // Fewer characters per line for more compact bubbles
  const estimatedCharsPerLine = 40; // Reduced from 56 for smaller bubbles
  const estimatedWidth = Math.min(
    maxWidth,
    Math.max(minWidth, estimatedCharsPerLine * 4.2 + 50) // Reduced multiplier and padding
  );

  // Calculate height with compact sizing
  const actualCharsPerLine = Math.max(1, (estimatedWidth - 50) / 4.2);
  const wrappedLines = Math.ceil(charCount / actualCharsPerLine);
  const totalLines = Math.max(lineCount, wrappedLines);

  // Reduced line height and padding for more compact bubbles
  const estimatedHeight = Math.min(
    maxHeight,
    Math.max(minHeight, totalLines * 11 + 50) // Reduced line height and padding by 30%
  );

  return {
    w: Math.round(estimatedWidth),
    h: Math.round(estimatedHeight),
  };
}

export default function TldrawCanvas() {
  const editorRef = useRef<any>(null);
  const autoSaverRef = useRef<CanvasAutoSaver | null>(null);
  const handwritingManagerRef = useRef<HandwritingContextManager | null>(null);
  const responseRendererRef = useRef<HandwrittenResponseRenderer | null>(null);
  const isProcessingHandwritingResponseRef = useRef(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuActions, setContextMenuActions] = useState<AIAction[]>([]);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });
  const [spinnerPosition, setSpinnerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [originalStrokeProps, setOriginalStrokeProps] = useState<{
    color: string;
    size: string;
  } | null>(null);
  const [aiProcessingAborted, setAiProcessingAborted] = useState(false);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingActions = useOnboardingActions();

  const [currentImageSummary, setCurrentImageSummary] = useState<string>("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentCapturedShapes, setCurrentCapturedShapes] = useState<any[]>([]);
  const [currentShapesForRemoval, setCurrentShapesForRemoval] = useState<any[]>(
    []
  );
  const [currentCapturedImageBlob, setCurrentCapturedImageBlob] =
    useState<Blob | null>(null);
  const [currentBubbleDimensions, setCurrentBubbleDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 350, height: 150 });
  const [currentCircledAreaCenter, setCurrentCircledAreaCenter] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

  // Message polling state
  const [isPollingEnabled, setIsPollingEnabled] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Debug function for manual polling check (accessible in console)
  const debugPollingState = useCallback(() => {
    if (editorRef.current) {
      const allShapes = editorRef.current.getCurrentPageShapes();
      const messageBubbles = allShapes.filter(
        (shape: TLShape) => shape.type === "message-bubble"
      );
      console.log("🔍 DEBUG Polling State:", {
        totalShapes: allShapes.length,
        messageBubbles: messageBubbles.length,
        isPollingEnabled,
        intervalActive: !!pollingIntervalRef.current,
        messageBubbleTypes: messageBubbles.map((b: TLShape) => ({
          id: b.id,
          type: b.type,
          props: b.props,
        })),
      });
      return {
        totalShapes: allShapes.length,
        messageBubbles: messageBubbles.length,
        isPollingEnabled,
        intervalActive: !!pollingIntervalRef.current,
      };
    } else {
      console.log("🔍 DEBUG: Editor not ready");
      return { error: "Editor not ready" };
    }
  }, [isPollingEnabled]);

  // Manual force polling function
  const forceStartPolling = useCallback(() => {
    console.log("🔧 Force starting polling...");
    setIsPollingEnabled(true);
  }, []);

  const forceStopPolling = useCallback(() => {
    console.log("🔧 Force stopping polling...");
    setIsPollingEnabled(false);
  }, []);

  // Check for message bubbles and enable/disable polling
  const checkMessageBubblesAndUpdatePolling = useCallback(() => {
    if (editorRef.current) {
      const allShapes = editorRef.current.getCurrentPageShapes();
      const messageBubbles = allShapes.filter(
        (shape: TLShape) => shape.type === "message-bubble"
      );
      const hasMessageBubbles = messageBubbles.length > 0;

      // console.log(
      //   `📱 Checking canvas: ${messageBubbles.length} message bubbles found, polling enabled: ${isPollingEnabled}`
      // );

      if (hasMessageBubbles && !isPollingEnabled) {
        console.log("📱 Message bubbles detected, enabling polling");
        setIsPollingEnabled(true);
      } else if (!hasMessageBubbles && isPollingEnabled) {
        console.log("📱 No message bubbles, disabling polling");
        setIsPollingEnabled(false);
      }
    } else {
      console.log("📱 Editor not ready for message bubble check");
    }
  }, [isPollingEnabled]);

  // Process reply scenario when single message bubble is circled
  const processReplyScenario = useCallback(
    async (
      editor: any,
      stroke: any,
      shapesForCapture: any[],
      targetBubble: any,
      captureArea: any,
      minX: number,
      maxX: number,
      minY: number,
      maxY: number
    ) => {
      try {
        console.log("💬 Processing reply scenario...");

        // Set loading state
        setAiProcessingAborted(false);

        // Set spinner position
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const spinnerScreenPos = editor.pageToScreen({
          x: centerX,
          y: centerY,
        });
        setSpinnerPosition(spinnerScreenPos);

        // Highlight the stroke while processing
        setOriginalStrokeProps({
          color: stroke.props.color || "black",
          size: stroke.props.size || "m",
        });

        try {
          editor.updateShape({
            id: stroke.id,
            type: "draw",
            props: {
              color: "blue", // Different color for reply processing
              size: "xl",
            },
          });
        } catch (error) {
          console.log("❌ Failed to highlight stroke:", error);
        }

        // Capture image of the reply content (excluding message bubble)
        const shapeIds = shapesForCapture.map((s: any) => s.id);
        const result = await editor.toImage(shapeIds, {
          format: "png",
          background: true,
          scale: 2,
          padding: 20,
        });

        if (result && result.blob) {
          console.log("✅ Reply content image generated successfully");

          // Check if processing was cancelled
          if (aiProcessingAborted) {
            console.log("🚫 Reply processing was cancelled");
            return;
          }

          // Send to AI for image summary
          const aiResult = await sendToAI(
            result.blob,
            shapesForCapture,
            captureArea
          );

          // Check again after AI processing
          if (aiProcessingAborted) {
            console.log("🚫 Reply processing was cancelled during execution");
            return;
          }

          console.log("💬 Reply content analyzed, extracting message...");

          // Get target bubble contact info
          const targetContact = {
            name: targetBubble.props.personName,
            phoneNumber: targetBubble.props.phoneNumber,
          };

          // Call extractSmartMessage to get the reply message
          const extractResponse = await fetch("/api/extract-message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image_summary: aiResult.sceneDescription,
              contacts: [targetContact], // Only the target contact
            }),
          });

          if (!extractResponse.ok) {
            throw new Error(
              `Extract message API failed with status ${extractResponse.status}`
            );
          }

          const extractResult = await extractResponse.json();

          if (!extractResult.success) {
            throw new Error(extractResult.error || "Message extraction failed");
          }

          const replyMessage = extractResult.message;
          console.log("💬 Reply message extracted:", replyMessage);

          // Replace the existing message bubble with a new one in sending state
          console.log("💬 Replacing bubble with reply:", {
            oldId: targetBubble.id,
            currentProps: targetBubble.props,
            newText: replyMessage.text,
            newState: "sending",
          });

          // Store the bubble position and properties
          const bubblePosition = { x: targetBubble.x, y: targetBubble.y };
          const bubbleProps = targetBubble.props as any;

          // Delete the old bubble
          editor.deleteShape(targetBubble.id);

          // Create a new bubble with the reply in sending state
          const newBubbleId = createShapeId();
          editor.createShapes([
            {
              id: newBubbleId,
              type: "message-bubble",
              x: bubblePosition.x,
              y: bubblePosition.y,
              props: {
                w: bubbleProps.w,
                h: bubbleProps.h,
                personName: bubbleProps.personName,
                phoneNumber: bubbleProps.phoneNumber,
                text: replyMessage.text, // New reply text
                state: "sending" as const, // Sending state to trigger the message
                priority: bubbleProps.priority || "normal",
              },
            },
          ]);

          console.log("✅ Message bubble updated to sending state with reply");

          // Verify the new bubble was created
          setTimeout(() => {
            const updatedShapes = editor.getCurrentPageShapes();
            const newBubble = updatedShapes.find(
              (s: any) => s.id === newBubbleId
            );
            if (newBubble) {
              console.log("🔍 New bubble created:", {
                id: newBubble.id,
                text: (newBubble.props as any).text,
                state: (newBubble.props as any).state,
                phoneNumber: (newBubble.props as any).phoneNumber,
              });
            } else {
              console.log("❌ New bubble not found after creation!");
            }
          }, 100);

          // Remove the captured shapes (they've been sent as a reply)
          shapesForCapture.forEach((shape) => {
            try {
              editor.deleteShape(shape.id);
            } catch (error) {
              console.log(`❌ Failed to remove shape ${shape.id}:`, error);
            }
          });

          console.log("🗑️ Original reply content shapes removed");
        } else {
          console.log("❌ Failed to generate reply content image");
          throw new Error("Failed to generate reply content image");
        }
      } catch (error) {
        console.error("❌ Reply processing failed:", error);

        // Show error toast
        toast({
          variant: "destructive",
          title: "Reply Failed",
          description:
            "Something went wrong while processing your reply. Please try again.",
        });
      } finally {
        // Always clean up the gesture stroke and loading state
        setSpinnerPosition(null);

        try {
          editor.deleteShape(stroke.id);
          console.log("🗑️ Reply gesture stroke removed");
        } catch (error) {
          console.log("❌ Failed to remove gesture stroke:", error);
        }

        // Restore original stroke properties
        if (originalStrokeProps) {
          setOriginalStrokeProps(null);
        }
      }
    },
    [aiProcessingAborted, originalStrokeProps]
  );

  // Function to check for new messages and update message bubbles
  const checkForNewMessages = useCallback(async () => {
    if (!editorRef.current) return;

    try {
      const lastCheck = getLastMessageCheck();
      console.log(
        "📱 Checking for new messages since:",
        lastCheck?.toISOString() || "never"
      );

      const response = await fetch("/api/read-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lastRetrievedAt: lastCheck?.toISOString(),
        }),
      });

      if (!response.ok) {
        console.error("❌ Failed to check messages:", response.status);
        return;
      }

      const result = await response.json();
      if (!result.success) {
        console.error("❌ Message check API error:", result.error);
        return;
      }

      const newMessages: SmartMessage[] = result.messages;
      if (newMessages.length > 0) {
        console.log(`📱 Found ${newMessages.length} new messages`);
      }

      if (newMessages.length > 0) {
        // Update the last check timestamp
        updateLastMessageCheck(new Date(result.lastRetrievedAt));

        // Get all message bubble shapes on the canvas
        const allShapes = editorRef.current.getCurrentPageShapes();
        const messageBubbles = allShapes.filter(
          (shape: TLShape) => shape.type === "message-bubble"
        );

        console.log(
          `📱 Found ${messageBubbles.length} message bubbles on canvas`
        );

        // Load contacts to match phone numbers with names
        const contacts = loadContacts();

        // Check each new message against active message bubbles
        newMessages.forEach((message) => {
          console.log(
            `📱 Processing new message from ${message.phoneNumber}: "${message.text}"`
          );

          // Find matching contact by phone number
          const matchingContact = contacts.find(
            (contact) => contact.phoneNumber === message.phoneNumber
          );

          console.log(
            `📱 Matching contact found:`,
            matchingContact
              ? `${matchingContact.name} (${matchingContact.phoneNumber})`
              : "None"
          );

          if (matchingContact) {
            // Find message bubble for this contact
            const matchingBubble = messageBubbles.find((bubble: TLShape) => {
              const props = bubble.props as any;
              const isPhoneMatch = props.phoneNumber === message.phoneNumber;
              const isStateMatch =
                props.state === "sent" ||
                props.state === "sending" ||
                props.state === "reply-available" ||
                props.state === "reply";

              console.log(`📱 Checking bubble ${bubble.id}:`, {
                bubblePhone: props.phoneNumber,
                messagePhone: message.phoneNumber,
                phoneMatch: isPhoneMatch,
                bubbleState: props.state,
                stateMatch: isStateMatch,
                overallMatch: isPhoneMatch && isStateMatch,
              });

              return isPhoneMatch && isStateMatch;
            });

            if (matchingBubble) {
              console.log(
                `📱 ✅ Updating bubble ${matchingBubble.id} for ${matchingContact.name} with new reply: "${message.text}"`
              );

              // Update the bubble to reply-available state with the actual reply
              editorRef.current.updateShape({
                id: matchingBubble.id,
                type: "message-bubble",
                props: {
                  ...matchingBubble.props,
                  state: "reply-available",
                  replyText: message.text,
                },
              });

              // Check if we need to advance onboarding when a reply is received
              const onboardingUpdate =
                onboardingActions.checkActionForOnboarding("message_received");
              if (onboardingUpdate) {
                console.log("📋 Onboarding: Advanced due to message reply");
              }
            } else {
              console.log(
                `📱 ❌ No matching bubble found for ${matchingContact.name}. Available bubbles:`,
                messageBubbles.map((b: TLShape) => ({
                  id: b.id,
                  phone: (b.props as any).phoneNumber,
                  state: (b.props as any).state,
                  name: (b.props as any).personName,
                }))
              );
            }
          } else {
            console.log(
              `📱 ❌ No contact found for phone ${message.phoneNumber}. Available contacts:`,
              contacts.map((c) => ({ name: c.name, phone: c.phoneNumber }))
            );
          }
        });
      }
    } catch (error) {
      console.error("❌ Error checking for new messages:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Make debug and force functions globally accessible
  useEffect(() => {
    (window as any).debugPollingState = debugPollingState;
    (window as any).forceStartPolling = forceStartPolling;
    (window as any).forceStopPolling = forceStopPolling;
    (window as any).forceCheckBubbles = checkMessageBubblesAndUpdatePolling;
    (window as any).clearMessageTracking = () => {
      localStorage.removeItem("woodpecker-last-message-check");
      console.log(
        "🗑️ Message tracking cleared - next check will get all messages"
      );
    };
    (window as any).getMessageTracking = () => {
      const stored = localStorage.getItem("woodpecker-last-message-check");
      console.log("📱 Current message tracking:", stored || "not set");
      return stored;
    };
    (window as any).testMessageCheck = () => {
      console.log("🧪 Manually triggering message check...");
      checkForNewMessages();
    };
    return () => {
      delete (window as any).debugPollingState;
      delete (window as any).forceStartPolling;
      delete (window as any).forceStopPolling;
      delete (window as any).forceCheckBubbles;
      delete (window as any).clearMessageTracking;
      delete (window as any).getMessageTracking;
      delete (window as any).testMessageCheck;
    };
  }, [
    debugPollingState,
    forceStartPolling,
    forceStopPolling,
    checkMessageBubblesAndUpdatePolling,
    checkForNewMessages,
  ]);

  // Start/stop message polling
  useEffect(() => {
    console.log(
      `📱 Polling state changed: isPollingEnabled=${isPollingEnabled}, intervalActive=${!!pollingIntervalRef.current}`
    );

    if (isPollingEnabled && !pollingIntervalRef.current) {
      console.log("📱 Starting message polling every 10 seconds");

      // Check immediately
      checkForNewMessages();

      // Set up interval
      pollingIntervalRef.current = setInterval(checkForNewMessages, 10000); // 10 seconds
    } else if (!isPollingEnabled && pollingIntervalRef.current) {
      console.log("📱 Stopping message polling");
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
      const editor = editorRef.current;

      console.log(
        "📱 Setting up editor store listener for message bubble detection"
      );

      // Multiple checks to ensure we catch the bubbles
      checkMessageBubblesAndUpdatePolling(); // Immediate check
      setTimeout(() => checkMessageBubblesAndUpdatePolling(), 100); // Short delay
      setTimeout(() => checkMessageBubblesAndUpdatePolling(), 500); // Longer delay
      setTimeout(() => checkMessageBubblesAndUpdatePolling(), 1000); // Even longer delay

      // Listen to shape changes
      const unsubscribe = editor.store.listen(() => {
        // Debounce the check to avoid excessive calls
        setTimeout(() => {
          checkMessageBubblesAndUpdatePolling();
        }, 50);
      });

      return unsubscribe;
    }
  }, [checkMessageBubblesAndUpdatePolling]);

  // Also add a periodic check every 5 seconds as a fallback
  useEffect(() => {
    const fallbackInterval = setInterval(() => {
      if (editorRef.current) {
        console.log("📱 Fallback: Checking for message bubbles");
        checkMessageBubblesAndUpdatePolling();
      }
    }, 5000);

    return () => clearInterval(fallbackInterval);
  }, [checkMessageBubblesAndUpdatePolling]);

  // Extracted function for executing Ask AI action
  const executeAskAI = useCallback(
    async (
      action: AIAction,
      bubblePosition: { x: number; y: number },
      isAutoExecution = false,
      imageSummary?: string, // Optional parameter for direct summary passing
      dimensions?: { width: number; height: number }
    ) => {
      const logPrefix = isAutoExecution
        ? "🤖 Auto-executing"
        : "👤 User executing";
      console.log(`${logPrefix} Ask AI action:`, action);

      const editor = editorRef.current;
      if (!editor) return;

      // Check for existing AI bubbles in the current captured shapes to position new bubble below them
      let adjustedBubblePosition = bubblePosition;
      if (currentCapturedShapes && currentCapturedShapes.length > 0) {
        const aiBubbles = currentCapturedShapes.filter(
          (shape: any) => shape.type === "ai-bubble"
        );
        if (aiBubbles.length > 0) {
          // Find the bottommost AI bubble
          const bottomMostBubble = aiBubbles.reduce(
            (lowest: any, current: any) => {
              const currentBottom = current.y + (current.props?.h || 300);
              const lowestBottom = lowest.y + (lowest.props?.h || 300);
              return currentBottom > lowestBottom ? current : lowest;
            }
          );

          // Position new bubble below the bottommost existing AI bubble with some padding
          const padding = 20;
          adjustedBubblePosition = {
            x: bubblePosition.x,
            y:
              bottomMostBubble.y + (bottomMostBubble.props?.h || 300) + padding,
          };

          console.log(
            "🔧 Positioning new AI bubble below existing AI bubble:",
            {
              existingBubbleBottom:
                bottomMostBubble.y + (bottomMostBubble.props?.h || 300),
              newBubbleY: adjustedBubblePosition.y,
            }
          );
        }
      }

      // Create AI bubble shape in loading state
      const bubbleShapeId = createShapeId();
      console.log("🔧 Creating AI bubble shape with ID:", bubbleShapeId);

      try {
        editor.createShapes([
          {
            id: bubbleShapeId,
            type: "ai-bubble",
            x: adjustedBubblePosition.x,
            y: adjustedBubblePosition.y,
            props: {
              w: dimensions?.width ? dimensions.width * 1.7 : 400, // Use updated default width
              h: dimensions?.height ? dimensions.height * 2 : 150, // Use updated default height
              content: "",
              isLoading: true,
            },
          },
        ]);
        console.log("✅ AI bubble shape created successfully");
      } catch (error) {
        console.error("❌ Failed to create AI bubble shape:", error);
        // Fall back to text shape
        editor.createShapes([
          {
            id: bubbleShapeId,
            type: "text",
            x: adjustedBubblePosition.x,
            y: adjustedBubblePosition.y,
            props: {
              richText: toRichText("Asking AI..."),
            },
          },
        ]);
        return;
      }

      try {
        // Use passed imageSummary or fall back to currentImageSummary
        const summaryToUse = imageSummary || currentImageSummary;

        console.log(
          "🤖 Calling askAI API with summary:",
          summaryToUse.substring(0, 100) + "..."
        );
        console.log("🔍 DEBUG: Using imageSummary param?", !!imageSummary);
        console.log("🔍 DEBUG: Summary length:", summaryToUse.length);
        console.log("🔍 DEBUG: Summary is empty?", summaryToUse === "");

        // Call the askAI API endpoint
        const apiResponse = await fetch("/api/ask-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_summary: summaryToUse,
            task: action.text,
          }),
        });

        if (!apiResponse.ok) {
          throw new Error(
            `API request failed with status ${apiResponse.status}`
          );
        }

        const result = await apiResponse.json();

        if (!result.success) {
          throw new Error(result.error || "API request failed");
        }

        console.log("🎯 AI Response received from API");

        // Strip HTML tags and get clean text content
        const cleanText = result.response.replace(/<[^>]*>/g, "").trim();

        // Calculate appropriate dimensions for the content
        const dimensions = calculateAIBubbleDimensions(cleanText);
        console.log("🔧 Calculated dimensions for AI response:", dimensions);
        console.log("🔧 Content length:", cleanText.length);

        // Update the AI bubble shape with the response and auto-sized dimensions
        editor.updateShape({
          id: bubbleShapeId,
          type: "ai-bubble",
          props: {
            content: cleanText,
            isLoading: false,
            w: dimensions.w,
            h: dimensions.h,
          },
        });
        console.log("🔧 AI bubble shape updated with new dimensions");

        // Check for onboarding progression
        const onboardingUpdate =
          onboardingActions.checkActionForOnboarding("ask_ai");
        if (onboardingUpdate && onboardingUpdate.isActive) {
          setTimeout(() => {
            setShowOnboarding(true);
          }, 3000);
        }
      } catch (error) {
        console.error("❌ Error calling askAI API:", error);

        // Delete the shape and show a toast instead of inline error
        try {
          editor.deleteShape(bubbleShapeId);
        } catch (deleteError) {
          console.error("❌ Failed to delete error shape:", deleteError);
        }

        // Show error toast
        toast({
          variant: "destructive",
          title: "Ooops",
          description: "Something went wrong, give it another whirl.",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentImageSummary, onboardingActions]
  );

  // Extracted function for executing Search action
  const executeSearch = useCallback(
    async (
      action: AIAction,
      bubblePosition: { x: number; y: number },
      isAutoExecution = false,
      imageSummary?: string,
      dimensions?: { width: number; height: number }
    ) => {
      const logPrefix = isAutoExecution
        ? "🤖 Auto-executing"
        : "👤 User executing";
      console.log(`${logPrefix} Search action:`, action);

      const editor = editorRef.current;
      if (!editor) return;

      // Check for existing AI bubbles in the current captured shapes to position new bubble below them
      let adjustedBubblePosition = bubblePosition;
      if (currentCapturedShapes && currentCapturedShapes.length > 0) {
        const aiBubbles = currentCapturedShapes.filter(
          (shape: any) => shape.type === "ai-bubble"
        );
        if (aiBubbles.length > 0) {
          // Find the bottommost AI bubble
          const bottomMostBubble = aiBubbles.reduce(
            (lowest: any, current: any) => {
              const currentBottom = current.y + (current.props?.h || 300);
              const lowestBottom = lowest.y + (lowest.props?.h || 300);
              return currentBottom > lowestBottom ? current : lowest;
            }
          );

          // Position new bubble below the bottommost existing AI bubble with some padding
          const padding = 20;
          adjustedBubblePosition = {
            x: bubblePosition.x,
            y:
              bottomMostBubble.y + (bottomMostBubble.props?.h || 300) + padding,
          };

          console.log(
            "🔧 Positioning new search bubble below existing AI bubble:",
            {
              existingBubbleBottom:
                bottomMostBubble.y + (bottomMostBubble.props?.h || 300),
              newBubbleY: adjustedBubblePosition.y,
            }
          );
        }
      }

      // Create AI bubble shape in loading state
      const bubbleShapeId = createShapeId();
      console.log("🔧 Creating search result bubble with ID:", bubbleShapeId);

      try {
        editor.createShapes([
          {
            id: bubbleShapeId,
            type: "ai-bubble",
            x: adjustedBubblePosition.x,
            y: adjustedBubblePosition.y,
            props: {
              w: dimensions?.width ? dimensions.width * 1.7 : 400,
              h: dimensions?.height ? dimensions.height * 2 : 150,
              content: "",
              isLoading: true,
            },
          },
        ]);
        console.log("✅ Search result bubble created successfully");
      } catch (error) {
        console.error("❌ Failed to create search result bubble:", error);
        return;
      }

      try {
        // Extract the search query from the action text or use the summary
        const searchQuery = action.text || imageSummary || "search query";

        console.log("🔍 Performing search for:", searchQuery);

        // Call the search API endpoint
        const apiResponse = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: searchQuery,
          }),
        });

        if (!apiResponse.ok) {
          throw new Error(
            `Search API request failed with status ${apiResponse.status}`
          );
        }

        const result = await apiResponse.json();

        if (!result.success) {
          throw new Error(result.error || "Search request failed");
        }

        console.log("🎯 Search results received");

        // Check if we have an answer from Tavily search results
        const searchAnswer = result.answer;

        if (!searchAnswer || searchAnswer.trim() === "") {
          console.log("❌ No answer found in search results");

          // Remove the search bubble since we have no answer
          try {
            editor.deleteShape(bubbleShapeId);
          } catch (deleteError) {
            console.error("❌ Failed to delete search bubble:", deleteError);
          }

          // Show toast indicating no results found
          toast({
            variant: "destructive",
            title: "No Results Found",
            description:
              "Sorry, couldn't find any information about your search query.",
          });

          return;
        }

        // Calculate appropriate dimensions for the content
        const dimensions = calculateAIBubbleDimensions(searchAnswer);
        console.log("🔧 Calculated dimensions for search results:", dimensions);

        // Update the AI bubble shape with the search results
        editor.updateShape({
          id: bubbleShapeId,
          type: "ai-bubble",
          props: {
            content: searchAnswer,
            isLoading: false,
            w: dimensions.w,
            h: dimensions.h,
          },
        });
        console.log("🔧 Search result bubble updated with results");
      } catch (error) {
        console.error("❌ Error calling search API:", error);

        // Delete the shape and show a toast instead of inline error
        try {
          editor.deleteShape(bubbleShapeId);
        } catch (deleteError) {
          console.error("❌ Failed to delete error shape:", deleteError);
        }

        // Show error toast
        toast({
          variant: "destructive",
          title: "Search Failed",
          description:
            "Something went wrong with the search. Please try again.",
        });
      }
    },
    [currentCapturedShapes]
  );

  // Extracted function for executing Add Contact action
  const executeAddContact = useCallback(
    async (
      action: AIAction,
      imageSummary: string,
      shapesToRemove: any[],
      isAutoExecution = false
    ) => {
      const logPrefix = isAutoExecution
        ? "🤖 Auto-executing"
        : "👤 User executing";
      console.log(`${logPrefix} Add Contact action:`, action);

      try {
        console.log("📱 DEBUG: imageSummary passed to function:", imageSummary);
        console.log("📱 DEBUG: imageSummary length:", imageSummary.length);

        if (!imageSummary || imageSummary.trim() === "") {
          throw new Error("No image summary available for contact extraction");
        }

        console.log(
          "📱 Calling extractContact API with summary:",
          imageSummary.substring(0, 100) + "..."
        );

        // Call the extract-contact API endpoint
        const apiResponse = await fetch("/api/extract-contact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_summary: imageSummary,
          }),
        });

        if (!apiResponse.ok) {
          throw new Error(
            `API request failed with status ${apiResponse.status}`
          );
        }

        const result = await apiResponse.json();

        if (!result.success) {
          throw new Error(result.error || "API request failed");
        }

        console.log("📱 Contact extracted from API:", result.contact);

        // Check if this is the first contact and if we're updating an existing one
        const existingContacts = loadContacts();
        const isFirstContact = existingContacts.length === 0;

        // Check if we're updating an existing contact (by name)
        const existingContact = existingContacts.find(
          (contact) =>
            contact.name.toLowerCase() === result.contact.name.toLowerCase()
        );
        const isUpdate = !!existingContact;
        const phoneNumberChanged =
          isUpdate &&
          existingContact.phoneNumber !== result.contact.phoneNumber;

        // Save contact to localStorage (this will update if contact exists by phone number)
        saveContact(result.contact);

        // Check for onboarding progression
        const onboardingUpdate = onboardingActions.checkActionForOnboarding(
          "add_contact",
          {
            contactName: result.contact.name,
          }
        );
        if (onboardingUpdate && onboardingUpdate.isActive) {
          setTimeout(() => {
            setShowOnboarding(true);
          }, 3000);
        }

        // Get editor reference for shape operations
        const editor = editorRef.current;
        if (editor && shapesToRemove.length > 0) {
          // Remove the shapes that were used to extract the contact
          console.log(
            `🗑️ Removing ${shapesToRemove.length} shapes after contact extraction`
          );

          // Use tldraw's batch operation to ensure this can be undone as a single action
          editor.batch(() => {
            shapesToRemove.forEach((shape) => {
              try {
                editor.deleteShape(shape.id);
              } catch (error) {
                console.warn("⚠️ Failed to delete shape:", shape.id, error);
              }
            });
          });
        }

        // Show success toast with different message based on the action
        let title: string;
        let description: string;

        if (isUpdate) {
          if (phoneNumberChanged) {
            title = "Contact Updated";
            description = `${result.contact.name}'s phone number has been updated to ${result.contact.phoneNumber}.`;
          } else {
            title = "Contact Updated";
            description = `${result.contact.name} (${result.contact.phoneNumber}) contact information has been refreshed.`;
          }
        } else if (isFirstContact) {
          title = "Contact Added";
          description = `${result.contact.name} (${result.contact.phoneNumber}) has been saved to your contacts (use undo to restore your writing if you wish).`;
        } else {
          title = "Contact Added";
          description = `${result.contact.name} (${result.contact.phoneNumber}) has been saved to your contacts.`;
        }

        toast({
          title,
          description,
        });

        console.log("✅ Contact successfully added and saved");
      } catch (error) {
        console.error("❌ Error executing add contact:", error);

        // Show error toast
        toast({
          variant: "destructive",
          title: "Failed to add contact",
          description:
            "Sorry, there was an error extracting the contact information. Please try again.",
        });
      }
    },
    [onboardingActions]
  );

  // Extracted function for executing Send Message action
  const executeSendMessage = useCallback(
    async (
      action: AIAction,
      imageSummary: string,
      shapesToRemove: any[],
      shapePosition: { x: number; y: number },
      isAutoExecution = false,
      dimensions?: { width: number; height: number }
    ) => {
      const logPrefix = isAutoExecution
        ? "🤖 Auto-executing"
        : "👤 User executing";
      console.log(`${logPrefix} Send Message action:`, action);

      try {
        console.log("💬 DEBUG: imageSummary passed to function:", imageSummary);
        console.log("💬 DEBUG: imageSummary length:", imageSummary.length);

        if (!imageSummary || imageSummary.trim() === "") {
          throw new Error("No image summary available for message extraction");
        }

        // Get editor reference for shape operations
        const editor = editorRef.current;
        if (!editor) {
          throw new Error("Editor not available");
        }

        // Step 1: Create message bubble shape in sending state
        const messageBubbleShapeId = createShapeId();
        console.log(
          "💬 Creating message bubble shape with ID:",
          messageBubbleShapeId
        );

        editor.mark("create-message-bubble");

        editor.createShapes([
          {
            id: messageBubbleShapeId,
            type: "message-bubble",
            x: shapePosition.x,
            y: shapePosition.y,
            props: {
              w: dimensions?.width || 350,
              h: dimensions?.height || 150,
              personName: "...", // Will be updated when message is extracted
              text: "Extracting message...",
              state: "sending",
              priority: "normal",
            },
          },
        ]);

        // Step 2: Delete the scribbled text (this allows undo without removing message bubble)
        editor.mark("delete-original-text");

        if (shapesToRemove.length > 0) {
          console.log(
            `🗑️ Removing ${shapesToRemove.length} shapes after message bubble creation`
          );

          shapesToRemove.forEach((shape) => {
            try {
              editor.deleteShape(shape.id);
            } catch (error) {
              console.warn("⚠️ Failed to delete shape:", shape.id, error);
            }
          });
        }

        // Step 3: Extract message from image summary
        console.log("💬 Calling extractMessage API with summary and contacts");

        const contacts = loadContacts();

        // First check if we have any contacts at all
        if (contacts.length === 0) {
          // Delete the message bubble we just created
          editor.deleteShape(messageBubbleShapeId);

          toast({
            variant: "destructive",
            title: "No Contacts Found",
            description:
              "You need to add contacts first before sending messages. Try adding a contact by circling a name and phone number.",
          });
          return;
        }

        const extractResponse = await fetch("/api/extract-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_summary: imageSummary,
            contacts: contacts,
          }),
        });

        if (!extractResponse.ok) {
          throw new Error(
            `Extract message API failed with status ${extractResponse.status}`
          );
        }

        const extractResult = await extractResponse.json();

        if (!extractResult.success) {
          throw new Error(extractResult.error || "Message extraction failed");
        }

        const message = extractResult.message;
        console.log("💬 Message extracted:", message);

        // Verify the extracted contact exists in our saved contacts
        const matchingContact = contacts.find(
          (contact) =>
            contact.phoneNumber === message.phoneNumber ||
            contact.name.toLowerCase() === message.name.toLowerCase()
        );

        if (!matchingContact) {
          // Delete the message bubble we just created
          editor.deleteShape(messageBubbleShapeId);

          toast({
            variant: "destructive",
            title: "Contact Not Found",
            description: `"${message.name}" is not in your contacts. Please add them as a contact first, or check the spelling.`,
          });
          return;
        }

        console.log("✅ Contact verified:", matchingContact);

        // Step 4: Update message bubble with extracted message
        // Mark a separate undo point for message update so it doesn't revert on text undo
        editor.mark("update-message-content");

        editor.updateShape({
          id: messageBubbleShapeId,
          type: "message-bubble",
          props: {
            personName: message.name,
            text: message.text,
            phoneNumber: message.phoneNumber, // Add phone number for API call
            state: "sending", // Still sending, will be updated by the bubble itself
            priority: "normal",
          },
        });

        // Add a delay to ensure the message update is committed to undo history
        await new Promise((resolve) => setTimeout(resolve, 100));

        console.log(
          "✅ Message bubble created and text extracted successfully"
        );

        // Check for onboarding progression
        const onboardingUpdate =
          onboardingActions.checkActionForOnboarding("send_message");
        if (onboardingUpdate && onboardingUpdate.isActive) {
          setTimeout(() => {
            setShowOnboarding(true);
          }, 3000);
        }

        // Note: The actual sending will be handled by the MessageBubble component itself
        // which will call the /api/send-message endpoint and update its own state
      } catch (error) {
        console.error("❌ Error executing send message:", error);

        // If we created a message bubble, update it to show error state
        // Otherwise show a toast
        const editor = editorRef.current;
        if (editor) {
          try {
            // Try to find any message bubble shapes and update them to failed state
            const allShapes = editor.getCurrentPageShapes();
            const messageBubbles = allShapes.filter(
              (shape: TLShape) => shape.type === "message-bubble"
            );

            if (messageBubbles.length > 0) {
              const latestBubble = messageBubbles[messageBubbles.length - 1];
              editor.updateShape({
                id: latestBubble.id,
                type: "message-bubble",
                props: {
                  ...latestBubble.props,
                  state: "failed",
                  text: "Failed to extract message. Please try again.",
                },
              });
            } else {
              // No message bubble to update, show error toast
              toast({
                variant: "destructive",
                title: "Failed to Send Message",
                description:
                  "Sorry, there was an error extracting the message information. Please try again.",
              });
            }
          } catch (updateError) {
            console.error(
              "❌ Failed to update message bubble with error:",
              updateError
            );
            // Fallback to toast
            toast({
              variant: "destructive",
              title: "Failed to Send Message",
              description:
                "Sorry, there was an error extracting the message information. Please try again.",
            });
          }
        }
      }
    },
    [onboardingActions]
  );

  // Extracted function for executing Read Contact Messages action
  const executeReadContactMessages = async (
    action: AIAction,
    imageSummary: string,
    shapesToRemove: any[],
    shapePosition: { x: number; y: number },
    isAutoExecution = false,
    dimensions?: { width: number; height: number }
  ) => {
    const logPrefix = isAutoExecution
      ? "🤖 Auto-executing"
      : "👤 User executing";
    console.log(`${logPrefix} Read Contact Messages action:`, action);

    try {
      if (!imageSummary || imageSummary.trim() === "") {
        throw new Error(
          "No image summary available for contact identification"
        );
      }

      // Get editor reference for shape operations
      const editor = editorRef.current;
      if (!editor) {
        throw new Error("Editor not available");
      }

      // Load contacts to find the contact
      const contacts = loadContacts();

      if (contacts.length === 0) {
        toast({
          variant: "destructive",
          title: "No Contacts Found",
          description:
            "You need to add contacts first before reading their messages.",
        });
        return;
      }

      // Find the smart contact using AI via API
      console.log("📱 Finding contact from image summary...");

      const findContactResponse = await fetch("/api/find-contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contacts,
          image_summary: imageSummary,
        }),
      });

      if (!findContactResponse.ok) {
        throw new Error(
          `Find contact API failed with status ${findContactResponse.status}`
        );
      }

      const findContactResult = await findContactResponse.json();

      if (!findContactResult.success) {
        throw new Error(findContactResult.error || "Failed to find contact");
      }

      const contact = findContactResult.contact;
      console.log("📱 Found contact:", contact);

      // Verify the contact exists in our saved contacts
      const matchingContact = contacts.find(
        (c) =>
          c.phoneNumber === contact.phoneNumber ||
          c.name.toLowerCase() === contact.name.toLowerCase()
      );

      if (!matchingContact) {
        toast({
          variant: "destructive",
          title: "Contact Not Found",
          description: `"${contact.name}" is not in your contacts. Please add them first.`,
        });
        return;
      }

      // Step 1: Create message bubble shape to show loading state
      const messageBubbleShapeId = createShapeId();
      console.log(
        "📱 Creating message bubble shape with ID:",
        messageBubbleShapeId
      );

      editor.createShapes([
        {
          id: messageBubbleShapeId,
          type: "message-bubble",
          x: shapePosition.x,
          y: shapePosition.y,
          props: {
            w: dimensions?.width || 350,
            h: dimensions?.height || 150,
            personName: matchingContact.name,
            phoneNumber: matchingContact.phoneNumber,
            text: "Loading messages...",
            state: "viewing",
            priority: "normal",
          },
        },
      ]);

      // Step 2: Remove the scribbled text
      if (shapesToRemove.length > 0) {
        console.log(
          `🗑️ Removing ${shapesToRemove.length} shapes after creating message viewer`
        );

        shapesToRemove.forEach((shape) => {
          try {
            editor.deleteShape(shape.id);
          } catch (error) {
            console.warn("⚠️ Failed to delete shape:", shape.id, error);
          }
        });
      }

      // Step 3: Fetch messages from Twilio
      console.log(
        "📱 Fetching messages for contact:",
        matchingContact.phoneNumber
      );

      const response = await fetch("/api/read-contact-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: matchingContact.phoneNumber,
          limit: 10, // Get last 10 messages
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch messages");
      }

      const messages = result.messages;
      console.log(`📱 Retrieved ${messages.length} messages`);

      // Step 4: Update message bubble with fetched messages
      let displayText = "";
      if (messages.length === 0) {
        displayText = "No messages found.";
      } else {
        // Show the last few messages
        const recentMessages = messages.slice(-3); // Last 3 messages
        displayText = recentMessages
          .map((msg: any) => {
            const direction = msg.direction === "inbound" ? "←" : "→";
            const date = new Date(msg.sentAt).toLocaleDateString();
            return `${direction} ${date}: ${msg.text}`;
          })
          .join("\n\n");

        if (messages.length > 3) {
          displayText = `(${
            messages.length - 3
          } more messages)\n\n${displayText}`;
        }
      }

      // Update the message bubble with the actual messages
      editor.updateShape({
        id: messageBubbleShapeId,
        type: "message-bubble",
        props: {
          personName: matchingContact.name,
          phoneNumber: matchingContact.phoneNumber,
          text: displayText,
          state: "viewing",
          priority: "normal",
        },
      });

      console.log("✅ Messages loaded successfully");

      toast({
        title: "Messages Loaded",
        description: `Retrieved ${messages.length} messages from ${matchingContact.name}`,
      });
    } catch (error) {
      console.error("❌ Error executing read contact messages:", error);

      toast({
        variant: "destructive",
        title: "Failed to Read Messages",
        description:
          "Sorry, there was an error retrieving the messages. Please try again.",
      });
    }
  };

  // Extracted function for executing Create Website action
  const executeCreateWebsite = async (
    action: AIAction,
    imageSummary: string,
    shapesToRemove: any[],
    shapePosition: { x: number; y: number },
    capturedImageBlob: Blob,
    isAutoExecution = false,
    dimensions?: { width: number; height: number }
  ) => {
    const logPrefix = isAutoExecution
      ? "🤖 Auto-executing"
      : "👤 User executing";
    console.log(`${logPrefix} Create Website action:`, action);

    let websiteBubbleShapeId: any = null;
    const editor = editorRef.current;

    try {
      if (!imageSummary || imageSummary.trim() === "") {
        throw new Error("No image summary available for website creation");
      }

      if (!capturedImageBlob) {
        throw new Error("No image blob available for website creation");
      }

      // Get editor reference for shape operations
      if (!editor) {
        throw new Error("Editor not available");
      }

      // Step 1: Create website bubble shape in creating state
      websiteBubbleShapeId = createShapeId();
      console.log(
        "🌐 Creating website bubble shape with ID:",
        websiteBubbleShapeId
      );

      const jobId = `website_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      editor.createShapes([
        {
          id: websiteBubbleShapeId,
          type: "website-bubble",
          x: shapePosition.x,
          y: shapePosition.y,
          props: {
            w: dimensions?.width || 400,
            h: dimensions?.height || 200,
            sketchDescription: imageSummary,
            status: "creating",
            progress: 0,
            jobId: jobId,
          },
        },
      ]);

      // Step 2: Keep the original sketch - users want to preserve their notes
      console.log("📝 Preserving original sketch for user reference");

      // Step 3: Convert image to base64 and start job
      console.log(
        "🌐 Converting image to base64 and starting website creation..."
      );

      const imageBase64 = await blobToBase64(capturedImageBlob);

      const response = await fetch("/api/create-website", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: jobId,
          imageBase64: imageBase64,
          description: imageSummary,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to start website creation");
      }

      console.log(`✅ Website creation job started with ID: ${result.jobId}`);

      // Step 4: Start polling for status updates
      startWebsiteJobPolling(websiteBubbleShapeId, result.jobId, editor);

      toast({
        title: "Website Creation Started",
        description:
          "Your website is being created from the sketch. This takes about 5-6 minutes with our new automation!",
      });

      console.log("✅ Website creation process initiated successfully");
    } catch (error) {
      console.error("❌ Error executing create website:", error);

      // Remove the website bubble if it was created
      if (websiteBubbleShapeId) {
        try {
          editor.deleteShape(websiteBubbleShapeId);
          console.log("🗑️ Removed failed website bubble");
        } catch (deleteError) {
          console.warn("⚠️ Failed to remove website bubble:", deleteError);
        }
      }

      toast({
        variant: "destructive",
        title: "Failed to Create Website",
        description:
          "Sorry, there was an error starting the website creation. Please try again.",
      });
    }
  };

  const handleActionSelect = async (action: AIAction) => {
    console.log("🎯 User selected action:", action);
    setContextMenuOpen(false);

    if (action.action === "ask_ai") {
      // Use the center of the circled area for consistent positioning
      const bubblePagePosition = currentCircledAreaCenter;
      console.log(
        "🔧 AI bubble position: using circled area center",
        bubblePagePosition
      );

      await executeAskAI(
        action,
        bubblePagePosition,
        false,
        currentImageSummary,
        currentBubbleDimensions
      );
    } else if (action.action === "add_contact") {
      await executeAddContact(
        action,
        currentImageSummary,
        currentShapesForRemoval,
        false
      );
    } else if (action.action === "send_message") {
      // Use the center of the circled area for consistent positioning
      const bubblePagePosition = currentCircledAreaCenter;
      await executeSendMessage(
        action,
        currentImageSummary,
        currentShapesForRemoval,
        bubblePagePosition,
        false,
        currentBubbleDimensions
      );
    } else if (action.action === "read_contact_messages") {
      // Use the center of the circled area for consistent positioning
      const bubblePagePosition = currentCircledAreaCenter;
      await executeReadContactMessages(
        action,
        currentImageSummary,
        currentShapesForRemoval,
        bubblePagePosition,
        false,
        currentBubbleDimensions
      );
    } else if (action.action === "create_website") {
      // Use the center of the circled area for consistent positioning
      const bubblePagePosition = currentCircledAreaCenter;
      if (currentCapturedImageBlob) {
        await executeCreateWebsite(
          action,
          currentImageSummary,
          currentShapesForRemoval,
          bubblePagePosition,
          currentCapturedImageBlob, // Need to preserve this from magic wand
          false,
          currentBubbleDimensions
        );
      } else {
        console.error(
          "❌ No captured image blob available for website creation"
        );
        toast({
          variant: "destructive",
          title: "Error",
          description:
            "No image captured for website creation. Please try again.",
        });
      }
    } else if (action.action === "search") {
      // Use the center of the circled area for consistent positioning
      const bubblePagePosition = currentCircledAreaCenter;
      await executeSearch(
        action,
        bubblePagePosition,
        false,
        currentImageSummary,
        currentBubbleDimensions
      );
    } else {
      // TODO: Implement other action types
      console.log("🚧 Action type not yet implemented:", action.action);
    }
  };

  const handleMagicWandGesture = useCallback(
    async (
      stroke: any,
      eventEditor: any,
      holdPosition?: { x: number; y: number }
    ) => {
      console.log("🎯 PROCESSING magic wand gesture for stroke:", stroke.id);
      console.log("🎯 Hold position received:", holdPosition);

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

        console.log(
          `🎯 Loop bounds: x(${minX.toFixed(1)} - ${maxX.toFixed(
            1
          )}), y(${minY.toFixed(1)} - ${maxY.toFixed(1)})`
        );

        // Get all shapes and find ones inside the loop
        const allShapes = eventEditor.getCurrentPageShapes();
        const shapesInLoop = allShapes.filter((shape: any) => {
          if (shape.id === stroke.id) return false; // Don't include the loop itself

          // Get shape bounds
          const bounds = eventEditor.getShapeGeometry(shape).bounds;
          const shapeMinX = shape.x + bounds.minX;
          const shapeMaxX = shape.x + bounds.maxX;
          const shapeMinY = shape.y + bounds.minY;
          const shapeMaxY = shape.y + bounds.maxY;

          // Check if shape overlaps with loop bounds
          const overlaps = !(
            shapeMaxX < minX ||
            shapeMinX > maxX ||
            shapeMaxY < minY ||
            shapeMinY > maxY
          );

          return overlaps;
        });

        console.log(`📦 Found ${shapesInLoop.length} shapes inside the loop:`);
        shapesInLoop.forEach((shape: any, index: number) => {
          console.log(
            `  ${index + 1}. ${shape.type} (id: ${shape.id.slice(-8)})`
          );
          if (shape.type === "text") {
            console.log(`     Text: "${(shape.props as any).text}"`);
          } else if (shape.type === "message-bubble") {
            console.log(
              `     Message bubble: ${(shape.props as any).personName}`
            );
          }
        });

        if (shapesInLoop.length === 0) {
          console.log("🚫 Ignoring empty loop gesture");
          // Just remove the gesture stroke
          try {
            eventEditor.deleteShape(stroke.id);
          } catch (error) {
            console.log("❌ Failed to remove gesture shape:", error);
          }
          return;
        }

        // Check if this is a reply scenario (single message bubble circled)
        const messageBubbles = shapesInLoop.filter(
          (shape: any) => shape.type === "message-bubble"
        );
        const isReplyScenario = messageBubbles.length === 1;

        if (isReplyScenario) {
          console.log(
            "💬 Reply scenario detected - single message bubble circled"
          );

          const targetBubble = messageBubbles[0];
          console.log(
            `💬 Target bubble: ${(targetBubble.props as any).personName} (${
              (targetBubble.props as any).phoneNumber
            })`
          );

          // Remove the message bubble from shapes to be captured
          const shapesForCapture = shapesInLoop.filter(
            (shape: any) => shape.type !== "message-bubble"
          );

          if (shapesForCapture.length === 0) {
            console.log(
              "🚫 No content to reply with - only message bubble was circled"
            );
            try {
              eventEditor.deleteShape(stroke.id);
            } catch (error) {
              console.log("❌ Failed to remove gesture shape:", error);
            }
            return;
          }

          console.log(
            `💬 Capturing ${shapesForCapture.length} shapes for reply (excluding message bubble)`
          );

          // Define capture area for reply processing
          const padding = 20;
          const replyArea = {
            x: minX - padding,
            y: minY - padding,
            w: maxX - minX + padding * 2,
            h: maxY - minY + padding * 2,
          };

          // Continue with modified shapes list for reply processing
          await processReplyScenario(
            eventEditor,
            stroke,
            shapesForCapture,
            targetBubble,
            replyArea,
            minX,
            maxX,
            minY,
            maxY
          );
          return;
        }

        // Set loading state
        setAiProcessingAborted(false);

        // Set spinner position at the exact user press location (if available)
        let spinnerScreenPos;
        if (holdPosition) {
          console.log("🔍 Raw hold position received:", holdPosition);
          // The hold position might already be in the correct coordinate system
          // Let's try using it directly as screen coordinates first
          spinnerScreenPos = holdPosition;
          console.log(
            `🎯 Using hold position directly as screen coords: (${holdPosition.x}, ${holdPosition.y})`
          );
        } else {
          console.log("⚠️ No hold position available, using loop center");
          // Fallback to loop center if no hold position available
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          spinnerScreenPos = eventEditor.pageToScreen({
            x: centerX,
            y: centerY,
          });
          console.log(
            `🎯 Using loop center for spinner: page(${centerX}, ${centerY}) -> screen(${spinnerScreenPos.x}, ${spinnerScreenPos.y})`
          );
        }
        setSpinnerPosition(spinnerScreenPos);
        console.log("✅ Spinner position set:", spinnerScreenPos);
        console.log("✅ Spinner should be visible at:", spinnerScreenPos);

        // Store original stroke properties
        setOriginalStrokeProps({
          color: stroke.props.color || "black",
          size: stroke.props.size || "m",
        });

        // Highlight the stroke while processing
        try {
          eventEditor.updateShape({
            id: stroke.id,
            type: "draw",
            props: {
              color: "orange",
              size: "xl",
            },
          });
        } catch (error) {
          console.log("❌ Failed to highlight stroke:", error);
        }

        // Capture the area as an image
        const padding = 20;
        const captureArea = {
          x: minX - padding,
          y: minY - padding,
          w: maxX - minX + padding * 2,
          h: maxY - minY + padding * 2,
        };

        console.log(
          `📸 Capturing area: ${captureArea.w.toFixed(
            0
          )}x${captureArea.h.toFixed(0)} at (${captureArea.x.toFixed(
            0
          )}, ${captureArea.y.toFixed(0)})`
        );

        // Capture image using tldraw v3 API
        const shapeIds = shapesInLoop.map((s: any) => s.id);
        const result = await eventEditor.toImage(shapeIds, {
          format: "png",
          background: true,
          scale: 2,
          padding: 20,
        });

        if (result && result.blob) {
          console.log("✅ Image generated successfully");

          // Check if processing was cancelled
          if (aiProcessingAborted) {
            console.log("🚫 AI processing was cancelled");
            return;
          }

          // IMPORTANT: Preserve the image blob for website creation
          setCurrentCapturedImageBlob(result.blob);
          console.log("📱 DEBUG: Image blob preserved for website creation");

          // Send to AI for processing
          const aiResult = await sendToAI(
            result.blob,
            shapesInLoop,
            captureArea
          );

          // Check again after AI processing
          if (aiProcessingAborted) {
            console.log("🚫 AI processing was cancelled during execution");
            return;
          }

          console.log("🏁 Magic wand processing completed!");

          // Store the image summary and shapes for Ask AI functionality
          console.log("📱 DEBUG: Full aiResult:", aiResult);
          console.log(
            "📱 DEBUG: Setting currentImageSummary to:",
            aiResult.sceneDescription
          );
          const imageSummary = aiResult.sceneDescription;
          setCurrentImageSummary(imageSummary);
          console.log("📱 DEBUG: currentImageSummary set to:", imageSummary);
          // Separate AI bubbles from other shapes - AI bubbles should never be removed
          const aiBubbles = shapesInLoop.filter(
            (shape: any) => shape.type === "ai-bubble"
          );
          const shapesForRemoval = shapesInLoop.filter(
            (shape: any) => shape.type !== "ai-bubble"
          );

          // Store all shapes for positioning logic, but track which ones should be preserved
          setCurrentCapturedShapes(shapesInLoop);
          setCurrentShapesForRemoval(shapesForRemoval);
          console.log(
            `🔧 Captured ${shapesInLoop.length} shapes total: ${aiBubbles.length} AI bubbles (preserved), ${shapesForRemoval.length} other shapes`
          );

          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const areaWidth = maxX - minX;
          const areaHeight = maxY - minY;

          // Center bubble in the circled area
          const bubbleX = centerX;
          const bubbleY = centerY;

          // Scale bubble size based on circled area size
          // Base size is 350x150, scale it relative to the area size
          const baseWidth = 350;
          const baseHeight = 150;
          const minScale = 0.5; // Minimum 50% of base size
          const maxScale = 2.0; // Maximum 200% of base size

          // Use a reasonable reference size (400x300) for scaling calculation
          const referenceArea = 400 * 300;
          const currentArea = areaWidth * areaHeight;
          const areaRatio = Math.sqrt(currentArea / referenceArea);
          const scale = Math.max(minScale, Math.min(maxScale, areaRatio));

          const scaledWidth = Math.round(baseWidth * scale);
          const scaledHeight = Math.round(baseHeight * scale);

          // Store dimensions and center position for context menu actions
          setCurrentBubbleDimensions({
            width: scaledWidth,
            height: scaledHeight,
          });
          setCurrentCircledAreaCenter({ x: centerX, y: centerY });

          const bubbleScreenPos = eventEditor.pageToScreen({
            x: bubbleX,
            y: bubbleY,
          });

          // Check if we have a single decisive task that should be auto-executed
          if (aiResult.actions.length === 1) {
            console.log(
              "🤖 Single decisive task detected, auto-executing:",
              aiResult.actions[0]
            );

            // Auto-execute the single action
            const action = aiResult.actions[0];
            if (action.action === "ask_ai") {
              const bubblePagePosition = {
                x: bubbleX,
                y: bubbleY,
              };
              await executeAskAI(
                action,
                bubblePagePosition,
                true,
                imageSummary,
                { width: scaledWidth, height: scaledHeight }
              );
            } else if (action.action === "add_contact") {
              await executeAddContact(
                action,
                imageSummary,
                shapesForRemoval,
                true
              );
            } else if (action.action === "send_message") {
              const bubblePagePosition = {
                x: bubbleX,
                y: bubbleY,
              };
              await executeSendMessage(
                action,
                imageSummary,
                shapesForRemoval,
                bubblePagePosition,
                true,
                { width: scaledWidth, height: scaledHeight }
              );
            } else if (action.action === "read_contact_messages") {
              const bubblePagePosition = {
                x: bubbleX,
                y: bubbleY,
              };
              await executeReadContactMessages(
                action,
                imageSummary,
                shapesForRemoval,
                bubblePagePosition,
                true,
                { width: scaledWidth, height: scaledHeight }
              );
            } else if (action.action === "create_website") {
              const bubblePagePosition = {
                x: bubbleX,
                y: bubbleY,
              };
              await executeCreateWebsite(
                action,
                imageSummary,
                shapesForRemoval,
                bubblePagePosition,
                result.blob, // Use the captured image blob
                true,
                { width: scaledWidth, height: scaledHeight }
              );
            } else if (action.action === "search") {
              const bubblePagePosition = {
                x: bubbleX,
                y: bubbleY,
              };
              await executeSearch(
                action,
                bubblePagePosition,
                true,
                imageSummary,
                { width: scaledWidth, height: scaledHeight }
              );
            } else {
              // TODO: Implement other action types for auto-execution
              console.log(
                "🚧 Auto-execution not yet implemented for:",
                action.action
              );
            }
          } else {
            // Show context menu with multiple actions for user choice
            setContextMenuActions(aiResult.actions);
            console.log(
              "🎯 Setting context menu position to bubble screen coords:",
              bubbleScreenPos
            );
            setContextMenuPosition(bubbleScreenPos);
            setContextMenuOpen(true);
            console.log(
              "✅ Context menu should now be open with",
              aiResult.actions.length,
              "actions"
            );
          }

          // Remove the gesture stroke
          try {
            eventEditor.deleteShape(stroke.id);
            console.log("🗑️ Magic wand gesture shape removed");
          } catch (error) {
            console.log("❌ Failed to remove gesture shape:", error);
          }

          // Clear loading state
          setSpinnerPosition(null);
          setOriginalStrokeProps(null);
        } else {
          console.log("❌ Failed to generate image");
          // Restore original stroke appearance
          if (originalStrokeProps) {
            try {
              eventEditor.updateShape({
                id: stroke.id,
                type: "draw",
                props: originalStrokeProps,
              });
            } catch (error) {
              console.log("❌ Failed to restore stroke:", error);
            }
          }
          setSpinnerPosition(null);
          setOriginalStrokeProps(null);
        }
      } catch (error) {
        console.error("❌ Magic wand processing failed:", error);

        // Restore original stroke appearance
        if (originalStrokeProps && stroke.id) {
          try {
            eventEditor.updateShape({
              id: stroke.id,
              type: "draw",
              props: originalStrokeProps,
            });
          } catch (error) {
            console.log("❌ Failed to restore stroke:", error);
          }
        }
        setSpinnerPosition(null);
        setOriginalStrokeProps(null);
      }
    },
    [
      originalStrokeProps,
      aiProcessingAborted,
      executeAskAI,
      executeSearch,
      executeAddContact,
      executeSendMessage,
      processReplyScenario,
    ]
  );

  // Handler for onboarding actions
  const handleOnboardingAction = useCallback(
    (actionType: string, additionalData?: any) => {
      console.log(
        "📋 Onboarding action triggered:",
        actionType,
        additionalData
      );
      const onboardingUpdate = onboardingActions.checkActionForOnboarding(
        actionType,
        additionalData
      );
      if (onboardingUpdate && onboardingUpdate.isActive) {
        setTimeout(() => {
          setShowOnboarding(true);
        }, 1000);
      }
    },
    [onboardingActions]
  );

  // Register the magic wand callback via useEffect to handle React strict mode
  useEffect(() => {
    globalMagicWandCallback = handleMagicWandGesture;
    console.log(
      "🎯 Magic wand callback registered via useEffect:",
      !!globalMagicWandCallback
    );

    return () => {
      if (globalMagicWandCallback === handleMagicWandGesture) {
        globalMagicWandCallback = null;
        console.log("🧹 Cleaned up magic wand callback via useEffect");
      }
    };
  }, [handleMagicWandGesture]);

  // Register the onboarding callback via useEffect to handle React strict mode
  useEffect(() => {
    globalOnboardingCallback = handleOnboardingAction;
    console.log(
      "📋 Onboarding callback registered via useEffect:",
      !!globalOnboardingCallback
    );

    return () => {
      if (globalOnboardingCallback === handleOnboardingAction) {
        globalOnboardingCallback = null;
        console.log("🧹 Cleaned up onboarding callback via useEffect");
      }
    };
  }, [handleOnboardingAction]);

  // Debug spinner position changes
  useEffect(() => {
    console.log("🎨 Spinner position state changed:", spinnerPosition);
  }, [spinnerPosition]);

  // Effect to ensure pen tool is selected when editor is ready
  useEffect(() => {
    if (editorRef.current) {
      // Set pen tool as default when editor is available
      editorRef.current.setCurrentTool("draw");
      console.log("🖊️ Set pen tool via useEffect with editor ref");
    }
  }, []);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Force save on unmount
      if (autoSaverRef.current) {
        autoSaverRef.current.forceSave();
        autoSaverRef.current.cleanup();
      }
    };
  }, []);

  // UI overrides - hand tool is now available
  const uiOverrides: TLUiOverrides = {
    // No longer filtering out the hand tool - it's available alongside other tools
  };

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        shapeUtils={[
          AIBubbleShapeUtil,
          MessageBubbleShapeUtil,
          WebsiteBubbleShapeUtil,
          HandwrittenTextShapeUtil,
        ]}
        overrides={uiOverrides}
        onMount={(editor) => {
          console.log("tldraw mounted");
          console.log("🔧 Available shape utils:", editor.shapeUtils);
          console.log(
            "🔧 AI bubble shape util registered:",
            editor.shapeUtils["ai-bubble"]
          );

          // // Clear any stored tool state to ensure fresh start
          try {
            localStorage.removeItem("tldraw-current-tool");
            sessionStorage.removeItem("tldraw-current-tool");
          } catch {
            // Ignore storage errors
          }

          // Store editor reference
          editorRef.current = editor;

          // Initialize handwriting recognition
          handwritingManagerRef.current = new HandwritingContextManager();
          responseRendererRef.current = new HandwrittenResponseRenderer(editor);

          // Set up intent detection callback
          handwritingManagerRef.current.onIntentDetected = async (result) => {
            console.log('🤖 AI intent detected:', result);
            
            // Prevent concurrent AI responses
            if (isProcessingHandwritingResponseRef.current) {
              console.log('⏳ Already processing handwriting response, skipping...');
              return;
            }
            
            isProcessingHandwritingResponseRef.current = true;
            
            if (responseRendererRef.current && result.responsePosition) {
              // Show typing cursor
              await responseRendererRef.current.showTypingCursor(result.responsePosition);
              
              // Get AI response
              try {
                const response = await fetch('/api/ask-ai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    image_summary: result.fullQuestion, // Pass the question as the summary
                    task: result.fullQuestion,
                  }),
                });

                if (!response.ok) throw new Error('Failed to get AI response');
                
                const data = await response.json();
                if (data.success && data.response) {
                  // Render handwritten response
                  await responseRendererRef.current.renderResponse(
                    data.response,
                    result.responsePosition,
                    { font: 'kalam', size: 'm', speed: 25 }
                  );
                  
                  // Update conversation history
                  handwritingManagerRef.current?.updateLastResponse(data.response);
                }
              } catch (error) {
                console.error('Failed to get AI response:', error);
                responseRendererRef.current.hideCursor();
              } finally {
                isProcessingHandwritingResponseRef.current = false;
              }
            } else {
              isProcessingHandwritingResponseRef.current = false;
            }
          };

          // Load saved canvas data
          const savedData = loadCanvasData();
          if (savedData) {
            try {
              loadSnapshot(editor.store, savedData);
              console.log("📂 Restored canvas from localStorage");
            } catch (error) {
              console.error("❌ Failed to restore canvas data:", error);
              // Clear corrupted data
              clearCanvasData();
            }
          }

          // Check if onboarding should be shown (with small delay to ensure localStorage is ready)
          setTimeout(() => {
            console.log(
              "🔍 Canvas Debug - Checking if onboarding should be shown..."
            );
            const shouldShow = shouldShowOnboarding();
            console.log(
              "🔍 Canvas Debug - shouldShowOnboarding result:",
              shouldShow
            );

            if (shouldShow) {
              console.log("📋 Showing onboarding for new user");
              setShowOnboarding(true);
              startOnboarding();
            } else {
              console.log("🔍 Canvas Debug - Not showing onboarding");
            }
          }, 100); // Small delay to ensure everything is ready

          // Load saved contacts from localStorage
          try {
            const savedContacts = loadContacts();
            console.log(
              `📱 Loaded ${savedContacts.length} saved contacts on app initialization`
            );
          } catch (error) {
            console.error(
              "❌ Failed to load contacts on initialization:",
              error
            );
          }

          // Set up auto-save functionality
          autoSaverRef.current = new CanvasAutoSaver(editor.store);

          // Listen for changes to auto-save with immediate save for draw operations
          const unsubscribe = editor.store.listen((event) => {
            // Extract records at the top level
            const addedRecords = Object.values(event.changes.added);
            const updatedRecords = Object.values(event.changes.updated).map(
              ([, record]) => record
            );
            const removedRecords = Object.values(event.changes.removed);

            // Handle auto-save
            if (autoSaverRef.current) {
              // Check if this is a draw operation for immediate save
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

              // Check if any shapes were deleted (immediate save for deletions)
              const hasDeletedShapes = removedRecords.some(
                (record: any) => record.typeName === "shape"
              );

              if (isDrawOperation || hasDeletedShapes) {
                // Save immediately for draw operations and deletions to prevent loss
                autoSaverRef.current.forceSave();
              } else {
                // Use debounced save for other operations
                autoSaverRef.current.scheduleAutoSave();
              }
            }

            // Track draw shapes for handwriting recognition
            if (handwritingManagerRef.current) {
              // Handle new draw shapes
              const newDrawShapes = addedRecords
                .filter((record: any) => 
                  record.typeName === "shape" && record.type === "draw"
                ) as any[];

              newDrawShapes.forEach((shape) => {
                handwritingManagerRef.current!.addStroke(shape);
              });

              // Handle updated draw shapes
              const updatedDrawShapes = updatedRecords
                .filter((record: any) => 
                  record.typeName === "shape" && record.type === "draw"
                ) as any[];

              updatedDrawShapes.forEach((shape) => {
                handwritingManagerRef.current!.updateStroke(shape);
              });

              // Handle removed draw shapes
              const removedDrawShapes = removedRecords
                .filter((record: any) => 
                  record.typeName === "shape" && record.type === "draw"
                ) as any[];

              removedDrawShapes.forEach((shape) => {
                handwritingManagerRef.current!.removeStroke(shape.id);
              });
            }
          });

          // Set pen tool as default IMMEDIATELY
          editor.setCurrentTool("draw");
          console.log("🖊️ Set pen tool as default in onMount");

          // Create a test message-bubble shape
          // const messageBubbleShapeId = createShapeId();
          // try {
          //   editor.createShapes([
          //     {
          //       id: messageBubbleShapeId,
          //       type: "message-bubble",
          //       x: 100,
          //       y: 100,
          //       props: {
          //         w: 350,
          //         h: 150,
          //         personName: "Alex",
          //         text: "Hey, are we still on for lunch today?",
          //         replyText: "Yes! See you at 12:30 at the usual place 😊.",
          //         state: "sending",
          //         priority: "normal",
          //       },
          //     },
          //   ]);
          //   console.log("✅ Test message-bubble shape created successfully");
          // } catch (error) {
          //   console.error(
          //     "❌ Failed to create test message-bubble shape:",
          //     error
          //   );
          // }

          // Create a test AI bubble shape
          try {
            // const aiBubbleShapeId = createShapeId();
            // editor.createShapes([
            //   {
            //     id: aiBubbleShapeId,
            //     type: "ai-bubble",
            //     x: 500,
            //     y: 100,
            //     props: {
            //       w: 300,
            //       h: 200,
            //       content: "This is a test AI response that should be resizable. Try dragging the corners to resize this bubble.",
            //       isLoading: false,
            //     },
            //   },
            // ]);
            console.log("✅ Test AI bubble shape created successfully");
          } catch (error) {
            console.error("❌ Failed to create test AI bubble shape:", error);
          }

          // Force pen tool selection multiple times with different delays to ensure it sticks
          setTimeout(() => {
            editor.setCurrentTool("draw");
            console.log("🖊️ Re-confirmed pen tool selection (50ms)");
          }, 50);

          setTimeout(() => {
            editor.setCurrentTool("draw");
            console.log("🖊️ Re-confirmed pen tool selection (100ms)");
          }, 100);

          setTimeout(() => {
            editor.setCurrentTool("draw");
            console.log("🖊️ Re-confirmed pen tool selection (200ms)");
          }, 200);

          console.log("✅ Setting up editor");

          // Initialize hold detector
          holdDetector = new HoldDetector();
          holdDetector.setHoldCallback((stroke, holdPosition) => {
            console.log(
              "🔥 Hold callback triggered with position:",
              holdPosition
            );
            triggerMagicWandGesture(stroke, editor, holdPosition);
          });

          // Listen for pointer up events to auto-revert to pen after other tools finish
          editor.on("event", (info) => {
            if (info.type === "pointer" && info.name === "pointer_up") {
              const currentTool = editor.getCurrentToolId();

              // If user just finished with arrow, rectangle, ellipse, or text tool,
              // revert to pen tool after a short delay
              if (
                ["arrow", "rectangle", "ellipse", "text"].includes(currentTool)
              ) {
                setTimeout(() => {
                  // Check if we're still on the same tool (user didn't manually switch)
                  if (editor.getCurrentToolId() === currentTool) {
                    editor.setCurrentTool("draw");
                    console.log(
                      `🔄 Auto-reverted from ${currentTool} tool back to pen`
                    );
                  }
                }, 200);
              }
            }
          });

          // const activeDrawShapes = new Set();

          // Listen for pointer events
          editor.on("event", async (info) => {
            if (info.type === "pointer" && info.name === "pointer_down") {
              // Cancel any existing hold detection when starting a new stroke
              cancelHoldDetection();
            }

            if (info.type === "pointer" && info.name === "pointer_move") {
              // Check if we're currently drawing and should detect enclosing gestures
              const allShapes = editor.getCurrentPageShapes();
              const drawShapes = allShapes.filter(
                (shape) => shape.type === "draw"
              );
              const currentStroke = drawShapes[drawShapes.length - 1];

              if (currentStroke && currentStroke.type === "draw") {
                // Only check if we haven't already started hold detection for this stroke
                const currentHoldShape = holdDetector?.getCurrentShape();
                if (
                  !currentHoldShape ||
                  currentHoldShape.id !== currentStroke.id
                ) {
                  // Clear any existing gesture check timer
                  if (gestureCheckTimer) {
                    clearTimeout(gestureCheckTimer);
                  }

                  // Set a timer to check for gesture after user pauses drawing
                  gestureCheckTimer = setTimeout(() => {
                    // Double-check that we're still on the same stroke
                    const latestShapes = editor.getCurrentPageShapes();
                    const latestDrawShapes = latestShapes.filter(
                      (shape) => shape.type === "draw"
                    );
                    const latestStroke =
                      latestDrawShapes[latestDrawShapes.length - 1];

                    if (latestStroke && latestStroke.id === currentStroke.id) {
                      // Check if this stroke is forming an enclosing gesture
                      const isEnclosingGesture = analyzeForSingleLoop(
                        latestStroke as any
                      );

                      if (isEnclosingGesture) {
                        console.log(
                          "🪄 Enclosing gesture detected! Starting hold detection..."
                        );

                        // Start hold detection with initial position
                        const initialPosition = info.point
                          ? { x: info.point.x, y: info.point.y }
                          : undefined;
                        console.log(
                          "🔍 Starting hold detection with initial position:",
                          initialPosition
                        );
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

              // Update hold detector with current position for movement tracking
              if (holdDetector && info.point) {
                const currentPos = { x: info.point.x, y: info.point.y };
                holdDetector.updatePosition(currentPos);
              }
            }

            if (info.type === "pointer" && info.name === "pointer_up") {
              console.log(
                `🖱️ Pointer up event - hold detection already handled during drawing`
              );
              // The gesture detection and hold logic now happens during pointer_move
              // So we don't need to do anything special on pointer_up
            }
          });

          // Cleanup function
          return () => {
            // Force save before any cleanup
            if (autoSaverRef.current) {
              autoSaverRef.current.forceSave();
            }

            cancelHoldDetection();

            // Cleanup handwriting recognition
            if (handwritingManagerRef.current) {
              handwritingManagerRef.current.clear();
            }
            if (responseRendererRef.current) {
              responseRendererRef.current.clearResponses();
            }

            // Cleanup store listener
            unsubscribe();

            // Cleanup auto-saver last
            if (autoSaverRef.current) {
              autoSaverRef.current.cleanup();
            }
          };
        }}
      />

      {spinnerPosition && <PointSpinner position={spinnerPosition} />}

      <AIActionsContextMenu
        actions={contextMenuActions}
        position={contextMenuPosition}
        onActionSelect={handleActionSelect}
        open={contextMenuOpen}
        onOpenChange={setContextMenuOpen}
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
  } else {
    console.warn("⚠️ Onboarding callback not available:", actionType);
  }
}
