"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Hero call-to-action. "Open the canvas" only makes sense once this device
 * is paired with a connector; new visitors are pointed at setup instead.
 */
export function HeroCta() {
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    try {
      setPaired(!!localStorage.getItem("woodpecker-pairing"));
    } catch {}
  }, []);

  return (
    <div className="lp-cta-row">
      {paired ? (
        <>
          <Link href="/canvas" className="lp-btn lp-btn--primary">
            Open the canvas →
          </Link>
          <a href="#start" className="lp-btn lp-btn--ghost">
            npx @woodpeckeros/connect
          </a>
        </>
      ) : (
        <>
          <a href="#start" className="lp-btn lp-btn--primary">
            Get started →
          </a>
          <a href="#start" className="lp-btn lp-btn--ghost">
            npx @woodpeckeros/connect
          </a>
        </>
      )}
    </div>
  );
}
