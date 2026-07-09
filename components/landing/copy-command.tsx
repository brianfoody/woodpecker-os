"use client";

import { useEffect, useRef, useState } from "react";

const COMMAND = "npx @woodpeckeros/connect";

/**
 * Click-to-copy for the connector command. Renders as a link when `href`
 * is given (copies AND navigates, e.g. the nav CTA scrolling to #start)
 * or as a plain button otherwise. Swaps to `copied` content for 2s.
 */
export function CopyCommandButton({
  href,
  className,
  idle,
  copied,
}: {
  href?: string;
  className?: string;
  idle: React.ReactNode;
  copied: React.ReactNode;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = () => {
    try {
      navigator.clipboard?.writeText(COMMAND);
    } catch {}
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 2000);
  };

  const content = done ? copied : idle;
  const title = `Copy "${COMMAND}"`;

  if (href) {
    return (
      <a href={href} className={className} onClick={copy} title={title} aria-live="polite">
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={copy} title={title} aria-live="polite">
      {content}
    </button>
  );
}
