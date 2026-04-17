export interface ThemeTokens {
  // Card themes
  cardUserBg?: string;
  cardAiBg?: string;
  cardUserBorder?: string;
  cardAiBorder?: string;
  // Accents
  accentUser: string;
  accentAi: string;
  // Thread themes
  threadColor?: string;
  dotUser?: string;
  dotAi?: string;
  threadUser?: string;
  threadAi?: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  labelUser?: string;
  labelAi?: string;
  labelColor?: string;
  marginLabel?: string;
  // Code
  codeBg: string;
  codeColor: string;
  codeBlockBg: string;
  codeBlockColor: string;
  // Other
  shadow?: string;
  connectorFrom?: string;
  connectorTo?: string;
  sectionMark?: string;
}

export interface ThemeConfig {
  id: string;
  name: string;
  family: "earth-tones" | "minimal-thread" | "cyberpunk";
  layout: "card" | "thread" | "wide-margin";
  fonts: { primary: string; label?: string; mono: string };
  googleFontsUrl: string;
  light: ThemeTokens;
  dark: ThemeTokens;
  // Layout-specific
  maxWidth?: number;
  cardRadius?: number;
  accentBorderWidth?: number;
  connectorWidth?: number;
  connectorHeight?: number;
  threadWidth?: number;
  threadPaddingLeft?: number;
  dotSize?: number;
  messageSpacing?: number;
  lineHeight?: number;
  bodyFontWeight?: number;
  aiFontWeight?: number;
  userFontWeight?: number;
  labelFontSize?: number;
  labelFontWeight?: number;
  labelLetterSpacing?: string;
  labelUppercase?: boolean;
  userMessageStyle?: "card" | "echo";
}
