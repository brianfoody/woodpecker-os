"use client";

import type { ThemeConfig } from "./themes/types";
import { earthTones, minimalThreads } from "./themes";

interface ThemePickerProps {
  themes: ThemeConfig[];
  selectedId: string;
  isDark: boolean;
  onSelectTheme: (id: string) => void;
  onToggleDark: () => void;
}

export function ThemePicker({
  selectedId,
  isDark,
  onSelectTheme,
  onToggleDark,
}: ThemePickerProps) {
  const btnBase: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "6px 10px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "-apple-system, sans-serif",
    transition: "background 0.15s",
  };

  const activeBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const textColor = isDark ? "#ccc" : "#333";
  const mutedColor = isDark ? "#888" : "#999";
  const panelBg = isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const renderGroup = (label: string, items: ThemeConfig[]) => (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: mutedColor,
          marginBottom: 6,
          padding: "0 10px",
        }}
      >
        {label}
      </div>
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelectTheme(t.id)}
          style={{
            ...btnBase,
            background: t.id === selectedId ? activeBg : "transparent",
            color: t.id === selectedId ? textColor : mutedColor,
            fontWeight: t.id === selectedId ? 500 : 400,
          }}
          onMouseEnter={(e) => {
            if (t.id !== selectedId) {
              e.currentTarget.style.background = hoverBg;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              t.id === selectedId ? activeBg : "transparent";
          }}
        >
          {t.name}
        </button>
      ))}
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        top: 16,
        zIndex: 1001,
        pointerEvents: "auto",
        width: 180,
        background: panelBg,
        backdropFilter: "blur(12px)",
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: "16px 8px",
        boxShadow: isDark
          ? "0 4px 20px rgba(0,0,0,0.4)"
          : "0 4px 20px rgba(0,0,0,0.08)",
      }}
    >
      {renderGroup("Earth Tones", earthTones)}
      {renderGroup("Minimal Thread", minimalThreads)}

      <div
        style={{
          borderTop: `1px solid ${borderColor}`,
          margin: "8px 0",
          padding: "8px 0 0 0",
        }}
      >
        <button
          onClick={onToggleDark}
          style={{
            ...btnBase,
            background: "transparent",
            color: textColor,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <span style={{ fontSize: 16 }}>{isDark ? "\u2600" : "\u263E"}</span>
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>
      </div>

      <div
        style={{
          borderTop: `1px solid ${borderColor}`,
          margin: "8px 0",
          padding: "8px 0 0 0",
        }}
      >
        <button
          onClick={() => (window.location.href = "/")}
          style={{
            ...btnBase,
            background: "transparent",
            color: mutedColor,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          &larr; Back to Canvas
        </button>
      </div>
    </div>
  );
}
