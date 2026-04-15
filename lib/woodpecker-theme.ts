import { earthMossBark } from "@/components/explore/themes/earth-moss-bark";

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
