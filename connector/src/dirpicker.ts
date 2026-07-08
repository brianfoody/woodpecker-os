/**
 * Interactive working-folder selection for the onboarding tutorial.
 * A text prompt (type a path) that falls through to an arrow-key
 * directory browser on empty submit. TTY-only — cli.ts guards this.
 */

import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { cancel, isCancel, log, select, text } from "@clack/prompts";

/** How many immediate children to inspect when counting repos inside a dir. */
const CHILD_SCAN_CAP = 200;
/** Max subdirectories listed per level in the browser. */
const LIST_CAP = 30;

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function prettyPath(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(home + "/")) return "~" + path.slice(home.length);
  return path;
}

const gitInfoCache = new Map<string, string>();

/**
 * "(git repo)" if the dir is itself a repo, "(N repos inside)" if its
 * immediate children contain repos — makes the "pick a parent folder"
 * tip tangible while browsing. Empty string otherwise.
 */
function gitBadge(dir: string): string {
  const cached = gitInfoCache.get(dir);
  if (cached !== undefined) return cached;
  let badge = "";
  try {
    if (existsSync(join(dir, ".git"))) {
      badge = "(git repo)";
    } else {
      const entries = readdirSync(dir, { withFileTypes: true }).slice(
        0,
        CHILD_SCAN_CAP
      );
      let repos = 0;
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        if (existsSync(join(dir, entry.name, ".git"))) repos++;
      }
      if (repos > 0) badge = `(${repos} ${repos === 1 ? "repo" : "repos"} inside)`;
    }
  } catch {
    // Unreadable dir — no badge.
  }
  gitInfoCache.set(dir, badge);
  return badge;
}

function listSubdirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules"
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function exitCancelled(): never {
  cancel("Setup cancelled — run npx woodpecker connect whenever you're ready.");
  process.exit(0);
}

/** Sentinel returned by the browser when the user wants to type a path. */
const TYPE_A_PATH = Symbol("type-a-path");

async function browseDir(start: string): Promise<string | typeof TYPE_A_PATH> {
  let current = start;
  for (;;) {
    let subdirs: string[];
    try {
      subdirs = listSubdirs(current);
    } catch {
      log.warn(`Can't read ${prettyPath(current)} — going up one level.`);
      const parent = dirname(current);
      if (parent === current) return TYPE_A_PATH;
      current = parent;
      continue;
    }

    const truncated = subdirs.length > LIST_CAP;
    const shown = subdirs.slice(0, LIST_CAP);
    const parent = dirname(current);

    const options: { value: string; label: string; hint?: string }[] = [
      {
        value: "\0use",
        label: `Use this folder — ${prettyPath(current)}`,
        hint: gitBadge(current) || undefined,
      },
    ];
    if (parent !== current) {
      options.push({ value: "\0up", label: "⬑ Up one level" });
    }
    for (const name of shown) {
      const full = join(current, name);
      options.push({
        value: full,
        label: `${name}/`,
        hint: gitBadge(full) || undefined,
      });
    }
    if (truncated) {
      log.info(
        `Only showing the first ${LIST_CAP} of ${subdirs.length} folders — pick "Type a path instead" if yours is hidden.`
      );
    }
    options.push({ value: "\0type", label: "✎ Type a path instead…" });

    const choice = await select({
      message: prettyPath(current),
      options,
      maxItems: 12,
    });
    if (isCancel(choice)) exitCancelled();
    if (choice === "\0use") return current;
    if (choice === "\0up") current = parent;
    else if (choice === "\0type") return TYPE_A_PATH;
    else current = choice;
  }
}

/**
 * Full folder-selection flow: type a path, or press Enter to browse.
 * Always returns an existing, resolved directory.
 */
export async function chooseWorkingDir(defaultDir: string): Promise<string> {
  for (;;) {
    const typed = await text({
      message: "Which folder should your iPad control?",
      placeholder: `Press Enter to browse from ${prettyPath(defaultDir)}, or type a path`,
      validate(value) {
        if (!value || !value.trim()) return undefined; // empty → browse
        const path = resolve(expandHome(value.trim()));
        if (!existsSync(path)) return `${path} doesn't exist — try again, or press Enter to browse.`;
        try {
          if (!statSync(path).isDirectory()) return `${path} is a file, not a folder.`;
        } catch {
          return `Can't read ${path}.`;
        }
        return undefined;
      },
    });
    if (isCancel(typed)) exitCancelled();

    if (typeof typed === "string" && typed.trim()) {
      return resolve(expandHome(typed.trim()));
    }

    const browsed = await browseDir(defaultDir);
    if (browsed !== TYPE_A_PATH) return browsed;
    // Fell out of the browser wanting to type — loop back to the text prompt.
  }
}
