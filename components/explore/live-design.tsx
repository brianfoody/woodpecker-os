"use client";

import type { ThemeConfig, ThemeTokens } from "./themes/types";

/**
 * "Live Design" — shows a realistic conversation flow with interactive states
 * (thinking, cancelled) as they would appear in the real app.
 */

interface LiveDesignProps {
  theme: ThemeConfig;
  isDark: boolean;
}

export function LiveDesign({ theme, isDark }: LiveDesignProps) {
  const tokens = isDark ? theme.dark : theme.light;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        width: theme.maxWidth ?? 620,
      }}
    >
      <ColumnHeader tokens={tokens} theme={theme} title="Live Design" />

      {/* User card */}
      <UserCard tokens={tokens} theme={theme} text="What does the auth middleware do?" />

      <Connector tokens={tokens} theme={theme} />

      {/* AI response */}
      <AiCard
        tokens={tokens}
        theme={theme}
        text="The auth middleware validates JWT tokens from the request header and attaches the decoded user object to the request context."
      />

      <Connector tokens={tokens} theme={theme} />

      {/* Thinking indicator — active */}
      <ThinkingIndicator tokens={tokens} theme={theme} state="active" label="searching code..." />

      <div style={{ height: 60 }} />

      {/* Separate flow: cancelled scenario */}
      <ColumnHeader tokens={tokens} theme={theme} title="Cancelled Flow" />

      <UserCard tokens={tokens} theme={theme} text="Refactor the database layer" />

      <Connector tokens={tokens} theme={theme} />

      {/* Cancelled state */}
      <ThinkingIndicator tokens={tokens} theme={theme} state="cancelled" label="cancelled" />
    </div>
  );
}

function ColumnHeader({
  tokens,
  theme,
  title,
}: {
  tokens: ThemeTokens;
  theme: ThemeConfig;
  title: string;
}) {
  return (
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
      {title}
    </div>
  );
}

function UserCard({
  tokens,
  theme,
  text,
}: {
  tokens: ThemeTokens;
  theme: ThemeConfig;
  text: string;
}) {
  return (
    <div
      style={{
        background: `${tokens.accentUser}08`,
        borderRadius: theme.cardRadius ?? 2,
        padding: "12px 16px",
        fontFamily: theme.fonts.primary,
      }}
    >
      <div
        style={{
          fontSize: theme.labelFontSize ?? 10,
          fontWeight: theme.labelFontWeight ?? 700,
          letterSpacing: theme.labelLetterSpacing ?? "0.14em",
          textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
          color: tokens.labelUser ?? tokens.accentUser,
          opacity: 0.6,
          marginBottom: 4,
          fontFamily: theme.fonts.label ?? theme.fonts.primary,
        }}
      >
        You
      </div>
      <div
        style={{
          fontFamily: "'Caveat', cursive",
          fontSize: 19,
          color: tokens.textPrimary,
          lineHeight: 1.4,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function AiCard({
  tokens,
  theme,
  text,
}: {
  tokens: ThemeTokens;
  theme: ThemeConfig;
  text: string;
}) {
  return (
    <div
      style={{
        background: tokens.cardAiBg,
        border: `1px solid ${tokens.cardAiBorder}`,
        borderLeft: `${theme.accentBorderWidth ?? 2}px solid ${tokens.accentAi}`,
        borderRadius: theme.cardRadius ?? 2,
        padding: "20px 24px",
        boxShadow: tokens.shadow,
        fontFamily: theme.fonts.primary,
        fontSize: 15,
        lineHeight: theme.lineHeight ?? 1.6,
        color: tokens.textPrimary,
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
          marginBottom: 8,
        }}
      >
        Woodpecker
      </div>
      <div style={{ color: tokens.textSecondary }}>{text}</div>
    </div>
  );
}

function Connector({
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
        justifyContent: "center",
        height: theme.connectorHeight ?? 24,
      }}
    >
      <div
        style={{
          width: theme.connectorWidth ?? 1,
          height: "100%",
          background: `linear-gradient(${tokens.connectorFrom}, ${tokens.connectorTo})`,
        }}
      />
    </div>
  );
}

function ThinkingIndicator({
  tokens,
  theme,
  state,
  label,
}: {
  tokens: ThemeTokens;
  theme: ThemeConfig;
  state: "active" | "cancelled";
  label: string;
}) {
  const isCancelled = state === "cancelled";
  const borderColor = isCancelled ? `${tokens.accentUser}60` : tokens.accentAi;

  const dotColors = [
    tokens.accentAi,
    tokens.connectorFrom,
    tokens.connectorTo,
    tokens.connectorFrom,
    tokens.accentAi,
  ];

  return (
    <div
      style={{
        background: tokens.cardAiBg,
        border: `1px solid ${isCancelled ? `${tokens.cardAiBorder}40` : tokens.cardAiBorder}`,
        borderLeft: `${theme.accentBorderWidth ?? 2}px solid ${borderColor}`,
        borderRadius: theme.cardRadius ?? 2,
        padding: "20px 24px",
        boxShadow: isCancelled ? "none" : tokens.shadow,
        fontFamily: theme.fonts.primary,
        opacity: isCancelled ? 0.7 : 1,
      }}
    >
      {/* Label */}
      <div
        style={{
          fontFamily: theme.fonts.label ?? theme.fonts.primary,
          fontSize: theme.labelFontSize ?? 10,
          fontWeight: theme.labelFontWeight ?? 700,
          letterSpacing: theme.labelLetterSpacing ?? "0.14em",
          textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
          color: isCancelled ? `${tokens.labelAi}80` : tokens.labelAi,
          marginBottom: 12,
        }}
      >
        Woodpecker
      </div>

      {/* Dots + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 24 }}>
        {dotColors.map((color, i) => (
          <div
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
              opacity: isCancelled ? 0.3 : 1,
              animation: isCancelled
                ? "none"
                : `live-dot-wave 1.4s ease-in-out ${i * 0.12}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 8,
            fontSize: 14,
            color: isCancelled ? tokens.accentUser : tokens.accentAi,
            opacity: isCancelled ? 0.6 : 0.7,
            fontFamily: theme.fonts.primary,
          }}
        >
          {label}
        </span>
      </div>

      {/* Hint */}
      <div
        style={{
          fontSize: 12,
          color: isCancelled ? tokens.accentUser : tokens.accentAi,
          opacity: 0.5,
          fontFamily: theme.fonts.primary,
          marginTop: 10,
        }}
      >
        {isCancelled ? "tap to retry · scratch to dismiss" : "tap to cancel"}
      </div>

      {!isCancelled && (
        <style>{`
          @keyframes live-dot-wave {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
        `}</style>
      )}
    </div>
  );
}
