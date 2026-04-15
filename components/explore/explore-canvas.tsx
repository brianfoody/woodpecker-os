"use client";

import { useState, useCallback } from "react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { themes } from "./themes";
import { ThemePicker } from "./theme-picker";
import { ExploreThemeProvider } from "./explore-theme-context";
import { CanvasConversation } from "./canvas-conversation";

export default function ExploreCanvas() {
  const [selectedThemeId, setSelectedThemeId] = useState(themes[0].id);
  const [isDark, setIsDark] = useState(false);

  const selectedTheme =
    themes.find((t) => t.id === selectedThemeId) ?? themes[0];

  const handleToggleDark = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <ExploreThemeProvider theme={selectedTheme} isDark={isDark}>
        <Tldraw
          components={{
            Toolbar: null,
            MainMenu: null,
            PageMenu: null,
            NavigationPanel: null,
            StylePanel: null,
            HelpMenu: null,
            Minimap: null,
            ActionsMenu: null,
            QuickActions: null,
            OnTheCanvas: CanvasConversation,
          }}
          onMount={(editor) => {
            editor.setCurrentTool("hand");
            editor.user.updateUserPreferences({
              colorScheme: isDark ? "dark" : "light",
            });
          }}
        />
      </ExploreThemeProvider>

      {/* Fixed overlay for theme picker — does NOT pan/zoom */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 999,
        }}
      >
        <ThemePicker
          themes={themes}
          selectedId={selectedThemeId}
          isDark={isDark}
          onSelectTheme={setSelectedThemeId}
          onToggleDark={handleToggleDark}
        />
      </div>
    </div>
  );
}
