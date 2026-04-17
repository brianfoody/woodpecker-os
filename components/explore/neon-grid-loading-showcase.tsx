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

// ─── Shared Card Wrapper ────────────────────────────────────────────────────

function IndicatorCard({
  number,
  name,
  children,
}: {
  number: number;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        borderLeft: `2px solid ${NEON_GREEN}`,
        borderRadius: 2,
        boxShadow: SHADOW,
        padding: "20px 24px",
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
          gap: 12,
          padding: "20px 0",
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
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${CONNECTOR_FROM}40`,
          fontSize: 12,
          color: TEXT_SECONDARY,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            background: NEON_GREEN,
            color: "#0a0a14",
            borderRadius: 2,
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
            fontFamily: LABEL_FONT,
          }}
        >
          {number}
        </span>
        <span style={{ fontWeight: 500 }}>{name}</span>
      </div>
    </div>
  );
}

// ─── 1. Neon Sparkle ────────────────────────────────────────────────────────

function NeonSparkle() {
  return (
    <IndicatorCard number={1} name="Neon Sparkle">
      <div style={{ width: 32, height: 32 }}>
        <svg
          viewBox="0 0 32 32"
          width="32"
          height="32"
          style={{
            animation:
              "ng-sparkle-breathe 2s ease-in-out infinite, ng-sparkle-rotate 8s linear infinite",
          }}
        >
          <rect
            x="13"
            y="2"
            width="6"
            height="28"
            rx="3"
            fill={NEON_GREEN}
            transform="rotate(0 16 16)"
          />
          <rect
            x="13"
            y="2"
            width="6"
            height="28"
            rx="3"
            fill={NEON_GREEN}
            transform="rotate(60 16 16)"
          />
          <rect
            x="13"
            y="2"
            width="6"
            height="28"
            rx="3"
            fill={NEON_GREEN}
            transform="rotate(120 16 16)"
          />
        </svg>
      </div>
      <style jsx>{`
        @keyframes ng-sparkle-breathe {
          0%,
          100% {
            transform: scale(0.9);
          }
          50% {
            transform: scale(1.1);
          }
        }
        @keyframes ng-sparkle-rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 2. Pulsing Dot Trio ────────────────────────────────────────────────────

function PulsingDotTrio() {
  return (
    <IndicatorCard number={2} name="Pulsing Dot Trio">
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {[NEON_GREEN, NEON_CYAN, NEON_GREEN].map((color, i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: color,
              animation: `ng-dot-pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes ng-dot-pulse {
          0%,
          100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          50% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 3. Data Stream ─────────────────────────────────────────────────────────

function DataStream() {
  return (
    <IndicatorCard number={3} name="Data Stream">
      <div
        style={{
          width: 120,
          height: 3,
          borderRadius: 2,
          background: `${CONNECTOR_FROM}30`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 2,
            background: `linear-gradient(90deg, ${CONNECTOR_FROM}, ${CONNECTOR_TO})`,
            animation: "ng-vine-grow 1.8s ease-in-out infinite",
          }}
        />
      </div>
      <style jsx>{`
        @keyframes ng-vine-grow {
          0% {
            width: 0%;
            opacity: 0.6;
          }
          50% {
            width: 100%;
            opacity: 1;
          }
          100% {
            width: 100%;
            opacity: 0;
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 4. Breathing Ring ──────────────────────────────────────────────────────

function BreathingRing() {
  return (
    <IndicatorCard number={4} name="Breathing Ring">
      <div
        style={{
          width: 28,
          height: 28,
          animation: "ng-ring-breathe 2s ease-in-out infinite",
        }}
      >
        <svg viewBox="0 0 28 28" width="28" height="28">
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke={NEON_GREEN}
            strokeWidth="2"
          />
        </svg>
      </div>
      <style jsx>{`
        @keyframes ng-ring-breathe {
          0%,
          100% {
            transform: scale(0.85);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.15);
            opacity: 1;
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 5. Neon Spinner ────────────────────────────────────────────────────────

function NeonSpinner() {
  return (
    <IndicatorCard number={5} name="Neon Spinner">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: "ng-spin 1.5s linear infinite" }}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke={NEON_GREEN}
          strokeWidth="2.5"
          strokeDasharray="22 14"
          strokeLinecap="round"
        />
      </svg>
      <style jsx>{`
        @keyframes ng-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 6. Cyan Ripple ─────────────────────────────────────────────────────────

function CyanRipple() {
  return (
    <IndicatorCard number={6} name="Cyan Ripple">
      <div style={{ width: 40, height: 40, position: "relative" }}>
        {[0, 0.6, 1.2].map((delay, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `2px solid ${NEON_CYAN}`,
              animation: `ng-ripple-expand 2.4s ease-out ${delay}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes ng-ripple-expand {
          0% {
            transform: scale(0.3);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 7. Dot Wave ────────────────────────────────────────────────────────────

function DotWave() {
  const colors = [NEON_GREEN, "#00ddbb", NEON_CYAN, "#00ddbb", NEON_GREEN];
  return (
    <IndicatorCard number={7} name="Dot Wave">
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          height: 24,
        }}
      >
        {colors.map((color, i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
              animation: `ng-dot-wave 1.4s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes ng-dot-wave {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 8. Terminal Cursor ─────────────────────────────────────────────────────

function TerminalCursor() {
  return (
    <IndicatorCard number={8} name="Terminal Cursor">
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 15, color: TEXT, fontFamily: FONT }}>
          thinking
        </span>
        <div
          style={{
            width: 2,
            height: 18,
            background: NEON_GREEN,
            marginLeft: 1,
            animation: "ng-cursor-blink 1s step-end infinite",
          }}
        />
      </div>
      <style jsx>{`
        @keyframes ng-cursor-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 9. Orbiting Nodes ──────────────────────────────────────────────────────

function OrbitingNodes() {
  return (
    <IndicatorCard number={9} name="Orbiting Nodes">
      <div style={{ width: 36, height: 36, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: NEON_CYAN,
            animation: "ng-orbit-a 2.4s ease-in-out infinite",
            top: "50%",
            left: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: NEON_GREEN,
            animation: "ng-orbit-b 2.4s ease-in-out infinite",
            top: "50%",
            left: "50%",
          }}
        />
      </div>
      <style jsx>{`
        @keyframes ng-orbit-a {
          0% {
            transform: translate(-50%, -50%) translate(14px, 0px);
          }
          25% {
            transform: translate(-50%, -50%) translate(0px, -10px);
          }
          50% {
            transform: translate(-50%, -50%) translate(-14px, 0px);
          }
          75% {
            transform: translate(-50%, -50%) translate(0px, 10px);
          }
          100% {
            transform: translate(-50%, -50%) translate(14px, 0px);
          }
        }
        @keyframes ng-orbit-b {
          0% {
            transform: translate(-50%, -50%) translate(-14px, 0px);
          }
          25% {
            transform: translate(-50%, -50%) translate(0px, 10px);
          }
          50% {
            transform: translate(-50%, -50%) translate(14px, 0px);
          }
          75% {
            transform: translate(-50%, -50%) translate(0px, -10px);
          }
          100% {
            transform: translate(-50%, -50%) translate(-14px, 0px);
          }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 10. Fading Blocks ──────────────────────────────────────────────────────

function FadingBlocks() {
  return (
    <IndicatorCard number={10} name="Fading Blocks">
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {[0, 0.3, 0.6].map((delay, i) => (
          <div
            key={i}
            style={{
              width: 20,
              height: 14,
              borderRadius: 2,
              background: "rgba(0,255,170,0.08)",
              borderLeft: `2px solid ${NEON_GREEN}`,
              boxShadow: "0 0 8px rgba(0,255,170,0.1)",
              animation: `ng-block-fade 1.5s ease-in-out ${delay}s infinite`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes ng-block-fade {
          0%,
          100% {
            opacity: 0.2;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </IndicatorCard>
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
      <div
        style={{
          maxWidth: 860,
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: 40 }}>
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
            Loading Indicators
          </h1>
          <p
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              marginTop: 8,
              fontFamily: FONT,
              lineHeight: 1.5,
            }}
          >
            10 styles for the Neon Grid theme. Each renders inline below the
            last Woodpecker card while Claude is streaming.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
          }}
        >
          <NeonSparkle />
          <PulsingDotTrio />
          <DataStream />
          <BreathingRing />
          <NeonSpinner />
          <CyanRipple />
          <DotWave />
          <TerminalCursor />
          <OrbitingNodes />
          <FadingBlocks />
        </div>
      </div>
    </div>
  );
}
