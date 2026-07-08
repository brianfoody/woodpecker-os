"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createNeonGridTheme } from "@/lib/woodpecker-theme";
import { getConnectorClient } from "@/lib/connector-client";
import { PairingGate } from "@/components/pairing-gate";

const TldrawCanvas = dynamic(() => import("@/components/tldraw-canvas"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "#0a0a14", color: "#88ccaa", fontFamily: "'Share Tech Mono', monospace" }}>
      Loading canvas...
    </div>
  ),
});

export default function CanvasPage() {
  const theme = useMemo(() => createNeonGridTheme("dark"), []);
  // null = still checking (client-only); false = show gate; true = show canvas.
  const [paired, setPaired] = useState<boolean | null>(null);

  useEffect(() => {
    setPaired(getConnectorClient().isPaired());
  }, []);

  if (paired === null) {
    return <div style={{ minHeight: "100vh", background: "#0a0a14" }} />;
  }

  if (!paired) {
    return <PairingGate onPaired={() => setPaired(true)} />;
  }

  return (
    <TldrawCanvas
      theme={theme}
      // Key kept from the /v2 era so existing canvases carry over.
      storageKey="woodpecker-canvas-data-v2"
      darkMode={true}
    />
  );
}
