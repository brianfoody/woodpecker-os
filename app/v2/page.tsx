"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { createNeonGridTheme } from "@/lib/woodpecker-theme";

const TldrawCanvas = dynamic(() => import("@/components/tldraw-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      Loading canvas...
    </div>
  ),
});

export default function V2Page() {
  const [darkMode, setDarkMode] = useState(false);

  const theme = useMemo(() => createNeonGridTheme(darkMode ? "dark" : "light"), [darkMode]);

  return (
    <TldrawCanvas
      theme={theme}
      storageKey="woodpecker-canvas-data-v2"
      darkMode={darkMode}
      onToggleDarkMode={() => setDarkMode((d) => !d)}
    />
  );
}
