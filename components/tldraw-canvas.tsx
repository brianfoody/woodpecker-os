"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Tldraw,
  Editor,
  TLShape,
  TLShapeId,
  createShapeId,
  Box,
  TLEventInfo,
  TLPointerEventInfo,
  useEditor,
} from "tldraw";
import { Wand2 } from "lucide-react";
import { ActionPromptModal } from "./action-prompt-modal";
import { AIActionsContextMenu } from "./ai-actions-context-menu";
import { LoadingIndicator } from "./loading-indicator";
import { PointSpinner } from "./point-spinner";
import { sendToAI } from "@/lib/ai-processing";
import { analyzeForSingleLoop } from "@/lib/gesture-detection";
import { HoldDetector } from "@/lib/hold-detection";
import { AIAction } from "@/lib/models";
import { toast } from "@/hooks/use-toast";
import {
  saveCanvasData,
  loadCanvasData,
  CanvasAutoSaver,
} from "@/lib/canvas-persistence";
import {
  AIBubbleShapeUtil,
  MessageBubbleShapeUtil,
  type AIBubbleShape,
  type MessageBubbleShape,
} from "@/lib/shapes";
import { saveContact, getAllContacts } from "@/lib/contact-storage";
import {
  getLastMessageCheck,
  updateLastMessageCheck,
} from "@/lib/message-tracking";
import { SmartContact, SmartMessage } from "@/lib/models";

// Custom shape utilities
const customShapeUtils = [AIBubbleShapeUtil, MessageBubbleShapeUtil];

interface CanvasState {
  showActionModal: boolean;
  showContextMenu: boolean;
  contextMenuPosition: { x: number; y: number };
  actions: AIAction[];
  isLoading: boolean;
  loadingPosition: { x: number; y: number };
  sceneDescription: string;
}

