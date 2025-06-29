"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, Check, AlertCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartMessage } from "@/lib/models";
import { toast } from "@/hooks/use-toast";
import {
  isMessageAlreadySent,
  markMessageAsSent,
} from "@/lib/message-deduplication";

type MessageState =
  | "sending"
  | "sent"
  | "failed"
  | "reply-available"
  | "reply"
  | "viewing";
type Priority = "normal" | "important" | "urgent";

interface MessageBubbleProps {
  personName: string;
  text: string;
  phoneNumber?: string; // Added for sending messages
  replyText?: string;
  state: MessageState;
  priority?: Priority;
  onClose?: () => void;
  onViewReply?: () => void;
  onStateChange?: (newState: MessageState) => void;
}

export default function MessageBubble({
  personName = "Alex",
  text = "Hey, are we still on for lunch today?",
  phoneNumber,
  replyText = "Yes! See you at 12:30 at the usual place 😊",
  state = "sending",
  priority = "normal",
  onClose,
  onViewReply,
  onStateChange,
}: MessageBubbleProps) {
  const [currentState, setCurrentState] = useState<MessageState>(state);
  const [isClosing, setIsClosing] = useState(false);
  const isSendingRef = useRef(false); // Track if we're currently sending
  const messageKeyRef = useRef<string>(""); // Track unique message key

  // Create unique key for this message
  const currentMessageKey = `${phoneNumber}-${text}`;
  const isNewMessage = messageKeyRef.current !== currentMessageKey;

  if (isNewMessage) {
    messageKeyRef.current = currentMessageKey;
    isSendingRef.current = false; // Reset for new message
  }

  // Debug: Log prop changes
  console.log("💬 MessageBubble render:", {
    personName,
    text: text.substring(0, 50) + "...",
    phoneNumber,
    state,
    currentState,
    isSending: isSendingRef.current,
    isNewMessage,
    timestamp: new Date().toISOString(),
  });

  // Sync external state prop with internal state (only when prop changes)
  useEffect(() => {
    console.log("💬 MessageBubble state sync:", {
      propState: state,
      currentState,
      shouldUpdate: state !== currentState,
      personName,
      messageKey: currentMessageKey,
    });

    if (state !== currentState) {
      console.log(
        `💬 Updating currentState from ${currentState} to ${state} for ${personName}`
      );
      setCurrentState(state);
    }
  }, [state, currentState, personName, currentMessageKey]);

  // Handle real message sending when state is "sending"
  useEffect(() => {
    console.log("💬 MessageBubble sending check:", {
      currentState,
      phoneNumber,
      hasText: !!text,
      textLength: text.length,
      isSending: isSendingRef.current,
      shouldSend:
        currentState === "sending" &&
        phoneNumber &&
        text &&
        !isSendingRef.current,
    });

    if (
      currentState === "sending" &&
      phoneNumber &&
      text &&
      !isSendingRef.current
    ) {
      const sendMessage = async () => {
        try {
          // Set flag immediately to prevent multiple sends
          isSendingRef.current = true;

          // Check if message was already sent to prevent duplicates
          const alreadySent = isMessageAlreadySent(phoneNumber, text);
          console.log("🔍 MessageBubble: Deduplication check:", {
            phoneNumber,
            text: text.substring(0, 50) + "...",
            alreadySent,
            messageKey: currentMessageKey,
          });

          if (alreadySent) {
            console.log(
              "🚫 MessageBubble: Message already sent, skipping duplicate"
            );
            setCurrentState("sent");
            onStateChange?.("sent");
            return;
          }

          console.log("💬 MessageBubble: Sending message via API", {
            name: personName,
            phoneNumber,
            text: text.substring(0, 50) + "...",
          });

          const message: SmartMessage = {
            name: personName,
            phoneNumber,
            text,
          };

          const response = await fetch("/api/send-message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
          });

          if (!response.ok) {
            throw new Error(
              `API request failed with status ${response.status}`
            );
          }

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || "Failed to send message");
          }

          console.log(
            "✅ MessageBubble: Message sent successfully",
            result.result
          );

          // Mark message as sent to prevent future duplicates
          markMessageAsSent(phoneNumber, text);

          console.log("✅ MessageBubble: Transitioning to sent state");
          setCurrentState("sent");
          onStateChange?.("sent");

          // Note: No longer auto-transitioning to reply-available
          // Reply detection is now handled by polling system in main app
        } catch (error) {
          console.error("❌ MessageBubble: Failed to send message:", error);
          setCurrentState("failed");
          onStateChange?.("failed");
          isSendingRef.current = false; // Reset flag on error so retry is possible

          // Show error toast following our UI pattern
          toast({
            variant: "destructive",
            title: "Message Failed",
            description:
              "Sorry, there was an error sending your message. Please try again.",
          });
        }
      };

      sendMessage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState, phoneNumber, text, personName]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 300); // Increased from 200 to 300 to match animation duration
  };

  const handleViewReply = () => {
    setCurrentState("reply");
    onViewReply?.();
  };

  const handleRetry = () => {
    console.log("💬 MessageBubble: Retrying message send");
    isSendingRef.current = false; // Reset the sending flag
    setCurrentState("sending");
    onStateChange?.("sending");
    // The useEffect will trigger the API call again
  };

  const getBackgroundColor = () => {
    if (currentState === "reply-available") {
      switch (priority) {
        case "important":
          return "bg-blue-50 border-blue-200";
        case "urgent":
          return "bg-rose-50 border-rose-200";
        default:
          return "bg-gray-50 border-gray-200";
      }
    }
    return "bg-gray-50 border-gray-200";
  };

  const getStateIcon = () => {
    switch (currentState) {
      case "sending":
        return <Send className="w-4 h-4 text-blue-500 animate-pulse" />;
      case "sent":
        return <Check className="w-4 h-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "reply-available":
        return <Eye className="w-4 h-4 text-blue-500" />;
      case "reply":
        return null;
      case "viewing":
        return <Eye className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStateText = () => {
    switch (currentState) {
      case "sending":
        return "Sending...";
      case "sent":
        return "Sent";
      case "failed":
        return "Failed to send";
      case "reply-available":
        return "Reply available";
      case "reply":
        return "Reply";
      case "viewing":
        return "Messages";
      default:
        return "";
    }
  };

  const getDisplayText = () => {
    switch (currentState) {
      case "reply-available":
        return "view";
      case "failed":
        return "retry";
      case "reply":
        return replyText;
      case "viewing":
        return text; // For viewing state, text contains the message history
      default:
        return text;
    }
  };

  return (
    <div
      className={`
    relative min-w-80 max-w-md mx-auto
    ${
      isClosing
        ? "transition-all duration-300 ease-in-out scale-90 opacity-0 translate-y-2"
        : ""
    }
  `}
      style={{
        animation: !isClosing ? "welcomePop 0.4s ease-out" : undefined,
      }}
    >
      <div
        className={`
          relative rounded-2xl border-2 p-4 shadow-lg transition-all duration-500 ease-in-out
          ${getBackgroundColor()}
          ${currentState === "reply-available" ? "transform scale-105" : ""}
        `}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow-md hover:bg-gray-100 p-0"
          onClick={handleClose}
        >
          <X className="w-3 h-3" />
        </Button>

        {/* Person name */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
            {personName.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium text-gray-900">{personName}</span>
        </div>

        {/* State indicator */}
        <div className="flex items-center gap-2 mb-3">
          {getStateIcon()}
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            {getStateText()}
          </span>
        </div>

        {/* Message content */}
        <div
          className={`
            transition-all duration-300 ease-in-out
            ${
              currentState === "reply-available"
                ? "transform translate-y-1"
                : ""
            }
          `}
        >
          {currentState === "reply-available" ? (
            <button
              onClick={handleViewReply}
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              {getDisplayText()}
            </button>
          ) : currentState === "failed" ? (
            <button
              onClick={handleRetry}
              className="text-red-600 hover:text-red-700 transition-colors"
            >
              {getDisplayText()}
            </button>
          ) : currentState === "viewing" ? (
            <div className="text-gray-800 leading-relaxed whitespace-pre-line text-sm max-h-48 overflow-y-auto">
              {getDisplayText()}
            </div>
          ) : (
            <p className="text-gray-800 leading-relaxed">{getDisplayText()}</p>
          )}
        </div>

        {/* Removed "Send new message" button - replies are now handled via canvas circling */}
      </div>

      <style jsx>{`
        @keyframes welcomePop {
          0% {
            transform: scale(0.8) translateY(10px);
            opacity: 0;
          }
          50% {
            transform: scale(1.05) translateY(-2px);
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
