"use client";

import type { ThemeConfig, ThemeTokens } from "./themes/types";

/**
 * Shows 3 cancel colour options side-by-side for comparison.
 * Active state at the top for reference, then one row per cancel variant.
 */

interface StatesShowcaseProps {
  theme: ThemeConfig;
  isDark: boolean;
}

// ─── Cancel Palette Definitions ─────────────────────────────────────────────

interface CancelPalette {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  borderColor: string;
  cardBg: string;
  labelColor: string;
  dotColor: string;
  dotOpacity: number;
  statusColor: string;
  hintColor: string;
  separatorColor: string;
}

// These are specifically tuned for Neon Grid's dark palette (#0a0a14 canvas)
const NEON_GRID_CANCEL_PALETTES: CancelPalette[] = [
  // ── Amber family ──────────────────────────────────────────────────
  {
    id: "amber-bright",
    name: "B1 · Amber Bright",
    tagline: "Full amber — bold, unmissable warning.",
    accent: "#ffaa00",
    borderColor: "#ffaa0060",
    cardBg: "rgba(255,170,0,0.04)",
    labelColor: "#ffaa0070",
    dotColor: "#ffaa00",
    dotOpacity: 0.5,
    statusColor: "#ffaa00",
    hintColor: "#ffaa0060",
    separatorColor: "#ffaa0030",
  },
  {
    id: "amber-muted",
    name: "B2 · Amber Muted",
    tagline: "Softer amber — still warm, less aggressive.",
    accent: "#cc8800",
    borderColor: "#cc880045",
    cardBg: "rgba(204,136,0,0.03)",
    labelColor: "#cc880055",
    dotColor: "#cc8800",
    dotOpacity: 0.35,
    statusColor: "#cc8800bb",
    hintColor: "#cc880045",
    separatorColor: "#cc880020",
  },
  {
    id: "amber-gold",
    name: "B3 · Gold",
    tagline: "Warmer gold — feels like a paused state, not an error.",
    accent: "#ddaa33",
    borderColor: "#ddaa3350",
    cardBg: "rgba(221,170,51,0.03)",
    labelColor: "#ddaa3360",
    dotColor: "#ddaa33",
    dotOpacity: 0.4,
    statusColor: "#ddaa33cc",
    hintColor: "#ddaa3350",
    separatorColor: "#ddaa3325",
  },
  {
    id: "amber-peach",
    name: "B4 · Peach",
    tagline: "Warm orange-pink — softer, almost friendly.",
    accent: "#ff9966",
    borderColor: "#ff996650",
    cardBg: "rgba(255,153,102,0.025)",
    labelColor: "#ff996660",
    dotColor: "#ff9966",
    dotOpacity: 0.4,
    statusColor: "#ff9966cc",
    hintColor: "#ff996650",
    separatorColor: "#ff996625",
  },

  // ── Frost family ──────────────────────────────────────────────────
  {
    id: "frost-steel",
    name: "C1 · Steel",
    tagline: "Cool blue-grey — clinical, powered off.",
    accent: "#5588aa",
    borderColor: "#5588aa45",
    cardBg: "rgba(85,136,170,0.03)",
    labelColor: "#5588aa50",
    dotColor: "#5588aa",
    dotOpacity: 0.3,
    statusColor: "#5588aa",
    hintColor: "#5588aa45",
    separatorColor: "#5588aa20",
  },
  {
    id: "frost-ice",
    name: "C2 · Ice",
    tagline: "Brighter cold blue — frozen mid-stream.",
    accent: "#66aadd",
    borderColor: "#66aadd45",
    cardBg: "rgba(102,170,221,0.03)",
    labelColor: "#66aadd55",
    dotColor: "#66aadd",
    dotOpacity: 0.35,
    statusColor: "#66aaddcc",
    hintColor: "#66aadd50",
    separatorColor: "#66aadd20",
  },
  {
    id: "frost-slate",
    name: "C3 · Slate",
    tagline: "Fully desaturated — all colour drained, just grey.",
    accent: "#778899",
    borderColor: "#77889940",
    cardBg: "rgba(119,136,153,0.025)",
    labelColor: "#77889950",
    dotColor: "#778899",
    dotOpacity: 0.25,
    statusColor: "#778899bb",
    hintColor: "#77889940",
    separatorColor: "#77889920",
  },
  {
    id: "frost-lavender",
    name: "C4 · Lavender",
    tagline: "Cool purple-grey — distinct from active cyan, still cold.",
    accent: "#8877bb",
    borderColor: "#8877bb40",
    cardBg: "rgba(136,119,187,0.025)",
    labelColor: "#8877bb50",
    dotColor: "#8877bb",
    dotOpacity: 0.3,
    statusColor: "#8877bbcc",
    hintColor: "#8877bb45",
    separatorColor: "#8877bb20",
  },
];

