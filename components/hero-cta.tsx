"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CopyCommandButton } from "@/components/landing/copy-command";

/**
 * Hero call-to-action. "Open the canvas" only makes sense once this device
 * is paired with a connector; new visitors are pointed at setup instead.
 * The command chip copies itself to the clipboard.
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
        <Link href="/canvas" className="lp-btn lp-btn--primary">
          Open the canvas →
        </Link>
      ) : (
        <a href="#start" className="lp-btn lp-btn--primary">
          Get started →
        </a>
      )}
      <CopyCommandButton
        className="lp-btn lp-btn--ghost"
        idle={<>npx @woodpeckeros/connect ⧉</>}
        copied={<>✓ copied — run it in your terminal</>}
      />
    </div>
  );
}
