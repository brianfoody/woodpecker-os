import type { ThemeConfig } from "./types";
import { earthSageStone } from "./earth-sage-stone";
import { earthDesertClay } from "./earth-desert-clay";
import { earthMossBark } from "./earth-moss-bark";
import { earthAutumn } from "./earth-autumn";
import { earthMist } from "./earth-mist";
import { threadFineLine } from "./thread-fine-line";
import { threadSerif } from "./thread-serif";
import { threadColor } from "./thread-color";
import { threadBold } from "./thread-bold";
import { threadWideMargin } from "./thread-wide-margin";
import { cyberNeonGrid } from "./cyber-neon-grid";
import { cyberTokyoNoir } from "./cyber-tokyo-noir";
import { cyberHologram } from "./cyber-hologram";
import { cyberSynthWave } from "./cyber-synth-wave";
import { cyberNeuralLink } from "./cyber-neural-link";
import { cyberNeonAmber } from "./cyber-neon-amber";
import { cyberNeonCrimson } from "./cyber-neon-crimson";
import { cyberNeonPhosphor } from "./cyber-neon-phosphor";

export const themes: ThemeConfig[] = [
  earthSageStone,
  earthDesertClay,
  earthMossBark,
  earthAutumn,
  earthMist,
  threadFineLine,
  threadSerif,
  threadColor,
  threadBold,
  threadWideMargin,
  cyberNeonGrid,
  cyberNeonAmber,
  cyberNeonCrimson,
  cyberNeonPhosphor,
  cyberTokyoNoir,
  cyberHologram,
  cyberSynthWave,
  cyberNeuralLink,
];

export const earthTones = themes.filter((t) => t.family === "earth-tones");
export const minimalThreads = themes.filter(
  (t) => t.family === "minimal-thread"
);
export const cyberpunk = themes.filter((t) => t.family === "cyberpunk");

export type { ThemeConfig, ThemeTokens } from "./types";