// ─── Neon Grid constants ────────────────────────────────────────────────────
const NG_FONT = "'Share Tech Mono', monospace";
const NG_LABEL_FONT = "'Orbitron', sans-serif";
const NG_GREEN = "#00ffaa";
const NG_CYAN = "#00c8ff";
const NG_TEXT_SEC = "#88ccaa";
const NG_SHADOW = "0 0 20px rgba(0,255,170,0.15), 0 0 40px rgba(0,200,255,0.08)";

export function StatesShowcase({ theme, isDark }: StatesShowcaseProps) {
  const isNeonGrid = theme.id === "cyber-neon-grid";
  const tokens = isDark ? theme.dark : theme.light;

  if (!isNeonGrid) {
    return <GenericStatesShowcase tokens={tokens} theme={theme} />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        width: 680,
        fontFamily: NG_FONT,
      }}
    >
      {/* ── Active reference ──────────────────────────────── */}
      <SectionLabel color={NG_GREEN}>Reference — Active</SectionLabel>
      <NeonGridActiveCard />

      <div style={{ height: 48 }} />

      {/* ── 3 Cancel options ──────────────────────────────── */}
      <SectionLabel color={NG_TEXT_SEC}>Cancel State Options</SectionLabel>

      {NEON_GRID_CANCEL_PALETTES.map((palette, i) => (
        <div key={palette.id} style={{ marginTop: i === 0 ? 0 : 32 }}>
          {/* Option header */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontFamily: NG_LABEL_FONT,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: palette.accent,
              }}
            >
              {palette.name}
            </div>
            <div
              style={{
                fontSize: 12,
                color: NG_TEXT_SEC,
                opacity: 0.5,
                marginTop: 4,
              }}
            >
              {palette.tagline}
            </div>
          </div>

          {/* Two cards side by side: thinking + tool use */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <NeonGridCancelCard palette={palette} statusText="cancelled" />
            <NeonGridCancelCard palette={palette} statusText="cancelled — was reading files..." />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Neon Grid Active Card ──────────────────────────────────────────────────

function NeonGridActiveCard() {
  const dotColors = [NG_GREEN, "#00ddbb", NG_CYAN, "#00ddbb", NG_GREEN];

  return (
    <div
      style={{
        background: "rgba(0,255,170,0.04)",
        borderLeft: `2px solid ${NG_GREEN}`,
        borderRadius: 2,
        boxShadow: NG_SHADOW,
        padding: "20px 24px",
        fontFamily: NG_FONT,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: NG_GREEN,
          marginBottom: 12,
          fontFamily: NG_LABEL_FONT,
        }}
      >
        WOODPECKER
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 24 }}>
        {dotColors.map((color, i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
              animation: `sc-dot-wave 1.4s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 8,
            fontSize: 14,
            color: NG_CYAN,
            opacity: 0.7,
          }}
        >
          thinking deeply...
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          color: NG_GREEN,
          opacity: 0.45,
          marginTop: 10,
        }}
      >
        tap to cancel
      </div>

      <style>{`
        @keyframes sc-dot-wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}

// ─── Neon Grid Cancel Card ──────────────────────────────────────────────────

function NeonGridCancelCard({
  palette,
  statusText,
}: {
  palette: CancelPalette;
  statusText: string;
}) {
  return (
    <div
      style={{
        background: palette.cardBg,
        borderLeft: `2px solid ${palette.borderColor}`,
        borderRadius: 2,
        padding: "20px 24px",
        fontFamily: NG_FONT,
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: palette.labelColor,
          marginBottom: 12,
          fontFamily: NG_LABEL_FONT,
        }}
      >
        WOODPECKER
      </div>

      {/* Frozen dots + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 24 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: palette.dotColor,
              opacity: palette.dotOpacity,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 8,
            fontSize: 14,
            color: palette.statusColor,
            opacity: 0.6,
          }}
        >
          {statusText}
        </span>
      </div>

      {/* Hint */}
      <div
        style={{
          fontSize: 12,
          color: palette.hintColor,
          marginTop: 10,
        }}
      >
        tap to retry · scratch to dismiss
      </div>
    </div>
  );
}

// ─── Section Label ──────────────────────────────────────────────────────────

function SectionLabel({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontFamily: NG_LABEL_FONT,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
        borderBottom: `1px solid ${color}30`,
        paddingBottom: 8,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

// ─── Generic fallback for non-Neon-Grid themes ──────────────────────────────

function GenericStatesShowcase({
  tokens,
  theme,
}: {
  tokens: ThemeTokens;
  theme: ThemeConfig;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 40,
        width: theme.maxWidth ?? 620,
      }}
    >
      <div
        style={{
          fontFamily: theme.fonts.label ?? theme.fonts.primary,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: tokens.accentAi,
          borderBottom: `1px solid ${tokens.accentAi}30`,
          paddingBottom: 8,
        }}
      >
        States — coming soon for this theme
      </div>
    </div>
  );
}
