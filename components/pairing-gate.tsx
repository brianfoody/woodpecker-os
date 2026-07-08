"use client";

import { useState } from "react";
import { parsePairingHash } from "@woodpeckeros/protocol";
import { getConnectorClient } from "@/lib/connector-client";

const mono = "'Share Tech Mono', ui-monospace, monospace";
const CONNECT_CMD = "npx @woodpeckeros/connect";

/**
 * Shown at /canvas when this device has never been paired. The connector
 * (running on the user's computer) prints a QR + link; the user either
 * scans the QR with this device — which opens /pair and pairs automatically
 * — or pastes the printed link here.
 */
export function PairingGate({ onPaired }: { onPaired: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function submit() {
    const trimmed = value.trim();
    const hash = trimmed.includes("#")
      ? trimmed.slice(trimmed.indexOf("#") + 1)
      : trimmed;
    const pairing = parsePairingHash(hash);
    if (!pairing) {
      setError("That doesn't look like a pairing link. Copy the whole line the connector printed.");
      return;
    }
    localStorage.setItem("woodpecker-pairing", JSON.stringify(pairing));
    getConnectorClient().reconfigure();
    onPaired();
  }

  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(CONNECT_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a14",
        color: "#cfe8d8",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 460, width: "100%" }}>
        <p style={{ fontFamily: mono, color: "#88ccaa", fontSize: 13, letterSpacing: 2, margin: 0 }}>
          WOODPECKER OS
        </p>
        <h1 style={{ fontSize: 26, color: "#eafff2", margin: "10px 0 8px", fontWeight: 600 }}>
          Connect your computer
        </h1>
        <p style={{ fontSize: 15, opacity: 0.8, lineHeight: 1.6, margin: "0 0 26px" }}>
          The canvas drives Claude Code on <em>your own machine</em> — nothing
          runs in the cloud. Pair this device once to begin.
        </p>

        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 20 }}>
          <li>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontFamily: mono, color: "#88ccaa" }}>1</span>
              <span style={{ fontSize: 15 }}>On your computer, run:</span>
            </div>
            <button
              onClick={copyCmd}
              style={{
                width: "100%",
                textAlign: "left",
                fontFamily: mono,
                fontSize: 15,
                color: "#88ccaa",
                background: "#131322",
                border: "1px solid #223",
                borderRadius: 8,
                padding: "12px 14px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
              title="Click to copy"
            >
              <span>{CONNECT_CMD}</span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{copied ? "copied" : "copy"}</span>
            </button>
            <p style={{ fontSize: 13, opacity: 0.55, margin: "8px 0 0" }}>
              Needs Node 20+ and a signed-in Claude Code (Pro/Max or API key).
            </p>
          </li>

          <li>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontFamily: mono, color: "#88ccaa" }}>2</span>
              <span style={{ fontSize: 15 }}>
                Scan the QR code it prints with this device&apos;s camera — or
                paste the link it prints below:
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="https://woodpeckeros.com/pair#…"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                style={{
                  flex: 1,
                  fontFamily: mono,
                  fontSize: 14,
                  color: "#cfe8d8",
                  background: "#0e0e1a",
                  border: `1px solid ${error ? "#a55" : "#223"}`,
                  borderRadius: 8,
                  padding: "11px 13px",
                  outline: "none",
                }}
              />
              <button
                onClick={submit}
                style={{
                  padding: "0 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#88ccaa",
                  color: "#0a0a14",
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                Pair
              </button>
            </div>
            {error && (
              <p style={{ color: "#e79", fontSize: 13, margin: "8px 0 0" }}>{error}</p>
            )}
          </li>
        </ol>
      </div>
    </div>
  );
}
