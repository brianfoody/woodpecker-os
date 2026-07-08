"use client";

/**
 * Minimal first-visit tutorial: write → circle → reply.
 * Replaces the old contact/SMS onboarding wizard.
 */
export function FirstRunOverlay({
  open,
  onClose,
  darkMode,
}: {
  open: boolean;
  onClose: () => void;
  darkMode?: boolean;
}) {
  if (!open) return null;

  const steps = [
    {
      n: "1",
      text: "Handwrite a task or question anywhere on the canvas — “list my repos”, “scaffold the invoices API”, anything you'd type into Claude Code.",
    },
    {
      n: "2",
      text: "Pick the magic pen and draw a circle around it. Everything inside the circle is the prompt.",
    },
    {
      n: "3",
      text: "Claude Code runs it on your computer and writes back in ink. Circle any reply to branch that conversation.",
    },
  ];

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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          margin: 16,
          padding: "30px 34px",
          borderRadius: 14,
          background: darkMode ? "#10101c" : "#fff",
          color: darkMode ? "#cfe8d8" : "#333",
          border: darkMode ? "1px solid #223" : "1px solid #e5e5e5",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 20, color: darkMode ? "#eafff2" : "#111" }}>
          You&apos;re connected
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 14, opacity: 0.75 }}>
          This canvas now drives the Claude Code on your computer.
        </p>
        <div style={{ display: "grid", gap: 12, marginBottom: 22 }}>
          {steps.map((step) => (
            <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span
                style={{
                  fontFamily: "'Share Tech Mono', ui-monospace, monospace",
                  color: darkMode ? "#88ccaa" : "#0a7",
                  fontSize: 14,
                }}
              >
                {step.n}
              </span>
              <span style={{ fontSize: 14 }}>{step.text}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            background: darkMode ? "#88ccaa" : "#0a7",
            color: darkMode ? "#0a0a14" : "#fff",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Try it
        </button>
      </div>
    </div>
  );
}
