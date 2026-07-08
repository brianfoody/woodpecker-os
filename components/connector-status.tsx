"use client";

import { useEffect, useState } from "react";
import {
  getConnectorClient,
  type ConnectorInfo,
  type ConnectorStatus,
} from "@/lib/connector-client";

const STATUS_STYLE: Record<
  ConnectorStatus,
  { dot: string; label: (info: ConnectorInfo | null) => string }
> = {
  connected: {
    dot: "#4ade80",
    label: (info) => `connected${info?.hostname ? ` · ${info.hostname}` : ""}`,
  },
  "waiting-for-connector": { dot: "#fbbf24", label: () => "waiting for connector" },
  connecting: { dot: "#fbbf24", label: () => "connecting…" },
  unpaired: { dot: "#9ca3af", label: () => "not paired" },
};

export function useConnectorStatus(): {
  status: ConnectorStatus;
  info: ConnectorInfo | null;
} {
  const [status, setStatus] = useState<ConnectorStatus>("connecting");
  const [info, setInfo] = useState<ConnectorInfo | null>(null);

  useEffect(() => {
    const client = getConnectorClient();
    return client.subscribeStatus((s) => {
      setStatus(s);
      setInfo(client.getInfo());
    });
  }, []);

  return { status, info };
}

export function ConnectorStatusPill({
  status,
  info,
  darkMode,
}: {
  status: ConnectorStatus;
  info: ConnectorInfo | null;
  darkMode?: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const style = STATUS_STYLE[status];
  const needsHelp = status !== "connected";

  return (
    <>
      <button
        onClick={() => needsHelp && setShowHelp(true)}
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          zIndex: 300,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 12px",
          borderRadius: 999,
          border: darkMode ? "1px solid #223" : "1px solid #ddd",
          background: darkMode ? "rgba(10,10,20,0.85)" : "rgba(255,255,255,0.9)",
          color: darkMode ? "#88ccaa" : "#555",
          fontSize: 12,
          fontFamily: "'Share Tech Mono', ui-monospace, monospace",
          cursor: needsHelp ? "pointer" : "default",
          backdropFilter: "blur(6px)",
        }}
        title={status === "connected" ? `working in ${info?.cwd ?? ""}` : "click for setup help"}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: style.dot,
            boxShadow: `0 0 6px ${style.dot}`,
          }}
        />
        {style.label(info)}
      </button>

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 460,
              margin: 16,
              padding: "28px 32px",
              borderRadius: 12,
              background: darkMode ? "#10101c" : "#fff",
              color: darkMode ? "#cfe8d8" : "#333",
              border: darkMode ? "1px solid #223" : "1px solid #e5e5e5",
              fontFamily: "system-ui, sans-serif",
              lineHeight: 1.6,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
              Connect your computer
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 14 }}>
              The canvas drives Claude Code on <em>your own machine</em>.
              Nothing runs in the cloud.
            </p>
            <ol style={{ margin: "0 0 14px", paddingLeft: 20, fontSize: 14 }}>
              <li>
                On your computer, run{" "}
                <code
                  style={{
                    background: darkMode ? "#1a1a2e" : "#f4f4f4",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                >
                  npx @woodpeckeros/connect
                </code>
              </li>
              <li>Scan the QR code it prints (or open the link) on this device</li>
              <li>Come back here and circle something with the magic pen</li>
            </ol>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
              Already paired? Make sure the connector is still running on your
              computer.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
