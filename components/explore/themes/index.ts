import type { ThemeConfig } from "./types";
import { earthMossBark } from "./earth-moss-bark";
import { cyberNeonGrid } from "./cyber-neon-grid";

export const themes: ThemeConfig[] = [
  earthMossBark,
  cyberNeonGrid,
];

export type { ThemeConfig, ThemeTokens } from "./types";
