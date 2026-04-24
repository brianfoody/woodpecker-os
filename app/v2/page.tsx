"use client";

import { useMemo } from "react";
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
  const theme = useMemo(() => createNeonGridTheme("dark"), []);

  return (
    <TldrawCanvas
      theme={theme}
      storageKey="woodpecker-canvas-data-v2"
      darkMode={true}
    />
  );
}
