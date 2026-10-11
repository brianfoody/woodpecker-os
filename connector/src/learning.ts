/**
 * What the agent has learned about when to step in.
 *
 * Every tick, cancel and dismiss on the canvas lands here (with the user's
 * spoken or written reason, when they give one). The observer feeds the most
 * recent entries back into its classifier prompt as worked examples, so a
 * cancelled "call mum" with "I'll do that myself" stops lighting a dot next
 * time. Plain JSONL in ~/.woodpecker/ — inspectable, deletable, portable.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LearningEntry } from "@woodpeckeros/protocol";
import { randomB64Url } from "@woodpeckeros/protocol";
import { WOODPECKER_HOME } from "./storage";

const LEARNING_PATH = join(WOODPECKER_HOME, "learning.jsonl");
const MAX_ENTRIES = 500;

export function loadLearning(): LearningEntry[] {
  if (!existsSync(LEARNING_PATH)) return [];
  const entries: LearningEntry[] = [];
  for (const line of readFileSync(LEARNING_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as LearningEntry);
    } catch {
      // Skip a torn line rather than losing the whole file.
    }
  }
  return entries;
}

function writeAll(entries: LearningEntry[]): void {
  mkdirSync(WOODPECKER_HOME, { recursive: true });
  const body = entries
    .slice(-MAX_ENTRIES)
    .map((e) => JSON.stringify(e))
    .join("\n");
  writeFileSync(LEARNING_PATH, body ? body + "\n" : "", { mode: 0o600 });
}

export function addLearning(
  entry: Omit<LearningEntry, "id" | "ts">
): LearningEntry {
  const full: LearningEntry = {
    ...entry,
    id: randomB64Url(8),
    ts: new Date().toISOString(),
  };
  writeAll([...loadLearning(), full]);
  return full;
}

export function forgetLearning(id: string): void {
  writeAll(loadLearning().filter((e) => e.id !== id));
}

/**
 * Render recent decisions as few-shot guidance for the classifier. Cancels
 * with reasons are the most informative, so they're kept preferentially.
 */
export function learningPrompt(limit = 40): string {
  const entries = loadLearning();
  if (entries.length === 0) return "";
  const withReasons = entries.filter((e) => e.reason);
  const rest = entries.filter((e) => !e.reason);
  const picked = [...rest.slice(-Math.floor(limit / 2)), ...withReasons.slice(-limit)]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);

  const lines = picked.map((e) => {
    const label =
      e.verdict === "approved"
        ? `APPROVED (${e.intent}${e.kind ? `/${e.kind}` : ""}) — stepping in was welcome`
        : e.verdict === "cancelled"
          ? `CANCELLED (${e.intent}${e.kind ? `/${e.kind}` : ""}) — should NOT have stepped in`
          : `DISMISSED (${e.intent}) — not useful`;
    const reason = e.reason ? ` Reason: "${e.reason}"` : "";
    return `- "${e.text}" → ${label}.${reason}`;
  });

  return [
    "This user's past reactions when you offered help (most recent last).",
    "Treat these as the strongest signal you have. Generalise from each reason only as far as the reason goes:",
    "a reason about one kind of line (e.g. curiosity questions saved for the kids) should quiet lines like it, not every question.",
    "A line that no reason below speaks to must be scored exactly as if this history were empty — a practical, time-bound question is not a curiosity question.",
    ...lines,
  ].join("\n");
}
