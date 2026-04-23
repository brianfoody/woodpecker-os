"use client";

// ─── Neon Grid Theme Palette ────────────────────────────────────────────────
const NEON_GREEN = "#00ffaa";
const NEON_CYAN = "#00c8ff";
const CONNECTOR_FROM = "#00ffaa";
const CONNECTOR_TO = "#00c8ff";
const CARD_BG = "rgba(0,255,170,0.04)";
const TEXT = "#d0ffe8";
const TEXT_SECONDARY = "#88ccaa";
const CANVAS_BG = "#0a0a14";
const SHADOW =
  "0 0 20px rgba(0,255,170,0.15), 0 0 40px rgba(0,200,255,0.08)";
const FONT = "'Share Tech Mono', monospace";
const LABEL_FONT = "'Orbitron', sans-serif";

// ─── Cancel Colour Palettes ─────────────────────────────────────────────────

interface CancelPalette {
  id: string;
  name: string;
  description: string;
  accent: string;        // primary cancel accent
  accentDim: string;     // dimmed version for borders/bg
  cardBg: string;        // card background tint
  borderColor: string;   // left accent border
  dotOpacity: number;    // how dim the frozen indicators get
  textColor: string;     // status text colour
  hintColor: string;     // "tap to retry" hint
  labelDim: string;      // WOODPECKER label dimmed
  separatorColor: string;
}

const PALETTES: CancelPalette[] = [
  {
    id: "dimmed-green",
    name: "A · Dimmed Green",
    description: "Same hue, just powered down — no colour shift at all",
    accent: "#00ffaa",
    accentDim: "#00ffaa30",
    cardBg: "rgba(0,255,170,0.02)",
    borderColor: "#00ffaa40",
    dotOpacity: 0.2,
    textColor: "#00ffaa60",
    hintColor: "#00ffaa40",
    labelDim: "#00ffaa50",
    separatorColor: "#00ffaa20",
  },
  {
    id: "amber",
    name: "B · Amber Warning",
    description: "Warm caution signal — distinct but not aggressive",
    accent: "#ffaa00",
    accentDim: "#ffaa0040",
    cardBg: "rgba(255,170,0,0.03)",
    borderColor: "#ffaa0060",
    dotOpacity: 0.35,
    textColor: "#ffaa00",
    hintColor: "#ffaa0060",
    labelDim: "#00ffaa50",
    separatorColor: "#ffaa0030",
  },
  {
    id: "soft-red",
    name: "C · Soft Red",
    description: "Warmer, less saturated red — gentler than the current neon red",
    accent: "#ff6b6b",
    accentDim: "#ff6b6b30",
    cardBg: "rgba(255,107,107,0.025)",
    borderColor: "#ff6b6b50",
    dotOpacity: 0.3,
    textColor: "#ff6b6b",
    hintColor: "#ff6b6b50",
    labelDim: "#00ffaa50",
    separatorColor: "#ff6b6b25",
  },
  {
    id: "ghost",
    name: "D · Ghost",
    description: "Fully desaturated — like the power was cut",
    accent: "#667788",
    accentDim: "#66778840",
    cardBg: "rgba(102,119,136,0.03)",
    borderColor: "#66778850",
    dotOpacity: 0.25,
    textColor: "#667788",
    hintColor: "#66778850",
    labelDim: "#66778860",
    separatorColor: "#66778825",
  },
  {
    id: "magenta",
    name: "E · Magenta Neon",
    description: "Stays in the neon family — cancelled but still electric",
    accent: "#ff44cc",
    accentDim: "#ff44cc35",
    cardBg: "rgba(255,68,204,0.025)",
    borderColor: "#ff44cc50",
    dotOpacity: 0.35,
    textColor: "#ff44cc",
    hintColor: "#ff44cc50",
    labelDim: "#00ffaa50",
    separatorColor: "#ff44cc25",
  },
  {
    id: "ice",
    name: "F · Ice Blue",
    description: "Cool down from green to a cold, frozen blue",
    accent: "#6688cc",
    accentDim: "#6688cc40",
    cardBg: "rgba(102,136,204,0.03)",
    borderColor: "#6688cc50",
    dotOpacity: 0.3,
    textColor: "#6688cc",
    hintColor: "#6688cc50",
    labelDim: "#6688cc60",
    separatorColor: "#6688cc25",
  },
];

