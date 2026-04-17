"use client";

import type { WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";

interface ThinkingIndicatorProps {
  label?: string;
  theme?: WoodpeckerCanvasTheme;
}

export function ThinkingIndicator({ label = "thinking...", theme }: ThinkingIndicatorProps) {
  const color = theme?.thinkingColor ?? "#8b7355";
  const fontFamily = theme?.thinkingFont ?? "var(--font-kalam)";

  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{
        left: "50%",
        bottom: 32,
        transform: "translateX(-50%)",
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: "18px",
          color,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          animation: "pulse-thinking 1.5s ease-in-out infinite",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{ animation: "spin-slow 2s linear infinite" }}
        >
          <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="2" strokeDasharray="20 12" />
        </svg>
        {label}
      </div>

      <style jsx>{`
        @keyframes pulse-thinking {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
