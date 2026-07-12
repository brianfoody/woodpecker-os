"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getConnectorClient } from "@/lib/connector-client";
import { PairingGate } from "@/components/pairing-gate";

const DayShell = dynamic(() => import("@/components/daily/day-shell"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "#0a0a14", color: "#88ccaa", fontFamily: "'Share Tech Mono', monospace" }}>
      Loading your day...
    </div>
  ),
});

export default function TodayPage() {
  // null = still checking (client-only); false = show gate; true = show shell.
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

  return <DayShell />;
}
