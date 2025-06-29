"use client";

import { X, Loader2 } from "lucide-react";

interface LoadingIndicatorProps {
  position: { x: number; y: number };
  onCancel: () => void;
}

export function LoadingIndicator({ position, onCancel }: LoadingIndicatorProps) {
  return (
    <div
      className="fixed z-50 flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-lg"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -50%)"
      }}
    >
      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      <button
        onClick={onCancel}
        className="ml-1 p-1 hover:bg-gray-100 rounded-full transition-colors"
        title="Cancel"
      >
        <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
      </button>
    </div>
  );
}