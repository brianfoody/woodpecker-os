"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { themes } from "./themes";
import { ThemePicker } from "./theme-picker";
import { ExploreThemeProvider } from "./explore-theme-context";
import { CanvasConversation } from "./canvas-conversation";
import { MysticSmokeFilter } from "./mystic-smoke-filter";
import { analyzeForSingleLoop, extractPointsFromShape } from "@/lib/gesture-detection";

export default function ExploreCanvas() {
  const [selectedThemeId, setSelectedThemeId] = useState(themes[0].id);
  const [isDark, setIsDark] = useState(false);
  const [magicPenActive, setMagicPenActive] = useState(false);
  const editorRef = useRef<any>(null);
  const magicShapeIdsRef = useRef<Set<string>>(new Set());
  const [magicShapeIds, setMagicShapeIds] = useState<string[]>([]);
  const [reviewingShapes, setReviewingShapes] = useState<
    Array<{ id: string; bounds: { x: number; y: number; w: number; h: number } }>
  >([]);

  const selectedTheme =
    themes.find((t) => t.id === selectedThemeId) ?? themes[0];

  const handleToggleDark = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  // Keep tldraw colorScheme in sync when isDark changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.user.updateUserPreferences({
        colorScheme: isDark ? "dark" : "light",
      });
    }
  }, [isDark]);

  const handleToggleMagicPen = useCallback(() => {
    setMagicPenActive((prev) => {
      const next = !prev;
      if (editorRef.current) {
        editorRef.current.setCurrentTool(next ? "draw" : "hand");
      }
      return next;
    });
  }, []);

  // Listen for new draw shapes and tag them as magic when magic pen is active
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const unsub = editor.store.listen((event: any) => {
      if (!magicPenActive) return;

      const added = Object.values(event.changes.added) as any[];
      const newMagicIds: string[] = [];

      for (const record of added) {
        if (record.typeName === "shape" && record.type === "draw") {
          if (!magicShapeIdsRef.current.has(record.id)) {
            magicShapeIdsRef.current.add(record.id);
            newMagicIds.push(record.id);
          }
        }
      }

      if (newMagicIds.length > 0) {
        setMagicShapeIds(Array.from(magicShapeIdsRef.current));
      }
    });

    return unsub;
  }, [magicPenActive]);

  // On pointer up, check if the latest magic stroke forms a closed loop
  const magicPenActiveRef = useRef(magicPenActive);
  magicPenActiveRef.current = magicPenActive;

  const handleMount = useCallback((editor: any) => {
    editorRef.current = editor;
    editor.setCurrentTool("hand");
    editor.user.updateUserPreferences({
      colorScheme: isDark ? "dark" : "light",
    });

    editor.on("event", (info: any) => {
      if (info.type !== "pointer" || info.name !== "pointer_up") return;
      if (!magicPenActiveRef.current) return;

      // Find the most recently created magic draw shape
      const allShapes = editor.getCurrentPageShapes();
      const drawShapes = allShapes.filter(
        (s: any) => s.type === "draw" && magicShapeIdsRef.current.has(s.id)
      );
      if (drawShapes.length === 0) return;

      const latestStroke = drawShapes[drawShapes.length - 1];
      const isLoop = analyzeForSingleLoop(latestStroke);

      if (isLoop) {
        // Calculate bounding box of the loop
        const points = extractPointsFromShape(latestStroke);
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const bounds = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        };

        setReviewingShapes((prev) => [
          ...prev,
          { id: latestStroke.id, bounds },
        ]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          onMount={handleMount}
        />
      </ExploreThemeProvider>

      {/* SVG filter definitions + per-shape CSS */}
      <MysticSmokeFilter
        shapeIds={magicShapeIds}
        reviewingShapes={reviewingShapes}
      />

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
          magicPenActive={magicPenActive}
          onSelectTheme={setSelectedThemeId}
          onToggleDark={handleToggleDark}
          onToggleMagicPen={handleToggleMagicPen}
        />
      </div>
    </div>
  );
}