// ─── Shared Card Wrapper ────────────────────────────────────────────────────

function CancelCard({
  palette,
  children,
}: {
  palette: CancelPalette;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: palette.cardBg,
        borderLeft: `2px solid ${palette.borderColor}`,
        borderRadius: 2,
        padding: "16px 20px",
        fontFamily: FONT,
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: palette.labelDim,
          marginBottom: 8,
          fontFamily: LABEL_FONT,
        }}
      >
        WOODPECKER
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "16px 0",
        }}
      >
        {children}
        <div
          style={{
            fontSize: 14,
            color: palette.textColor,
            fontFamily: FONT,
            opacity: 0.6,
          }}
        >
          cancelled
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: palette.hintColor,
          fontFamily: FONT,
          textAlign: "center",
          marginTop: 4,
        }}
      >
        tap to retry · scratch to dismiss
      </div>
    </div>
  );
}

function ActiveCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: CARD_BG,
        borderLeft: `2px solid ${NEON_GREEN}`,
        borderRadius: 2,
        boxShadow: SHADOW,
        padding: "16px 20px",
        fontFamily: FONT,
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: NEON_GREEN,
          marginBottom: 8,
          fontFamily: LABEL_FONT,
        }}
      >
        WOODPECKER
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "16px 0",
        }}
      >
        {children}
        <div
          style={{
            fontSize: 14,
            color: TEXT_SECONDARY,
            fontFamily: FONT,
            opacity: 0.7,
          }}
        >
          thinking...
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: `${NEON_GREEN}70`,
          fontFamily: FONT,
          textAlign: "center",
          marginTop: 4,
        }}
      >
        tap to cancel
      </div>
    </div>
  );
}

// ─── Indicator Internals (just the animated/frozen bits) ────────────────────

function DotWaveInner({ color, animated }: { color: string; animated: boolean; opacity?: number }) {
  const colors = animated
    ? [NEON_GREEN, "#00ddbb", NEON_CYAN, "#00ddbb", NEON_GREEN]
    : [color, color, color, color, color];
  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center", height: 24 }}>
        {colors.map((c, i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: c,
              animation: animated
                ? `ng-dot-wave 1.4s ease-in-out ${i * 0.12}s infinite`
                : "none",
              opacity: animated ? 1 : 0.35,
            }}
          />
        ))}
      </div>
      {animated && (
        <style>{`
          @keyframes ng-dot-wave {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
        `}</style>
      )}
    </>
  );
}

function DataStreamInner({ color, animated }: { color: string; animated: boolean }) {
  return (
    <>
      <div
        style={{
          width: 120,
          height: 3,
          borderRadius: 2,
          background: animated ? `${CONNECTOR_FROM}30` : `${color}20`,
          overflow: "hidden",
        }}
      >
        {animated ? (
          <div
            style={{
              height: "100%",
              borderRadius: 2,
              background: `linear-gradient(90deg, ${CONNECTOR_FROM}, ${CONNECTOR_TO})`,
              animation: "ng-vine-grow 1.8s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            style={{
              height: "100%",
              width: "40%",
              borderRadius: 2,
              background: `${color}50`,
            }}
          />
        )}
      </div>
      {animated && (
        <style>{`
          @keyframes ng-vine-grow {
            0% { width: 0%; opacity: 0.6; }
            50% { width: 100%; opacity: 1; }
            100% { width: 100%; opacity: 0; }
          }
        `}</style>
      )}
    </>
  );
}

