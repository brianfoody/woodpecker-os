"use client";

import { createContext, useContext } from "react";
import type { ThemeConfig } from "./themes/types";

interface ExploreThemeContextValue {
  theme: ThemeConfig;
  isDark: boolean;
}

export const ExploreThemeContext = createContext<ExploreThemeContextValue | null>(
  null
);

export function ExploreThemeProvider({
  theme,
  isDark,
  children,
}: ExploreThemeContextValue & { children: React.ReactNode }) {
  return (
    <ExploreThemeContext.Provider value={{ theme, isDark }}>
      {children}
    </ExploreThemeContext.Provider>
  );
}

export function useExploreTheme() {
  const ctx = useContext(ExploreThemeContext);
  if (!ctx) {
    throw new Error("useExploreTheme must be used within ExploreThemeProvider");
  }
  return ctx;
}
