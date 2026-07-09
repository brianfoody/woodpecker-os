"use client";

import React, { useEffect, useState } from "react";

/**
 * Interactive first-visit tutorial.
 *
 * "welcome" shows a modal; the remaining steps are a non-blocking banner
 * that advances when the user actually does the thing:
 *   write  → advances when they type (desktop) or handwrite (touch)
 *   circle → advances when a magic pen loop triggers a session
 *   reply  → auto-dismisses
 * Step progression is driven by TldrawCanvas watching the editor store.
 */
export type TutorialStep = "welcome" | "write" | "circle" | "reply";

export function FirstRunOverlay({
  step,
  onStart,
  onSkip,
  darkMode,
}: {
  step: TutorialStep | null;
  onStart: () => void;
  onSkip: () => void;
  darkMode?: boolean;
}) {
  // pointer: coarse → pen/finger device (iPad, e-ink); otherwise keyboard
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    try {
      setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    } catch {}
  }, []);

  if (!step) return null;

  const palette = {
    bg: darkMode ? "#10101c" : "#fff",
    text: darkMode ? "#cfe8d8" : "#333",
    heading: darkMode ? "#eafff2" : "#111",
    border: darkMode ? "1px solid #223" : "1px solid #e5e5e5",
    accent: darkMode ? "#88ccaa" : "#0a7",
    accentText: darkMode ? "#0a0a14" : "#fff",
  };

  if (step === "welcome") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.6)",
        }}
        onClick={onSkip}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: 440,
            margin: 16,
            padding: "30px 34px",
            borderRadius: 14,
            background: palette.bg,
            color: palette.text,
            border: palette.border,
            fontFamily: "system-ui, sans-serif",
            lineHeight: 1.6,
          }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: 20, color: palette.heading }}>
            You&apos;re connected
          </h2>
          <p style={{ margin: "0 0 18px", fontSize: 14, opacity: 0.75 }}>
            This canvas drives the Claude Code on your computer. Two moves are
            all you need: put a task on the canvas, then circle it with the
            magic pen. Let&apos;s do one together.
          </p>
          <button
            onClick={onStart}
            style={{
              width: "100%",
              padding: "11px 0",
              borderRadius: 8,
              border: "none",
              background: palette.accent,
              color: palette.accentText,
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Show me
          </button>
          <button
            onClick={onSkip}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "6px 0",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: palette.text,
              opacity: 0.55,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Skip the tour
          </button>
        </div>
      </div>
    );
  }

  const content: Record<Exclude<TutorialStep, "welcome">, { chip: string; text: React.ReactNode }> = {
    write: {
      chip: "1 / 2",
      text: isTouch ? (
        <>
          <strong>Write a task</strong> anywhere with your pen — try
          &ldquo;list my repos&rdquo;, anything you&apos;d give Claude Code.
        </>
      ) : (
        <>
          <strong>Type a task</strong>: press <kbd style={kbdStyle(darkMode)}>T</kbd>{" "}
          (or pick the text tool in the toolbar), click the canvas, and type —
          try &ldquo;list my repos&rdquo;.
        </>
      ),
    },
    circle: {
      chip: "2 / 2",
      text: (
        <>
          Now tap the <strong>magic pen</strong> — the glowing wand at the
          bottom right — and <strong>draw a circle</strong> around what you
          wrote. Everything inside the circle becomes the prompt.
        </>
      ),
    },
    reply: {
      chip: "✓",
      text: (
        <>
          Claude Code is on it — the reply lands here in ink. Circle any reply
          to continue that conversation, or write somewhere new to start
          another.
        </>
      ),
    },
  };

  const { chip, text } = content[step];

  return (
    <>
      {step === "circle" && (
        <style>{`
          [data-testid="magic-pen-tool"] {
            border-radius: 999px;
            animation: wp-tut-pulse 1.3s ease-in-out infinite;
          }
          @keyframes wp-tut-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
            50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          }
        `}</style>
      )}
      <div
        style={{
          position: "fixed",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 400,
          display: "flex",
          alignItems: "center",
          gap: 12,
          maxWidth: 520,
          width: "calc(100% - 32px)",
          padding: "12px 14px 12px 16px",
          borderRadius: 12,
          background: palette.bg,
          color: palette.text,
          border: palette.border,
          boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <span
          style={{
            flexShrink: 0,
            fontFamily: "'Share Tech Mono', ui-monospace, monospace",
            fontSize: 12,
            color: palette.accent,
            border: `1px solid ${palette.accent}`,
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          {chip}
        </span>
        <span style={{ flex: 1 }}>{text}</span>
        <button
          onClick={onSkip}
          aria-label="Dismiss tutorial"
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: palette.text,
            opacity: 0.5,
            fontSize: 16,
            cursor: "pointer",
            padding: 4,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    </>
  );
}

function kbdStyle(darkMode?: boolean): React.CSSProperties {
  return {
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    padding: "1px 5px",
    borderRadius: 4,
    border: darkMode ? "1px solid #334" : "1px solid #ccc",
    background: darkMode ? "#1a1a2a" : "#f4f4f4",
  };
}
