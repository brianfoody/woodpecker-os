"use client";

import { Tldraw, Editor, TLShape, TLShapeId, createShapeId } from "tldraw";
import "tldraw/tldraw.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPromptModal } from "@/components/action-prompt-modal";
import { AIActionsContextMenu } from "@/components/ai-actions-context-menu";
import { LoadingIndicator } from "@/components/loading-indicator";
import { PointSpinner } from "@/components/point-spinner";
import { sendToAI } from "@/lib/ai-processing";
import { analyzeForSingleLoop } from "@/lib/gesture-detection";
import { HoldDetector } from "@/lib/hold-detection";
import { AIAction } from "@/lib/models";
import { AIBubbleShapeUtil } from "@/lib/shapes/ai-bubble-shape-util";
import { MessageBubbleShapeUtil } from "@/lib/shapes/message-bubble-shape-util";
import { saveCanvasData, loadCanvasData, CanvasAutoSaver } from "@/lib/canvas-persistence";
import { saveContact, getAllContacts } from "@/lib/contact-storage";
import { getLastMessageCheck, updateLastMessageCheck } from "@/lib/message-tracking";
import { toast } from "@/hooks/use-toast";
import { SmartContact, SmartMessage } from "@/lib/models";

const customShapeUtils = [AIBubbleShapeUtil, MessageBubbleShapeUtil];

