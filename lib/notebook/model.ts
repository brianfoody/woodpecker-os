/**
 * The notebook: a ruled page you write on, one page per day.
 *
 * Everything on the page belongs to a ROW (a ruled line). Rows are the unit
 * the agent reads: when you stop writing on a row it gets transcribed and
 * classified, and if it's asking for something a dot appears at its end.
 */

import type { Draft, IntentClass } from "@woodpeckeros/protocol";

export const ROW_H = 64;
/** Page y where row 0 starts (room for the date heading). */
export const PAGE_TOP = 120;
export const MARGIN_X = 56;

export type Point = [x: number, y: number, pressure: number];

export type Stroke = {
  id: string;
  points: Point[];
  row: number;
  /** Size multiplier — pencil pressure is in the points. */
  size: number;
};

/** Spoken (or typed) words, set in the hand font on a row. */
export type TextBlock = {
  id: string;
  row: number;
  x: number;
  text: string;
};

export type DotStatus =
  | "reading" // agent is transcribing/classifying this row
  | "quiet" // read, nothing to do (no dot)
  | "drafting" // dot is working: answering / preparing
  | "answered" // info: answer written beside the line
  | "ready" // action: draft waiting for a tick
  | "running" // ticked: executing for real
  | "done" // executed
  | "cancelled" // user waved it off
  | "error";

export type RowState = {
  /** Content signature the state was computed for — stale results are dropped. */
  sig: string;
  status: DotStatus;
  text?: string;
  intent?: IntentClass;
  confidence?: number;
  title?: string;
  kind?: string;
  progress?: string;
  draft?: Draft;
  result?: string;
  error?: string;
};

export type Page = {
  date: string; // YYYY-MM-DD
  strokes: Stroke[];
  texts: TextBlock[];
  rows: Record<number, RowState>;
  rev: number;
};

export function rowTop(row: number): number {
  return PAGE_TOP + row * ROW_H;
}

export function rowAt(y: number): number {
  return Math.max(0, Math.floor((y - PAGE_TOP) / ROW_H));
}

export function todayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function emptyPage(date: string): Page {
  return { date, strokes: [], texts: [], rows: {}, rev: 0 };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Signature of a row's content: changes whenever ink/text on it changes. */
export function rowSig(page: Page, row: number): string {
  const s = page.strokes.filter((k) => k.row === row).map((k) => k.id);
  const t = page.texts.filter((k) => k.row === row).map((k) => `${k.id}:${k.text.length}`);
  return [...s, ...t].join(",");
}

export function rowsWithContent(page: Page): number[] {
  const rows = new Set<number>();
  for (const s of page.strokes) rows.add(s.row);
  for (const t of page.texts) if (t.text.trim()) rows.add(t.row);
  return [...rows].sort((a, b) => a - b);
}

/** Right-most x of anything on the row — where its dot sits. */
export function rowEndX(page: Page, row: number): number {
  let max = MARGIN_X;
  for (const s of page.strokes) {
    if (s.row !== row) continue;
    for (const p of s.points) if (p[0] > max) max = p[0];
  }
  for (const t of page.texts) {
    if (t.row !== row) continue;
    // Rough width of the hand font at the row size.
    max = Math.max(max, t.x + t.text.length * 13);
  }
  return max;
}

/** The first empty row below everything written — where new voice goes. */
export function nextFreeRow(page: Page): number {
  const rows = rowsWithContent(page);
  return rows.length ? rows[rows.length - 1] + 1 : 0;
}
