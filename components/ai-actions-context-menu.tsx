"use client";

import { AIAction } from "@/lib/models";
import { useEffect, useState } from "react";

interface AIActionsMenuProps {
  actions: AIAction[];
  position: { x: number; y: number };
  onActionSelect: (action: AIAction) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIActionsContextMenu({
  actions,
  position,
  onActionSelect,
  open,
  onOpenChange,
}: AIActionsMenuProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(open);
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };

    const handleClickOutside = () => {
      onOpenChange(false);
    };

    if (isVisible) {
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isVisible, onOpenChange]);

  if (!isVisible || actions.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed z-50 min-w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -10px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {actions.map((action) => (
        <div
          key={action.id}
          onClick={() => onActionSelect(action)}
          className="flex flex-col items-start gap-1 p-3 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
        >
          <div className="font-medium text-sm">{action.text}</div>
          <div className="text-xs text-muted-foreground">{action.text}</div>
        </div>
      ))}
    </div>
  );
}
