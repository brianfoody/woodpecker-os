"use client";

import type { ThemeConfig } from "./themes/types";

interface MagicInkShowcaseProps {
  theme: ThemeConfig;
  isDark: boolean;
}

export function MagicInkShowcase({ theme, isDark }: MagicInkShowcaseProps) {
  const tokens = isDark ? theme.dark : theme.light;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        width: 500,
      }}
    >
      <div
        style={{
          fontFamily: theme.fonts.label ?? theme.fonts.primary,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: tokens.accentAi,
          marginBottom: 30,
        }}
      >
        Magic Ink — Mystic Smoke
      </div>

      {/* Main demo card */}
      <div
        style={{
          background: tokens.cardAiBg,
          border: `1px solid ${tokens.cardAiBorder}`,
          borderRadius: theme.cardRadius ?? 2,
          padding: "24px",
          boxShadow: tokens.shadow,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.label ?? theme.fonts.primary,
            fontSize: theme.labelFontSize ?? 10,
            fontWeight: theme.labelFontWeight ?? 700,
            letterSpacing: theme.labelLetterSpacing ?? "0.14em",
            textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
            color: tokens.labelAi,
            marginBottom: 16,
          }}
        >
          Magic Pen Active
        </div>

        <MysticSmokeSvg />

        <div
          style={{
            fontFamily: theme.fonts.primary,
            fontSize: 13,
            color: tokens.textSecondary,
            marginTop: 16,
            lineHeight: 1.5,
          }}
        >
          Purple/blue haze with turbulence displacement and sharp stroke overlay.
          The smoke effect uses SVG feTurbulence + feDisplacementMap for organic
          undulation, layered at multiple opacities for depth.
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* Comparison: Normal vs Magic */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div
          style={{
            background: tokens.cardAiBg,
            border: `1px solid ${tokens.cardAiBorder}`,
            borderRadius: theme.cardRadius ?? 2,
            padding: "16px",
          }}
        >
          <div
            style={{
              fontFamily: theme.fonts.label ?? theme.fonts.primary,
              fontSize: theme.labelFontSize ?? 10,
              fontWeight: theme.labelFontWeight ?? 700,
              letterSpacing: theme.labelLetterSpacing ?? "0.14em",
              textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
              color: tokens.textSecondary,
              marginBottom: 12,
              opacity: 0.6,
            }}
          >
            Normal Pen
          </div>
          <NormalStrokeSvg color={tokens.textPrimary} />
        </div>

        <div
          style={{
            background: tokens.cardAiBg,
            border: `1px solid ${tokens.cardAiBorder}`,
            borderRadius: theme.cardRadius ?? 2,
            padding: "16px",
          }}
        >
          <div
            style={{
              fontFamily: theme.fonts.label ?? theme.fonts.primary,
              fontSize: theme.labelFontSize ?? 10,
              fontWeight: theme.labelFontWeight ?? 700,
              letterSpacing: theme.labelLetterSpacing ?? "0.14em",
              textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
              color: "#8866dd",
              marginBottom: 12,
            }}
          >
            Magic Pen
          </div>
          <MysticSmokeSvgSmall />
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* Stroke weight variations */}
      <div
        style={{
          background: tokens.cardAiBg,
          border: `1px solid ${tokens.cardAiBorder}`,
          borderRadius: theme.cardRadius ?? 2,
          padding: "24px",
          boxShadow: tokens.shadow,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.label ?? theme.fonts.primary,
            fontSize: theme.labelFontSize ?? 10,
            fontWeight: theme.labelFontWeight ?? 700,
            letterSpacing: theme.labelLetterSpacing ?? "0.14em",
            textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
            color: tokens.labelAi,
            marginBottom: 16,
          }}
        >
          Stroke Weights
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {[
            { label: "Fine", core: 1.5, haze: 6, smoke: 10 },
            { label: "Medium", core: 3, haze: 8, smoke: 16 },
            { label: "Bold", core: 5, haze: 12, smoke: 22 },
          ].map((variant) => (
            <div key={variant.label}>
              <div
                style={{
                  fontFamily: theme.fonts.primary,
                  fontSize: 11,
                  color: tokens.textSecondary,
                  opacity: 0.5,
                  marginBottom: 8,
                }}
              >
                {variant.label}
              </div>
              <MysticSmokeVariant
                coreWidth={variant.core}
                hazeWidth={variant.haze}
                smokeWidth={variant.smoke}
                id={variant.label.toLowerCase()}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── SVG Components ──────────────────────────────────────────────────── */

const STROKE_PATH = "M40,120 C80,20 160,20 200,80 S320,140 360,40";

function MysticSmokeSvg() {
  return (
    <svg viewBox="0 0 450 160" style={{ width: "100%", height: 160 }}>
      <defs>
        <linearGradient id="mi-grad-smoke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6644cc" />
          <stop offset="50%" stopColor="#4488ff" />
          <stop offset="100%" stopColor="#aa44ff" />
        </linearGradient>
        <filter id="mi-filter-smoke" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves={4}
            seed={42}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={10}
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation={6} result="haze" />
          <feMerge>
            <feMergeNode in="haze" />
          </feMerge>
        </filter>
      </defs>

      {/* Smoke haze — wide, low opacity */}
      <path
        d={STROKE_PATH}
        fill="none"
        stroke="url(#mi-grad-smoke)"
        strokeWidth={16}
        strokeLinecap="round"
        opacity={0.4}
        filter="url(#mi-filter-smoke)"
      />
      {/* Mid glow */}
      <path
        d={STROKE_PATH}
        fill="none"
        stroke="url(#mi-grad-smoke)"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.5}
        filter="url(#mi-filter-smoke)"
      />
      {/* Sharp core */}
      <path
        d={STROKE_PATH}
        fill="none"
        stroke="#ccbbff"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MysticSmokeSvgSmall() {
  return (
    <svg viewBox="0 0 220 100" style={{ width: "100%", height: 100 }}>
      <defs>
        <linearGradient id="mi-grad-smoke-sm" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6644cc" />
          <stop offset="50%" stopColor="#4488ff" />
          <stop offset="100%" stopColor="#aa44ff" />
        </linearGradient>
        <filter id="mi-filter-smoke-sm" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves={4}
            seed={42}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={8}
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation={4} result="haze" />
          <feMerge>
            <feMergeNode in="haze" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M20,70 C50,10 90,10 110,45 S170,80 200,25"
        fill="none"
        stroke="url(#mi-grad-smoke-sm)"
        strokeWidth={10}
        strokeLinecap="round"
        opacity={0.4}
        filter="url(#mi-filter-smoke-sm)"
      />
      <path
        d="M20,70 C50,10 90,10 110,45 S170,80 200,25"
        fill="none"
        stroke="url(#mi-grad-smoke-sm)"
        strokeWidth={6}
        strokeLinecap="round"
        opacity={0.5}
        filter="url(#mi-filter-smoke-sm)"
      />
      <path
        d="M20,70 C50,10 90,10 110,45 S170,80 200,25"
        fill="none"
        stroke="#ccbbff"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

function NormalStrokeSvg({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 220 100" style={{ width: "100%", height: 100 }}>
      <path
        d="M20,70 C50,10 90,10 110,45 S170,80 200,25"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MysticSmokeVariant({
  coreWidth,
  hazeWidth,
  smokeWidth,
  id,
}: {
  coreWidth: number;
  hazeWidth: number;
  smokeWidth: number;
  id: string;
}) {
  const filterId = `mi-filter-var-${id}`;
  const gradId = `mi-grad-var-${id}`;

  return (
    <svg viewBox="0 0 450 60" style={{ width: "100%", height: 60 }}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6644cc" />
          <stop offset="50%" stopColor="#4488ff" />
          <stop offset="100%" stopColor="#aa44ff" />
        </linearGradient>
        <filter id={filterId} x="-20%" y="-30%" width="140%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves={4}
            seed={42}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={8}
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation={4} result="haze" />
          <feMerge>
            <feMergeNode in="haze" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M30,35 C100,8 180,55 250,25 S370,50 420,20"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={smokeWidth}
        strokeLinecap="round"
        opacity={0.35}
        filter={`url(#${filterId})`}
      />
      <path
        d="M30,35 C100,8 180,55 250,25 S370,50 420,20"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={hazeWidth}
        strokeLinecap="round"
        opacity={0.5}
        filter={`url(#${filterId})`}
      />
      <path
        d="M30,35 C100,8 180,55 250,25 S370,50 420,20"
        fill="none"
        stroke="#ccbbff"
        strokeWidth={coreWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
