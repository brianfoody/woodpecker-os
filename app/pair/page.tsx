"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parsePairingHash } from "@woodpeckeros/protocol";
import { peekConnectorClient } from "@/lib/connector-client";

/**
 * Pairing hand-off. The connector's QR encodes /pair#<channelId>.<key> —
 * the fragment never reaches the server. We stash it in localStorage,
 * scrub the URL, and head to the canvas.
 */
export default function PairPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const pairing = parsePairingHash(window.location.hash);
    if (!pairing) {
      setFailed(true);
      return;
    }
    localStorage.setItem("woodpecker-pairing", JSON.stringify(pairing));
    // Remove the secret from the address bar and browser history
    window.history.replaceState(null, "", "/pair");
    peekConnectorClient()?.reconfigure();
    router.replace("/canvas");
  }, [router]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 12,
        backgroundColor: "#0a0a14",
        color: "#88ccaa",
        fontFamily: "'Share Tech Mono', ui-monospace, monospace",
        textAlign: "center",
        padding: 24,
      }}
    >
      {failed ? (
        <>
          <div style={{ fontSize: 18 }}>That pairing link isn&apos;t valid.</div>
          <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 420, lineHeight: 1.6 }}>
            On your computer, run <code>npx woodpeckeros connect</code> and scan
            the QR code it prints (or open the printed link on this device).
          </div>
        </>
      ) : (
        <div style={{ fontSize: 16 }}>Pairing…</div>
      )}
    </div>
  );
}
