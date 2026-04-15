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
];

export const earthTones = themes.filter((t) => t.family === "earth-tones");
export const minimalThreads = themes.filter(
  (t) => t.family === "minimal-thread"
);

export type { ThemeConfig, ThemeTokens } from "./types";
