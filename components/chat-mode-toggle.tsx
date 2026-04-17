"use client";

import { MessageSquare } from "lucide-react";
import type { WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";

interface ChatModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  theme?: WoodpeckerCanvasTheme;
}

export function ChatModeToggle({ enabled, onToggle, theme }: ChatModeToggleProps) {
  const activeBg = theme?.toggleActiveBg ?? "#444";
  const activeColor = theme?.toggleActiveColor ?? "#f5f5f0";
  const inactiveBg = theme?.toggleInactiveBg ?? "#f5f5f0";
  const inactiveColor = theme?.toggleInactiveColor ?? "#999";

  return (
    <button
      onClick={() => onToggle(!enabled)}
      title={enabled ? "Chat mode on" : "Chat mode off"}
      style={{
        position: "fixed",
        top: 12,
        right: 60,
        zIndex: 1000,
        width: 36,
        height: 36,
        border: "1px solid #ccc",
        borderRadius: 8,
        background: enabled ? activeBg : inactiveBg,
        color: enabled ? activeColor : inactiveColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <MessageSquare size={18} />
    </button>
  );
}
