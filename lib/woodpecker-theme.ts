import { earthMossBark } from "@/components/explore/themes/earth-moss-bark";
import { cyberNeonGrid } from "@/components/explore/themes/cyber-neon-grid";

export type ThinkingAnimation = "dot-wave" | "cyan-ripple";

export interface WoodpeckerCanvasTheme {
  canvasBg: string;
  aiTextColor: string;
  aiCardBg: string;
  aiCardBorder: string;
  aiCardBorderWidth: number;
  aiCardRadius: number;
  aiCardShadow: string;
  aiLabelText: string;
  aiLabelColor: string;
  aiFont: string;
  thinkingColor: string;
  thinkingFont: string;
  thinkingAnimation: ThinkingAnimation;
  toggleActiveBg: string;
  toggleActiveColor: string;
  toggleInactiveBg: string;
  toggleInactiveColor: string;
  errorColor: string;
  googleFontsUrl: string;
  // User echo card tokens
  userCardBg: string;
  userCardRadius: number;
  userTextColor: string;
  userTextOpacity: number;
  userLabelText: string;
  userLabelColor: string;
  userLabelOpacity: number;
  userFont: string;
  // Label styling
  labelFontSize?: number;
  labelFontWeight?: number;
  labelLetterSpacing?: string;
  labelUppercase?: boolean;
  labelFont?: string;
  // User card layout
  userLabelMarginBottom?: number;
  userLineHeight?: number;
  // Thinking indicator dot colors
  thinkingDotColors?: string[];
}

export function createMossBarkTheme(): WoodpeckerCanvasTheme {
  const t = earthMossBark;
  const l = t.light;
  return {
    canvasBg: "#f8f7f4",
    aiTextColor: l.textSecondary,
    aiCardBg: l.cardAiBg ?? "#f3f0eb",
    aiCardBorder: l.accentAi,
    aiCardBorderWidth: t.accentBorderWidth ?? 5,
    aiCardRadius: t.cardRadius ?? 16,
    aiCardShadow: l.shadow ?? "0 1px 3px rgba(0,0,0,0.05)",
    aiLabelText: "WOODPECKER",
    aiLabelColor: l.labelAi ?? l.accentAi,
    aiFont: t.fonts.primary,
    thinkingColor: l.accentAi,
    thinkingFont: t.fonts.primary,
    thinkingAnimation: "dot-wave",
    toggleActiveBg: l.accentAi,
    toggleActiveColor: "#f5f5f0",
    toggleInactiveBg: l.cardAiBg ?? "#f3f0eb",
    toggleInactiveColor: l.accentAi,
    errorColor: "#dc2626",
    googleFontsUrl: t.googleFontsUrl,
    // User echo card tokens
    userCardBg: `${l.accentUser}08`,
    userCardRadius: t.cardRadius ?? 16,
    userTextColor: l.accentUser,
    userTextOpacity: 0.75,
    userLabelText: "YOU",
    userLabelColor: l.labelUser ?? l.accentUser,
    userLabelOpacity: 0.6,
    userFont: "var(--font-caveat)",
  };
}

export function createNeonGridTheme(mode: "light" | "dark" = "light"): WoodpeckerCanvasTheme {
  const t = cyberNeonGrid;
  const tokens = mode === "dark" ? t.dark : t.light;
  const isDark = mode === "dark";
  return {
    canvasBg: isDark ? "#0a0a14" : "#f9fafb",
    aiTextColor: tokens.textSecondary,
    aiCardBg: tokens.cardAiBg ?? (isDark ? "#0a141a" : "rgba(0,200,255,0.06)"),
    aiCardBorder: tokens.accentAi,
    aiCardBorderWidth: t.accentBorderWidth ?? 2,
    aiCardRadius: t.cardRadius ?? 2,
    aiCardShadow: tokens.shadow ?? "0 0 12px rgba(0,255,170,0.08), 0 0 24px rgba(0,200,255,0.04)",
    aiLabelText: "WOODPECKER",
    aiLabelColor: tokens.labelAi ?? tokens.accentAi,
    aiFont: t.fonts.primary,
    thinkingColor: tokens.accentAi,
    thinkingFont: t.fonts.primary,
    thinkingAnimation: "dot-wave",
    toggleActiveBg: tokens.accentAi,
    toggleActiveColor: isDark ? "#0a0a14" : "#ffffff",
    toggleInactiveBg: tokens.cardAiBg ?? (isDark ? "#0a141a" : "rgba(0,200,255,0.06)"),
    toggleInactiveColor: tokens.accentAi,
    errorColor: "#ff4444",
    googleFontsUrl: t.googleFontsUrl,
    // User echo card tokens
    userCardBg: `${tokens.accentUser}08`,
    userCardRadius: t.cardRadius ?? 2,
    userTextColor: tokens.textPrimary,
    userTextOpacity: 1,
    userLabelText: "YOU",
    userLabelColor: tokens.labelUser ?? tokens.accentUser,
    userLabelOpacity: 0.6,
    userFont: "'Caveat', cursive",
    userLabelMarginBottom: 4,
    userLineHeight: 1.4,
    // Label styling
    labelFontSize: t.labelFontSize,
    labelFontWeight: t.labelFontWeight,
    labelLetterSpacing: t.labelLetterSpacing,
    labelUppercase: t.labelUppercase,
    labelFont: t.fonts.label,
    // Thinking dots — alternate accentAi and connectorFrom
    thinkingDotColors: [
      tokens.accentAi,
      tokens.connectorFrom ?? tokens.accentAi,
      tokens.connectorTo ?? tokens.accentAi,
      tokens.connectorFrom ?? tokens.accentAi,
      tokens.accentAi,
    ],
  };
}
