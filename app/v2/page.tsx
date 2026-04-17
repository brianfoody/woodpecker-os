"use client";

import dynamic from "next/dynamic";
import { createMossBarkTheme } from "@/lib/woodpecker-theme";

const TldrawCanvas = dynamic(() => import("@/components/tldraw-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      Loading canvas...
    </div>
  ),
});

const theme = createMossBarkTheme();

export default function V2Page() {
  return <TldrawCanvas theme={theme} storageKey="woodpecker-canvas-data-v2" />;
}
