"use client";

import dynamic from "next/dynamic";

// Dynamically import the TldrawCanvas component with SSR disabled
const TldrawCanvas = dynamic(() => import("@/components/tldraw-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      Loading canvas...
    </div>
  ),
});

export default function Home() {
  return <TldrawCanvas />;
}
