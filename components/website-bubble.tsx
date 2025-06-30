"use client";

import { useState } from "react";
import { X, Globe, ExternalLink, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";

type WebsiteStatus = "creating" | "deploying" | "complete" | "failed";

interface WebsiteBubbleProps {
  sketchDescription: string;
  status: WebsiteStatus;
  progress?: number;
  netlifyUrl?: string;
  boltUrl?: string;
  errorMessage?: string;
  onClose?: () => void;
  onRetry?: () => void;
}

export default function WebsiteBubble({
  sketchDescription = "Website sketch",
  status = "creating",
  progress = 0,
  netlifyUrl,
  boltUrl,
  errorMessage,
  onClose,
  onRetry,
}: WebsiteBubbleProps) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 300);
  };

  const handleOpenSite = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    toast({
      title: "Opening Website",
      description: "Your new website is opening in a new tab.",
    });
  };

  const getStatusIcon = () => {
    switch (status) {
      case "creating":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "deploying":
        return <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />;
      case "complete":
        return <Globe className="w-4 h-4 text-green-500" />;
      case "failed":
        return <RotateCcw className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "creating":
        return "Creating website...";
      case "deploying":
        return "Deploying to Netlify...";
      case "complete":
        return "Website ready!";
      case "failed":
        return "Creation failed";
      default:
        return "";
    }
  };

  const getBackgroundColor = () => {
    switch (status) {
      case "creating":
        return "bg-blue-50 border-blue-200";
      case "deploying":
        return "bg-orange-50 border-orange-200";
      case "complete":
        return "bg-green-50 border-green-200";
      case "failed":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  return (
    <div
      className={`
        relative min-w-96 max-w-lg mx-auto
        ${
          isClosing
            ? "transition-all duration-300 ease-in-out scale-90 opacity-0 translate-y-2"
            : ""
        }
      `}
      style={{
        animation: !isClosing ? "websitePop 0.4s ease-out" : undefined,
      }}
    >
      <div
        className={`
          relative rounded-2xl border-2 p-6 shadow-lg transition-all duration-500 ease-in-out
          ${getBackgroundColor()}
          ${status === "complete" ? "transform scale-105" : ""}
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

        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Website Creation</h3>
            <p className="text-sm text-gray-600">From your sketch</p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 mb-4">
          {getStatusIcon()}
          <span className="text-sm font-medium text-gray-700">
            {getStatusText()}
          </span>
        </div>

        {/* Progress bar (for creating/deploying states) */}
        {(status === "creating" || status === "deploying") && (
          <div className="mb-4">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-gray-500 mt-1">{progress}% complete</p>
          </div>
        )}

        {/* Sketch description */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 italic">
            &ldquo;{sketchDescription}&rdquo;
          </p>
        </div>

        {/* Success state - website links */}
        {status === "complete" && netlifyUrl && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-3 border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Live Website</p>
                  <p className="text-xs text-gray-500 truncate max-w-48">
                    {netlifyUrl}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleOpenSite(netlifyUrl)}
                  className="shrink-0"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Open
                </Button>
              </div>
            </div>

            {boltUrl && (
              <div className="bg-white rounded-lg p-3 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Edit Project</p>
                    <p className="text-xs text-gray-500 truncate max-w-48">
                      bolt.new project
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenSite(boltUrl)}
                    className="shrink-0"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {status === "failed" && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-3 border border-red-200">
              <p className="text-sm text-red-700">
                {errorMessage || "Something went wrong while creating your website."}
              </p>
            </div>
            {onRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                className="w-full"
              >
                <RotateCcw className="w-3 h-3 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes websitePop {
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