function TerminalCursorInner({ color, animated }: { color: string; animated: boolean }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span
          style={{
            fontSize: 15,
            color: animated ? TEXT : color,
            fontFamily: FONT,
            opacity: animated ? 1 : 0.5,
            textDecoration: animated ? "none" : "line-through",
          }}
        >
          {animated ? "thinking" : "cancelled"}
        </span>
        {animated && (
          <div
            style={{
              width: 2,
              height: 18,
              background: NEON_GREEN,
              marginLeft: 1,
              animation: "ng-cursor-blink 1s step-end infinite",
            }}
          />
        )}
        {!animated && (
          <div
            style={{
              width: 8,
              height: 2,
              background: color,
              marginLeft: 4,
              opacity: 0.5,
            }}
          />
        )}
      </div>
      {animated && (
        <style>{`
          @keyframes ng-cursor-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
      )}
    </>
  );
}

function SpinnerInner({ color, animated }: { color: string; animated: boolean }) {
  return (
    <>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{
          animation: animated ? "ng-spin 1.5s linear infinite" : "none",
          opacity: animated ? 1 : 0.3,
        }}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke={animated ? NEON_GREEN : color}
          strokeWidth="2.5"
          strokeDasharray="22 14"
          strokeLinecap="round"
        />
      </svg>
      {animated && (
        <style>{`
          @keyframes ng-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      )}
    </>
  );
}

function BreathingRingInner({ color, animated }: { color: string; animated: boolean }) {
  return (
    <>
      <div
        style={{
          width: 28,
          height: 28,
          animation: animated ? "ng-ring-breathe 2s ease-in-out infinite" : "none",
        }}
      >
        <svg viewBox="0 0 28 28" width="28" height="28">
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke={animated ? NEON_GREEN : color}
            strokeWidth="2"
            opacity={animated ? 1 : 0.3}
            {...(!animated ? { strokeDasharray: "6 4" } : {})}
          />
        </svg>
      </div>
      {animated && (
        <style>{`
          @keyframes ng-ring-breathe {
            0%, 100% { transform: scale(0.85); opacity: 0.5; }
            50% { transform: scale(1.15); opacity: 1; }
          }
        `}</style>
      )}
    </>
  );
}

// ─── Showcase ───────────────────────────────────────────────────────────────

export default function NeonGridLoadingShowcase() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: CANVAS_BG,
        fontFamily: FONT,
        padding: "40px 20px 80px",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;600;700&display=swap"
      />
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ marginBottom: 48 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: NEON_GREEN,
              margin: 0,
              fontFamily: LABEL_FONT,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Cancel State — Colour Variants
          </h1>
          <p
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              marginTop: 8,
              fontFamily: FONT,
              lineHeight: 1.6,
              maxWidth: 700,
            }}
          >
            Active state on the left for reference. Each row shows the same 5
            indicators in a different cancel colour palette. Pick the one that
            feels right for Neon Grid.
          </p>
        </div>

        {/* ── Active reference row ────────────────────────────── */}
        <SectionLabel color={NEON_GREEN}>
          Reference — Active State
        </SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 16,
            marginBottom: 48,
          }}
        >
          <ActiveCard><DotWaveInner color={NEON_GREEN} animated /></ActiveCard>
          <ActiveCard><DataStreamInner color={NEON_GREEN} animated /></ActiveCard>
          <ActiveCard><TerminalCursorInner color={NEON_GREEN} animated /></ActiveCard>
          <ActiveCard><SpinnerInner color={NEON_GREEN} animated /></ActiveCard>
          <ActiveCard><BreathingRingInner color={NEON_GREEN} animated /></ActiveCard>
        </div>

        {/* ── Cancel palette rows ─────────────────────────────── */}
        {PALETTES.map((palette) => (
          <div key={palette.id} style={{ marginBottom: 48 }}>
            <SectionLabel color={palette.accent}>
              {palette.name}
            </SectionLabel>
            <p
              style={{
                fontSize: 12,
                color: TEXT_SECONDARY,
                fontFamily: FONT,
                margin: "4px 0 16px 0",
                opacity: 0.6,
              }}
            >
              {palette.description}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 16,
              }}
            >
              <CancelCard palette={palette}>
                <DotWaveInner color={palette.accent} animated={false} />
              </CancelCard>
              <CancelCard palette={palette}>
                <DataStreamInner color={palette.accent} animated={false} />
              </CancelCard>
              <CancelCard palette={palette}>
                <TerminalCursorInner color={palette.accent} animated={false} />
              </CancelCard>
              <CancelCard palette={palette}>
                <SpinnerInner color={palette.accent} animated={false} />
              </CancelCard>
              <CancelCard palette={palette}>
                <BreathingRingInner color={palette.accent} animated={false} />
              </CancelCard>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
        fontFamily: LABEL_FONT,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
        borderBottom: `1px solid ${color}30`,
        paddingBottom: 8,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