export default function TldrawCanvas() {
  const editorRef = useRef<Editor | null>(null);
  const autoSaverRef = useRef<CanvasAutoSaver | null>(null);
  const holdDetectorRef = useRef<HoldDetector | null>(null);
  const messagePollingRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<CanvasState>({
    showActionModal: false,
    showContextMenu: false,
    contextMenuPosition: { x: 0, y: 0 },
    actions: [],
    isLoading: false,
    loadingPosition: { x: 0, y: 0 },
    sceneDescription: "",
  });

  // Initialize hold detector
  useEffect(() => {
    holdDetectorRef.current = new HoldDetector();
    holdDetectorRef.current.setHoldCallback(handleHoldComplete);

    return () => {
      holdDetectorRef.current?.cleanup();
    };
  }, []);

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

        const data = await response.json();
        if (!data.success) {
          console.error("❌ Message polling failed:", data.error);
          return;
        }

        const { messages, lastRetrievedAt } = data;
        console.log(`📱 Polled ${messages.length} new messages`);

        if (messages.length > 0) {
          // Update the last check timestamp
          updateLastMessageCheck(new Date(lastRetrievedAt));

          // Get contacts for name matching
          const contacts = getAllContacts();

          // Process each new message
          messages.forEach((message: SmartMessage) => {
            // Try to match with existing contacts
            const contact = contacts.find(
              (c) => c.phoneNumber === message.phoneNumber
            );
            if (contact) {
              message.name = contact.name;
            } else {
              // Extract name from phone number or use "Unknown"
              message.name = message.phoneNumber.replace(/^\+\d+/, "") || "Unknown";
            }

            // Create message bubble on canvas
            createMessageBubble(message, "reply-available");
          });
        }
      } catch (error) {
        console.error("❌ Error polling messages:", error);
      }
    };

    // Poll immediately, then every 30 seconds
    pollForMessages();
    messagePollingRef.current = setInterval(pollForMessages, 30000);

    return () => {
      if (messagePollingRef.current) {
        clearInterval(messagePollingRef.current);
      }
    };
  }, []);

  const handleHoldComplete = useCallback(
    async (shape: TLShape, holdPosition: { x: number; y: number }) => {
      if (!editorRef.current) return;

      console.log("🎯 Hold complete! Processing magic wand gesture...");

      // Show loading indicator at hold position
      setState((prev) => ({
        ...prev,
        isLoading: true,
        loadingPosition: holdPosition,
      }));

      try {
        // Get all shapes within the circled area
        const shapesInArea = getShapesInCircledArea(shape);
        console.log(`🔍 Found ${shapesInArea.length} shapes in circled area`);

        if (shapesInArea.length === 0) {
          toast({
            title: "No Content Found",
            description: "No shapes were found within the circled area.",
            variant: "destructive",
          });
          return;
        }

        // Get the bounding box of the circled area
        const bounds = getCircledAreaBounds(shape, shapesInArea);

        // Capture the circled area as an image
        const imageBlob = await captureCircledArea(bounds);

        // Send to AI for processing
        const result = await sendToAI(imageBlob, shapesInArea, bounds);

        console.log("🤖 AI processing complete:", result);

        // Hide loading and show results
        setState((prev) => ({
          ...prev,
          isLoading: false,
          actions: result.actions,
          sceneDescription: result.sceneDescription,
          showActionModal: true,
        }));
      } catch (error) {
        console.error("❌ Error processing magic wand gesture:", error);
        setState((prev) => ({ ...prev, isLoading: false }));
        toast({
          title: "Processing Error",
          description: "Failed to process the circled area. Please try again.",
          variant: "destructive",
        });
      }
    },
    []
  );

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Set up auto-saver
    autoSaverRef.current = new CanvasAutoSaver(editor.store);

    // Load saved canvas data
    const savedData = loadCanvasData();
    if (savedData) {
      try {
        editor.store.loadSnapshot(savedData);
        console.log("📂 Canvas data loaded successfully");
      } catch (error) {
        console.error("❌ Failed to load canvas data:", error);
      }
    }

    // Set up auto-save on changes
    const unsubscribe = editor.store.listen(() => {
      autoSaverRef.current?.scheduleAutoSave();
    });

    // Cleanup function
    return () => {
      unsubscribe();
      autoSaverRef.current?.cleanup();
    };
  }, []);

  const handlePointerMove = useCallback((info: TLPointerEventInfo) => {
    if (holdDetectorRef.current) {
      holdDetectorRef.current.updatePosition({
        x: info.point.x,
        y: info.point.y,
      });
    }
  }, []);

  const handleShapeChange = useCallback((info: TLEventInfo) => {
    if (info.name !== "create_shape") return;

    const editor = editorRef.current;
    if (!editor) return;

    // Get the created shape
    const createdShapes = info.changes.added;
    if (!createdShapes || Object.keys(createdShapes).length === 0) return;

    const shapeId = Object.keys(createdShapes)[0] as TLShapeId;
    const shape = editor.getShape(shapeId);

    if (!shape || shape.type !== "draw") return;

    // Check if this is a potential enclosing gesture
    const isEnclosingGesture = analyzeForSingleLoop(shape);

    if (isEnclosingGesture) {
      console.log("🎯 Enclosing gesture detected! Starting hold detection...");
      holdDetectorRef.current?.startHoldDetection(shape, {
        x: shape.x,
        y: shape.y,
      });
    } else {
      // Cancel any existing hold detection for non-enclosing shapes
      holdDetectorRef.current?.cancelHoldDetection();
    }
  }, []);

  const getShapesInCircledArea = (circleShape: TLShape): TLShape[] => {
    if (!editorRef.current) return [];

    const editor = editorRef.current;
    const allShapes = editor.getCurrentPageShapes();

    // Get the bounding box of the circle
    const circleBounds = editor.getShapeGeometry(circleShape).bounds;
    const circleBox = new Box(
      circleShape.x + circleBounds.x,
      circleShape.y + circleBounds.y,
      circleBounds.w,
      circleBounds.h
    );

    // Find shapes that intersect with the circle
    const shapesInArea = allShapes.filter((shape) => {
      if (shape.id === circleShape.id) return false; // Exclude the circle itself

      const shapeBounds = editor.getShapeGeometry(shape).bounds;
      const shapeBox = new Box(
        shape.x + shapeBounds.x,
        shape.y + shapeBounds.y,
        shapeBounds.w,
        shapeBounds.h
      );

      return circleBox.includes(shapeBox) || circleBox.intersects(shapeBox);
    });

    return shapesInArea;
  };

  const getCircledAreaBounds = (
    circleShape: TLShape,
    shapesInArea: TLShape[]
  ) => {
    if (!editorRef.current) {
      return { x: 0, y: 0, w: 100, h: 100 };
    }

    const editor = editorRef.current;

    // If we have shapes in the area, use their combined bounds
    if (shapesInArea.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      shapesInArea.forEach((shape) => {
        const bounds = editor.getShapeGeometry(shape).bounds;
        const shapeMinX = shape.x + bounds.x;
        const shapeMinY = shape.y + bounds.y;
        const shapeMaxX = shapeMinX + bounds.w;
        const shapeMaxY = shapeMinY + bounds.h;

        minX = Math.min(minX, shapeMinX);
        minY = Math.min(minY, shapeMinY);
        maxX = Math.max(maxX, shapeMaxX);
        maxY = Math.max(maxY, shapeMaxY);
      });

      return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      };
    }

    // Fallback to circle bounds
    const circleBounds = editor.getShapeGeometry(circleShape).bounds;
    return {
      x: circleShape.x + circleBounds.x,
      y: circleShape.y + circleBounds.y,
      w: circleBounds.w,
      h: circleBounds.h,
    };
  };

  const captureCircledArea = async (bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): Promise<Blob> => {
    if (!editorRef.current) {
      throw new Error("Editor not available");
    }

    const editor = editorRef.current;

    // Add some padding around the bounds
    const padding = 20;
    const captureBox = new Box(
      bounds.x - padding,
      bounds.y - padding,
      bounds.w + padding * 2,
      bounds.h + padding * 2
    );

    // Export the area as SVG first, then convert to PNG
    const svg = await editor.getSvgString([...editor.getCurrentPageShapeIds()], {
      bounds: captureBox,
      background: true,
    });

    // Convert SVG to PNG blob
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      const img = new Image();
      img.onload = () => {
        canvas.width = captureBox.w;
        canvas.height = captureBox.h;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        }, "image/png");
      };

      img.onerror = () => reject(new Error("Failed to load SVG"));
      img.src = "data:image/svg+xml;base64," + btoa(svg);
    });
  };

  const createAIBubble = (
    content: string,
    position: { x: number; y: number }
  ) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const shapeId = createShapeId();

    const shape: AIBubbleShape = {
      id: shapeId,
      type: "ai-bubble",
      x: position.x,
      y: position.y,
      props: {
        w: 400,
        h: 250,
        content,
        isLoading: false,
      },
    };

    editor.createShape(shape);
    console.log("🤖 AI bubble created with content");
  };

  const createMessageBubble = (
    message: SmartMessage,
    state: "sending" | "sent" | "failed" | "reply-available" | "reply" = "sending"
  ) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const shapeId = createShapeId();

    // Position new message bubbles in a visible area
    const viewport = editor.getViewportPageBounds();
    const position = {
      x: viewport.x + viewport.w - 400, // Right side of viewport
      y: viewport.y + 50, // Top of viewport with some margin
    };

    const shape: MessageBubbleShape = {
      id: shapeId,
      type: "message-bubble",
      x: position.x,
      y: position.y,
      props: {
        w: 350,
        h: 150,
        personName: message.name,
        text: message.text,
        phoneNumber: message.phoneNumber,
        replyText: "Thanks for the message!",
        state,
        priority: message.priority || "normal",
      },
    };

    editor.createShape(shape);
    console.log("💬 Message bubble created:", message.name);
  };

  const handleActionSelect = async (action: AIAction) => {
    console.log("🎯 Action selected:", action);

    setState((prev) => ({
      ...prev,
      showActionModal: false,
      showContextMenu: false,
    }));

    try {
      switch (action.action) {
        case "ask_ai":
          await handleAskAI();
          break;

        case "add_contact":
          await handleAddContact();
          break;

        case "send_message":
          await handleSendMessage();
          break;

        case "read_contact_messages":
          await handleReadContactMessages();
          break;

        case "search":
          toast({
            title: "Search Feature",
            description: "Search functionality coming soon!",
          });
          break;

        default:
          console.log("🤷 Unknown action:", action.action);
      }
    } catch (error) {
      console.error("❌ Error executing action:", error);
      toast({
        title: "Action Failed",
        description: "Failed to execute the selected action. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAskAI = async () => {
    try {
      console.log("🤖 Asking AI with scene description:", state.sceneDescription);

      const response = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_summary: state.sceneDescription,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to get AI response");
      }

      // Create AI bubble with the response
      const viewport = editorRef.current?.getViewportPageBounds();
      if (viewport) {
        createAIBubble(data.response, {
          x: viewport.x + viewport.w / 2 - 200,
          y: viewport.y + viewport.h / 2 - 125,
        });
      }

      toast({
        title: "AI Response",
        description: "AI has provided a response on the canvas.",
      });
    } catch (error) {
      console.error("❌ Error asking AI:", error);
      throw error;
    }
  };

  const handleAddContact = async () => {
    try {
      console.log("📱 Adding contact with scene description:", state.sceneDescription);

      const response = await fetch("/api/extract-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_summary: state.sceneDescription,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to extract contact");
      }

      // Save contact to localStorage
      saveContact(data.contact);

      toast({
        title: "Contact Added",
        description: `${data.contact.name} has been added to your contacts.`,
      });
    } catch (error) {
      console.error("❌ Error adding contact:", error);
      throw error;
    }
  };

  const handleSendMessage = async () => {
    try {
      console.log("💬 Sending message with scene description:", state.sceneDescription);

      // Get all contacts for matching
      const contacts = getAllContacts();

      const response = await fetch("/api/extract-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_summary: state.sceneDescription,
          contacts,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to extract message");
      }

      // Create message bubble in sending state
      createMessageBubble(data.message, "sending");

      toast({
        title: "Message Sending",
        description: `Sending message to ${data.message.name}...`,
      });
    } catch (error) {
      console.error("❌ Error sending message:", error);
      throw error;
    }
  };

  const handleReadContactMessages = async () => {
    try {
      console.log("📱 Reading contact messages with scene description:", state.sceneDescription);

      // Get all contacts for matching
      const contacts = getAllContacts();

      // Find the contact mentioned in the scene
      const response = await fetch("/api/extract-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_summary: state.sceneDescription,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to find contact");
      }

      // For now, show a placeholder message
      // In a real implementation, you'd fetch actual messages for this contact
      toast({
        title: "Contact Messages",
        description: `Showing messages from ${data.contact.name}`,
      });

      // Create a sample message bubble to demonstrate
      const sampleMessage: SmartMessage = {
        name: data.contact.name,
        phoneNumber: data.contact.phoneNumber,
        text: "Hey! How are you doing?",
        priority: "normal",
      };

      createMessageBubble(sampleMessage, "reply-available");
    } catch (error) {
      console.error("❌ Error reading contact messages:", error);
      throw error;
    }
  };

  const handleCancel = () => {
    setState((prev) => ({
      ...prev,
      showActionModal: false,
      showContextMenu: false,
      isLoading: false,
    }));
    holdDetectorRef.current?.cancelHoldDetection();
  };

  return (
    <div className="relative w-full h-screen">
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleEditorMount}
        onPointerMove={handlePointerMove}
        onChange={handleShapeChange}
        hideUi={false}
        inferDarkMode
      />

      {/* Built with Bolt Badge */}
      <div className="absolute bottom-4 right-32 z-10">
        <a
          href="https://bolt.new"
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <img
            src="https://imagedelivery.net/9Et2fDgq8Fep_Yl7Wd1RJA/a0f39b44-8a7c-4c3d-8660-6dc93b9d4700/public"
            alt="Built with Bolt"
            className="h-8 w-auto hover:opacity-80 transition-opacity"
          />
        </a>
      </div>

      {/* Magic Wand Tool Button */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-white rounded-lg shadow-lg p-2 border">
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
            onClick={() => {
              toast({
                title: "Magic Wand Tool",
                description: "Draw a circle around content to activate AI actions!",
              });
            }}
          >
            <Wand2 className="w-4 h-4 text-yellow-500" />
            Magic Wand
          </button>
        </div>
      </div>

      {/* Loading Indicator */}
      {state.isLoading && (
        <LoadingIndicator
          position={state.loadingPosition}
          onCancel={handleCancel}
        />
      )}

      {/* Action Prompt Modal */}
      <ActionPromptModal
        open={state.showActionModal}
        onOpenChange={(open) =>
          setState((prev) => ({ ...prev, showActionModal: open }))
        }
        actions={state.actions}
        onActionSelect={handleActionSelect}
        onCancel={handleCancel}
        loading={state.isLoading}
      />

      {/* Context Menu */}
      <AIActionsContextMenu
        actions={state.actions}
        position={state.contextMenuPosition}
        onActionSelect={handleActionSelect}
        open={state.showContextMenu}
        onOpenChange={(open) =>
          setState((prev) => ({ ...prev, showContextMenu: open }))
        }
      />
    </div>
  );
}