export default function Home() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [aiActions, setAiActions] = useState<AIAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPosition, setLoadingPosition] = useState({ x: 0, y: 0 });
  const [showPointSpinner, setShowPointSpinner] = useState(false);
  const [pointSpinnerPosition, setPointSpinnerPosition] = useState({ x: 0, y: 0 });
  const [sceneDescription, setSceneDescription] = useState<string>("");

  const holdDetectorRef = useRef<HoldDetector | null>(null);
  const autoSaverRef = useRef<CanvasAutoSaver | null>(null);
  const lastShapeRef = useRef<TLShape | null>(null);
  const messagePollingRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize hold detector
  useEffect(() => {
    holdDetectorRef.current = new HoldDetector();
    holdDetectorRef.current.setHoldCallback(handleHoldGesture);

    return () => {
      holdDetectorRef.current?.cleanup();
    };
  }, []);

  // Initialize auto-saver when editor is ready
  useEffect(() => {
    if (editor) {
      autoSaverRef.current = new CanvasAutoSaver(editor.store);

      // Load saved data
      const savedData = loadCanvasData();
      if (savedData) {
        try {
          editor.store.loadSnapshot(savedData);
          console.log("📂 Canvas data loaded successfully");
        } catch (error) {
          console.error("❌ Failed to load canvas data:", error);
        }
      }

      // Listen for changes and auto-save
      const unsubscribe = editor.store.listen(() => {
        autoSaverRef.current?.scheduleAutoSave();
      });

      return () => {
        unsubscribe();
        autoSaverRef.current?.cleanup();
      };
    }
  }, [editor]);

  // Message polling effect
  useEffect(() => {
    const pollForMessages = async () => {
      try {
        const lastCheck = getLastMessageCheck();
        const response = await fetch("/api/read-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lastRetrievedAt: lastCheck?.toISOString(),
          }),
        });

        if (!response.ok) {
          console.error("❌ Failed to poll messages:", response.statusText);
          return;
        }

        const result = await response.json();
        if (!result.success) {
          console.error("❌ Message polling failed:", result.error);
          return;
        }

        const { messages, lastRetrievedAt } = result;
        console.log(`📱 Polled ${messages.length} new messages`);

        if (messages.length > 0) {
          // Update the last check timestamp
          updateLastMessageCheck(new Date(lastRetrievedAt));

          // Match messages with contacts and show bubbles
          const contacts = getAllContacts();
          messages.forEach((message: SmartMessage) => {
            const contact = contacts.find(c => c.phoneNumber === message.phoneNumber);
            if (contact) {
              message.name = contact.name;
              showMessageBubble(message, "reply-available");
            } else {
              // Show with phone number as name if no contact found
              message.name = message.phoneNumber;
              showMessageBubble(message, "reply-available");
            }
          });
        }
      } catch (error) {
        console.error("❌ Error polling messages:", error);
      }
    };

    // Poll immediately, then every 10 seconds
    pollForMessages();
    messagePollingRef.current = setInterval(pollForMessages, 10000);

    return () => {
      if (messagePollingRef.current) {
        clearInterval(messagePollingRef.current);
      }
    };
  }, []);

  const showMessageBubble = (message: SmartMessage, state: "sending" | "sent" | "failed" | "reply-available" | "reply") => {
    if (!editor) return;

    const viewport = editor.getViewportPageBounds();
    const x = viewport.x + viewport.w - 400;
    const y = viewport.y + 50;

    const messageBubbleId = createShapeId();
    editor.createShape({
      id: messageBubbleId,
      type: "message-bubble",
      x,
      y,
      props: {
        w: 350,
        h: 150,
        personName: message.name,
        text: message.text,
        phoneNumber: message.phoneNumber,
        state,
        priority: "normal",
      },
    });
  };

  const handleHoldGesture = useCallback(
    async (shape: TLShape, holdPosition: { x: number; y: number }) => {
      if (!editor) return;

      console.log("🎯 Hold gesture detected, processing...");
      setIsLoading(true);
      setLoadingPosition(holdPosition);

      try {
        // Get all shapes within the enclosing gesture
        const enclosedShapes = getEnclosedShapes(shape);
        console.log(`📦 Found ${enclosedShapes.length} enclosed shapes`);

        if (enclosedShapes.length === 0) {
          console.log("⚠️ No shapes found within the gesture");
          setIsLoading(false);
          return;
        }

        // Calculate bounds of enclosed area
        const bounds = calculateEnclosedBounds(enclosedShapes);
        console.log("📏 Calculated bounds:", bounds);

        // Create image of the enclosed area
        const imageBlob = await editor.getSvgAsImage(enclosedShapes.map(s => s.id), {
          bounds,
          scale: 1,
          format: "png",
        });

        if (!imageBlob) {
          throw new Error("Failed to generate image from selection");
        }

        // Send to AI for processing
        const result = await sendToAI(imageBlob, enclosedShapes, bounds);
        console.log("🤖 AI processing complete:", result);

        setSceneDescription(result.sceneDescription);
        setAiActions(result.actions);
        setIsLoading(false);

        if (result.actions.length > 0) {
          setContextMenuPosition(holdPosition);
          setShowContextMenu(true);
        } else {
          toast({
            title: "No Actions Available",
            description: "No actionable suggestions found for the selected content.",
          });
        }
      } catch (error) {
        console.error("❌ Error processing hold gesture:", error);
        setIsLoading(false);
        toast({
          variant: "destructive",
          title: "Processing Error",
          description: "Failed to process the selected area. Please try again.",
        });
      }
    },
    [editor]
  );

  const getEnclosedShapes = (enclosingShape: TLShape): TLShape[] => {
    if (!editor) return [];

    const allShapes = editor.getCurrentPageShapes();
    const enclosedShapes: TLShape[] = [];

    // Get the bounds of the enclosing shape
    const enclosingBounds = editor.getShapeGeometry(enclosingShape).bounds;
    const enclosingPageBounds = {
      x: enclosingShape.x + enclosingBounds.x,
      y: enclosingShape.y + enclosingBounds.y,
      w: enclosingBounds.w,
      h: enclosingBounds.h,
    };

    for (const shape of allShapes) {
      if (shape.id === enclosingShape.id) continue;
      if (shape.type === "ai-bubble" || shape.type === "message-bubble") continue;

      const shapeBounds = editor.getShapeGeometry(shape).bounds;
      const shapePageBounds = {
        x: shape.x + shapeBounds.x,
        y: shape.y + shapeBounds.y,
        w: shapeBounds.w,
        h: shapeBounds.h,
      };

      // Check if shape is within the enclosing bounds
      if (
        shapePageBounds.x >= enclosingPageBounds.x &&
        shapePageBounds.y >= enclosingPageBounds.y &&
        shapePageBounds.x + shapePageBounds.w <= enclosingPageBounds.x + enclosingPageBounds.w &&
        shapePageBounds.y + shapePageBounds.h <= enclosingPageBounds.y + enclosingPageBounds.h
      ) {
        enclosedShapes.push(shape);
      }
    }

    return enclosedShapes;
  };

  const calculateEnclosedBounds = (shapes: TLShape[]) => {
    if (!editor || shapes.length === 0) {
      return { x: 0, y: 0, w: 100, h: 100 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const shape of shapes) {
      const bounds = editor.getShapeGeometry(shape).bounds;
      const pageX = shape.x + bounds.x;
      const pageY = shape.y + bounds.y;

      minX = Math.min(minX, pageX);
      minY = Math.min(minY, pageY);
      maxX = Math.max(maxX, pageX + bounds.w);
      maxY = Math.max(maxY, pageY + bounds.h);
    }

    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    };
  };

  const handleActionSelect = async (action: AIAction) => {
    console.log("🎯 Action selected:", action);
    setShowContextMenu(false);

    try {
      switch (action.action) {
        case "ask_ai":
          await handleAskAI();
          break;
        case "send_message":
          await handleSendMessage();
          break;
        case "add_contact":
          await handleAddContact();
          break;
        case "read_contact_messages":
          await handleReadContactMessages();
          break;
        case "search":
          toast({
            title: "Search Action",
            description: "Search functionality would be implemented here.",
          });
          break;
        default:
          console.log("🤷 Unknown action:", action.action);
      }
    } catch (error) {
      console.error("❌ Error executing action:", error);
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: "Failed to execute the selected action. Please try again.",
      });
    }
  };

  const handleAskAI = async () => {
    if (!editor) return;

    console.log("🤖 Executing Ask AI action");
    setShowPointSpinner(true);
    setPointSpinnerPosition(contextMenuPosition);

    try {
      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_summary: sceneDescription }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to get AI response");
      }

      // Create AI bubble shape
      const viewport = editor.getViewportPageBounds();
      const bubbleId = createShapeId();

      editor.createShape({
        id: bubbleId,
        type: "ai-bubble",
        x: viewport.x + 50,
        y: viewport.y + 50,
        props: {
          w: 400,
          h: 300,
          content: result.response,
          isLoading: false,
        },
      });

      console.log("✅ AI bubble created successfully");
    } catch (error) {
      console.error("❌ Ask AI failed:", error);
      toast({
        variant: "destructive",
        title: "AI Request Failed",
        description: "Failed to get response from AI. Please try again.",
      });
    } finally {
      setShowPointSpinner(false);
    }
  };

  const handleSendMessage = async () => {
    console.log("💬 Executing Send Message action");
    setShowPointSpinner(true);
    setPointSpinnerPosition(contextMenuPosition);

    try {
      const contacts = getAllContacts();
      const response = await fetch("/api/extract-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_summary: sceneDescription,
          contacts,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to extract message");
      }

      const message: SmartMessage = result.message;
      console.log("📱 Message extracted:", message);

      // Show message bubble in sending state
      showMessageBubble(message, "sending");

      console.log("✅ Message bubble created");
    } catch (error) {
      console.error("❌ Send Message failed:", error);
      toast({
        variant: "destructive",
        title: "Message Failed",
        description: "Failed to send message. Please try again.",
      });
    } finally {
      setShowPointSpinner(false);
    }
  };

  const handleAddContact = async () => {
    console.log("📱 Executing Add Contact action");
    setShowPointSpinner(true);
    setPointSpinnerPosition(contextMenuPosition);

    try {
      const response = await fetch("/api/extract-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_summary: sceneDescription }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to extract contact");
      }

      const contact: SmartContact = result.contact;
      console.log("📱 Contact extracted:", contact);

      // Save contact to localStorage
      saveContact(contact);

      toast({
        title: "Contact Added",
        description: `${contact.name} has been added to your contacts.`,
      });

      console.log("✅ Contact saved successfully");
    } catch (error) {
      console.error("❌ Add Contact failed:", error);
      toast({
        variant: "destructive",
        title: "Add Contact Failed",
        description: "Failed to add contact. Please try again.",
      });
    } finally {
      setShowPointSpinner(false);
    }
  };

  const handleReadContactMessages = async () => {
    console.log("📱 Executing Read Contact Messages action");
    // This would integrate with the message polling system
    toast({
      title: "Reading Messages",
      description: "Message reading functionality is active via polling.",
    });
  };

  const handlePointerMove = useCallback(
    (info: any) => {
      if (!holdDetectorRef.current) return;

      const { currentPagePoint } = info;
      if (currentPagePoint) {
        holdDetectorRef.current.updatePosition({
          x: currentPagePoint.x,
          y: currentPagePoint.y,
        });
      }
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    if (!editor || !holdDetectorRef.current) return;

    const currentPageShapes = editor.getCurrentPageShapes();
    const latestShape = currentPageShapes[currentPageShapes.length - 1];

    if (
      latestShape &&
      latestShape.type === "draw" &&
      latestShape !== lastShapeRef.current
    ) {
      console.log("🖊️ New draw shape detected:", latestShape.id);
      lastShapeRef.current = latestShape;

      if (analyzeForSingleLoop(latestShape)) {
        console.log("🔄 Enclosing gesture detected, starting hold detection");
        const shapeGeometry = editor.getShapeGeometry(latestShape);
        const center = shapeGeometry.bounds.center;
        const pageCenter = {
          x: latestShape.x + center.x,
          y: latestShape.y + center.y,
        };

        holdDetectorRef.current.startHoldDetection(latestShape, pageCenter);
      } else {
        console.log("❌ Not an enclosing gesture");
        holdDetectorRef.current.cancelHoldDetection();
      }
    }
  }, [editor]);

  const handleCancelLoading = () => {
    setIsLoading(false);
    holdDetectorRef.current?.cancelHoldDetection();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Built with Bolt Badge */}
      <div className="fixed top-4 right-4 z-50">
        <a
          href="https://bolt.new"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 border border-white/20"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-yellow-300"
          >
            <path
              d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
              fill="currentColor"
            />
          </svg>
          <span>Built with Bolt</span>
        </a>
      </div>

      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={setEditor}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {isLoading && (
        <LoadingIndicator
          position={loadingPosition}
          onCancel={handleCancelLoading}
        />
      )}

      {showPointSpinner && (
        <PointSpinner position={pointSpinnerPosition} />
      )}

      <ActionPromptModal
        open={showModal}
        onOpenChange={setShowModal}
        actions={aiActions}
        onActionSelect={handleActionSelect}
        loading={isLoading}
      />

      <AIActionsContextMenu
        actions={aiActions}
        position={contextMenuPosition}
        onActionSelect={handleActionSelect}
        open={showContextMenu}
        onOpenChange={setShowContextMenu}
      />
    </div>
  );
}