"use client";

// ─── Moss & Bark Theme Palette ──────────────────────────────────────────────
const BARK = "#6b4f3a";
const MOSS = "#5a6e48";
const CONNECTOR_FROM = "#a0aa90";
const CONNECTOR_TO = "#9a8e7e";
const CARD_BG = "#f3f0eb";
const TEXT = "#2a2820";
const TEXT_SECONDARY = "#5a5647";
const CANVAS_BG = "#f8f7f4";
const SHADOW = "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)";
const FONT = "'DM Sans', sans-serif";

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
        borderLeft: `5px solid ${BARK}`,
        borderRadius: 16,
        boxShadow: SHADOW,
        padding: "20px 24px",
        fontFamily: FONT,
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: BARK,
          marginBottom: 8,
        }}
      >
        Woodpecker
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
            background: BARK,
            color: "#fff",
            borderRadius: 6,
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {number}
        </span>
        <span style={{ fontWeight: 500 }}>{name}</span>
      </div>
    </div>
  );
}

// ─── 1. Claude Sparkle ──────────────────────────────────────────────────────

function ClaudeSparkle() {
  return (
    <IndicatorCard number={1} name="Claude Sparkle">
      <div style={{ width: 32, height: 32 }}>
        <svg
          viewBox="0 0 32 32"
          width="32"
          height="32"
          style={{ animation: "sparkle-breathe 2s ease-in-out infinite, sparkle-rotate 8s linear infinite" }}
        >
          {/* Six-pointed sparkle: three overlapping rounded rects at 0°, 60°, 120° */}
          <rect x="13" y="2" width="6" height="28" rx="3" fill={BARK} transform="rotate(0 16 16)" />
          <rect x="13" y="2" width="6" height="28" rx="3" fill={BARK} transform="rotate(60 16 16)" />
          <rect x="13" y="2" width="6" height="28" rx="3" fill={BARK} transform="rotate(120 16 16)" />
        </svg>
      </div>
      <style jsx>{`
        @keyframes sparkle-breathe {
          0%, 100% { transform: scale(0.9); }
          50% { transform: scale(1.1); }
        }
        @keyframes sparkle-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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
        {[BARK, MOSS, BARK].map((color, i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: color,
              animation: `dot-pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes dot-pulse {
          0%, 100% { transform: scale(0.6); opacity: 0.4; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 3. Growing Vine ────────────────────────────────────────────────────────

function GrowingVine() {
  return (
    <IndicatorCard number={3} name="Growing Vine">
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
            animation: "vine-grow 1.8s ease-in-out infinite",
          }}
        />
      </div>
      <style jsx>{`
        @keyframes vine-grow {
          0% { width: 0%; opacity: 0.6; }
          50% { width: 100%; opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 4. Breathing Ring ──────────────────────────────────────────────────────

function BreathingRing() {
  return (
    <IndicatorCard number={4} name="Breathing Ring">
      <div style={{ width: 28, height: 28, animation: "ring-breathe 2s ease-in-out infinite" }}>
        <svg viewBox="0 0 28 28" width="28" height="28">
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke={BARK}
            strokeWidth="2"
          />
        </svg>
      </div>
      <style jsx>{`
        @keyframes ring-breathe {
          0%, 100% { transform: scale(0.85); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 5. Bark Spinner ────────────────────────────────────────────────────────

function BarkSpinner() {
  return (
    <IndicatorCard number={5} name="Bark Spinner">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: "bark-spin 1.5s linear infinite" }}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke={BARK}
          strokeWidth="2.5"
          strokeDasharray="22 14"
          strokeLinecap="round"
        />
      </svg>
      <style jsx>{`
        @keyframes bark-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 6. Moss Ripple ─────────────────────────────────────────────────────────

function MossRipple() {
  return (
    <IndicatorCard number={6} name="Moss Ripple">
      <div style={{ width: 40, height: 40, position: "relative" }}>
        {[0, 0.6, 1.2].map((delay, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `2px solid ${MOSS}`,
              animation: `ripple-expand 2.4s ease-out ${delay}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes ripple-expand {
          0% { transform: scale(0.3); opacity: 0.8; }
          100% { transform: scale(1.2); opacity: 0; }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 7. Dot Wave ────────────────────────────────────────────────────────────

function DotWave() {
  const colors = [BARK, "#6a5c42", CONNECTOR_TO, "#6a6e52", MOSS];
  return (
    <IndicatorCard number={7} name="Dot Wave">
      <div style={{ display: "flex", gap: 6, alignItems: "center", height: 24 }}>
        {colors.map((color, i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
              animation: `dot-wave 1.4s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes dot-wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 8. Typewriter Cursor ───────────────────────────────────────────────────

function TypewriterCursor() {
  return (
    <IndicatorCard number={8} name="Typewriter Cursor">
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 15, color: TEXT, fontFamily: FONT }}>
          thinking
        </span>
        <div
          style={{
            width: 2,
            height: 18,
            background: BARK,
            marginLeft: 1,
            animation: "cursor-blink 1s step-end infinite",
          }}
        />
      </div>
      <style jsx>{`
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── 9. Orbiting Leaves ─────────────────────────────────────────────────────

function OrbitingLeaves() {
  return (
    <IndicatorCard number={9} name="Orbiting Leaves">
      <div style={{ width: 36, height: 36, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: "50% 50% 50% 20%",
            background: MOSS,
            animation: "orbit-a 2.4s ease-in-out infinite",
            top: "50%",
            left: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: "50% 50% 50% 20%",
            background: BARK,
            animation: "orbit-b 2.4s ease-in-out infinite",
            top: "50%",
            left: "50%",
          }}
        />
      </div>
      <style jsx>{`
        @keyframes orbit-a {
          0%   { transform: translate(-50%, -50%) translate(14px, 0px); }
          25%  { transform: translate(-50%, -50%) translate(0px, -10px); }
          50%  { transform: translate(-50%, -50%) translate(-14px, 0px); }
          75%  { transform: translate(-50%, -50%) translate(0px, 10px); }
          100% { transform: translate(-50%, -50%) translate(14px, 0px); }
        }
        @keyframes orbit-b {
          0%   { transform: translate(-50%, -50%) translate(-14px, 0px); }
          25%  { transform: translate(-50%, -50%) translate(0px, 10px); }
          50%  { transform: translate(-50%, -50%) translate(14px, 0px); }
          75%  { transform: translate(-50%, -50%) translate(0px, -10px); }
          100% { transform: translate(-50%, -50%) translate(-14px, 0px); }
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
              borderRadius: 4,
              background: CARD_BG,
              borderLeft: `3px solid ${BARK}`,
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              animation: `block-fade 1.5s ease-in-out ${delay}s infinite`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        @keyframes block-fade {
          0%, 100% { opacity: 0.2; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </IndicatorCard>
  );
}

// ─── Showcase ───────────────────────────────────────────────────────────────

export default function LoadingIndicatorsShowcase() {
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
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap"
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
              fontWeight: 600,
              color: TEXT,
              margin: 0,
              fontFamily: FONT,
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
            10 styles for the Moss &amp; Bark theme. Each renders inline below
            the last Woodpecker card while Claude is streaming.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
          }}
        >
          <ClaudeSparkle />
          <PulsingDotTrio />
          <GrowingVine />
          <BreathingRing />
          <BarkSpinner />
          <MossRipple />
          <DotWave />
          <TypewriterCursor />
          <OrbitingLeaves />
          <FadingBlocks />
        </div>
      </div>
    </div>
  );
}
