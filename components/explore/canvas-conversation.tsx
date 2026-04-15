"use client";

import { useExploreTheme } from "./explore-theme-context";
import { ConversationPanel } from "./conversation-panel";

export function CanvasConversation() {
  const { theme, isDark } = useExploreTheme();

  return (
    <div
      style={{
        position: "absolute",
        left: 200,
        top: 100,
        pointerEvents: "none",
      }}
    >
      <ConversationPanel theme={theme} isDark={isDark} />
    </div>
  );
}
