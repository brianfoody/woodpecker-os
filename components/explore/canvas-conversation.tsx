"use client";

import { useExploreTheme } from "./explore-theme-context";
import { ConversationPanel } from "./conversation-panel";
import { StatesShowcase } from "./states-showcase";
import { LiveDesign } from "./live-design";
import { MagicInkShowcase } from "./magic-ink-showcase";

export function CanvasConversation() {
  const { theme, isDark } = useExploreTheme();

  return (
    <>
      {/* Left column: Live Design */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 100,
          pointerEvents: "none",
        }}
      >
        <LiveDesign theme={theme} isDark={isDark} />
      </div>

      {/* Center column: Conversation preview */}
      <div
        style={{
          position: "absolute",
          left: 800,
          top: 100,
          pointerEvents: "none",
        }}
      >
        <ConversationPanel theme={theme} isDark={isDark} />
      </div>

      {/* Right column: States showcase */}
      <div
        style={{
          position: "absolute",
          left: 1500,
          top: 100,
          pointerEvents: "none",
        }}
      >
        <StatesShowcase theme={theme} isDark={isDark} />
      </div>

      {/* Far right column: Magic Ink showcase */}
      <div
        style={{
          position: "absolute",
          left: 2250,
          top: 100,
          pointerEvents: "none",
        }}
      >
        <MagicInkShowcase theme={theme} isDark={isDark} />
      </div>
    </>
  );
}
