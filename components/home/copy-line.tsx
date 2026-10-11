"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="hm-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      <code>{text}</code>
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
