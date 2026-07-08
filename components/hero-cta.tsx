"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const mono = "'Share Tech Mono', ui-monospace, monospace";

const primaryStyle: React.CSSProperties = {
  padding: "12px 26px",
  borderRadius: 8,
  background: "#88ccaa",
  color: "#0a0a14",
  fontWeight: 600,
  textDecoration: "none",
  fontSize: 16,
};

const secondaryStyle: React.CSSProperties = {
  padding: "12px 26px",
  borderRadius: 8,
  border: "1px solid #2a3a30",
  color: "#88ccaa",
  textDecoration: "none",
  fontSize: 16,
  fontFamily: mono,
};

/**
 * Hero call-to-action. "Open the canvas" only makes sense once this device
 * is paired with a connector — new visitors are pointed at setup instead.
 */
export function HeroCta() {
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    try {
      setPaired(!!localStorage.getItem("woodpecker-pairing"));
    } catch {}
  }, []);

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 72 }}>
      {paired ? (
        <>
          <Link href="/canvas" style={primaryStyle}>
            Open the canvas
          </Link>
          <a href="#start" style={secondaryStyle}>
            npx woodpeckeros connect
          </a>
        </>
      ) : (
        <>
          <a href="#start" style={primaryStyle}>
            Get started — 3 steps
          </a>
          <a href="#start" style={secondaryStyle}>
            npx woodpeckeros connect
          </a>
        </>
      )}
    </div>
  );
}
