#!/usr/bin/env node
/**
 * woodpecker — the Woodpecker OS connector.
 *
 *   woodpecker connect [--dir <path>] [--relay <url>] [--local] [--port <n>]
 *                      [--yolo] [--reset-pairing] [--app-url <url>]
 *   woodpecker pair        re-print the current pairing QR
 *   woodpecker help
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "@clack/prompts";
import {
  DEFAULT_APP_URL,
  DEFAULT_LOCAL_PORT,
  DEFAULT_RELAY_URL,
} from "@woodpeckeros/protocol";
import { createCore } from "./core";
import { chooseWorkingDir } from "./dirpicker";
import { loadOrCreatePairing, printPairing } from "./pairing";
import { startLocalServer, startRelayTransport } from "./transports";
import {
  createStatusRenderer,
  folderStep,
  localModeStep,
  pairingStep,
  statusToPlainText,
  tutorialIntro,
} from "./tutorial";
import { loadConfig, saveConfig, WOODPECKER_HOME } from "./storage";

const VERSION = "0.1.1";

type Flags = {
  dir?: string;
  relay?: string;
  appUrl?: string;
  port: number;
  local: boolean;
  yolo: boolean;
  resetPairing: boolean;
};

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const flags: Flags = {
    port: DEFAULT_LOCAL_PORT,
    local: false,
    yolo: false,
    resetPairing: false,
  };
  let command = "connect";
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    command = args.shift()!;
  }
  while (args.length > 0) {
    const arg = args.shift()!;
    switch (arg) {
      case "--dir":
        flags.dir = args.shift();
        break;
      case "--relay":
        flags.relay = args.shift();
        break;
      case "--app-url":
        flags.appUrl = args.shift();
        break;
      case "--port":
        flags.port = Number(args.shift() ?? DEFAULT_LOCAL_PORT);
        break;
      case "--local":
        flags.local = true;
        break;
      case "--yolo":
        flags.yolo = true;
        break;
      case "--reset-pairing":
        flags.resetPairing = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        process.exit(1);
    }
  }
  return { command, flags };
}

function validateDir(dir: string): string {
  const resolved = resolve(dir);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    console.error(`Directory does not exist: ${resolved}`);
    process.exit(1);
  }
  return resolved;
}

function saveWorkingDir(resolved: string): void {
  const config = loadConfig();
  if (resolved !== config.workingDir) {
    saveConfig({ ...config, workingDir: resolved });
  }
}

/**
 * The working dir is confirmed on every start: a previously saved dir is only
 * a prompt default, never silently reused. `--dir` skips the prompt (explicit
 * choice), and non-interactive runs fall back to saved dir / cwd rather than
 * hanging on a prompt that can never be answered.
 */
async function resolveWorkingDir(
  flagDir: string | undefined,
  interactive: boolean
): Promise<string> {
  const config = loadConfig();
  const fallback = config.workingDir ?? process.cwd();

  let resolved: string;
  if (flagDir) {
    resolved = validateDir(flagDir);
  } else if (interactive) {
    resolved = await chooseWorkingDir(fallback);
  } else {
    resolved = validateDir(fallback);
  }
  saveWorkingDir(resolved);
  return resolved;
}

function printBanner(): void {
  console.log(`
  ┌─────────────────────────────────────┐
  │  Woodpecker OS connector v${VERSION}      │
  │  woodpeckeros.com                   │
  └─────────────────────────────────────┘
`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const appUrl = flags.appUrl ?? config.appUrl ?? DEFAULT_APP_URL;

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(
      `Usage:
  woodpecker connect [--dir <path>] [--relay <url>] [--local] [--port <n>]
                     [--yolo] [--reset-pairing] [--app-url <url>]
  woodpecker pair     re-print the current pairing QR

State lives in ${WOODPECKER_HOME}`
    );
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  if (command === "pair") {
    const pairing = loadOrCreatePairing();
    await printPairing(appUrl, pairing);
    return;
  }

  if (command !== "connect") {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  printBanner();

  if (interactive) {
    await connectTutorial(flags, appUrl);
  } else {
    await connectPlain(flags, appUrl);
  }
}

/** Interactive path: the three-step guided tutorial. */
async function connectTutorial(flags: Flags, appUrl: string): Promise<void> {
  tutorialIntro();

  // Step 1 — choose your folder.
  folderStep();
  let cwd: string;
  try {
    cwd = await resolveWorkingDir(flags.dir, true);
  } catch (error) {
    // Terminals that report a TTY but can't do raw mode (some pseudo-TTYs):
    // fall back to the non-interactive resolution rather than crashing.
    if (flags.dir === undefined) {
      console.error("Interactive prompt unavailable — using saved folder.");
      cwd = await resolveWorkingDir(undefined, false);
    } else {
      throw error;
    }
  }
  log.success(`Working folder: ${cwd}`);
  log.info(
    "Claude login: this uses the Claude Code credentials already on this machine.\n" +
      "If requests fail later, run `claude` in a terminal to sign in."
  );
  if (flags.yolo) {
    log.warn(
      "--yolo: tool guardrails DISABLED — Claude can run anything without asking."
    );
  }

  const renderer = createStatusRenderer({ local: flags.local });
  const core = createCore({
    cwd,
    yolo: flags.yolo,
    version: VERSION,
    onDeviceConnected: renderer.onDeviceConnected,
  });

  if (flags.local) {
    // Step 2 (local variant) — no pairing needed.
    localModeStep();
    startLocalServer({ port: flags.port, core, onStatus: renderer.onStatus });
    return;
  }

  // Step 2 — pair your iPad.
  const pairing = loadOrCreatePairing(flags.resetPairing);
  await pairingStep(appUrl, pairing, flags.resetPairing);

  // Step 3 — going live (rendered event-by-event as the relay connects).
  const relayUrl = flags.relay ?? loadConfig().relayUrl ?? DEFAULT_RELAY_URL;
  startRelayTransport({
    relayUrl,
    pairing,
    core,
    onStatus: renderer.onStatus,
  });
}

/** Non-TTY path: no prompts, plain log lines — same behavior as before. */
async function connectPlain(flags: Flags, appUrl: string): Promise<void> {
  const cwd = await resolveWorkingDir(flags.dir, false);
  console.log(`  Working directory: ${cwd}`);
  console.log(
    `  Claude login: using this machine's Claude Code credentials` +
      ` (run \`claude\` in a terminal to sign in if requests fail)`
  );
  if (flags.yolo) {
    console.log(`  ⚠ --yolo: tool guardrails DISABLED (bypassPermissions)`);
  }

  const core = createCore({ cwd, yolo: flags.yolo, version: VERSION });

  if (flags.local) {
    startLocalServer({
      port: flags.port,
      core,
      onStatus: (event) => console.log(`  ${statusToPlainText(event)}`),
    });
    console.log(
      `\n  Local mode — open http://localhost:3000/canvas and it will connect automatically.\n`
    );
  } else {
    const pairing = loadOrCreatePairing(flags.resetPairing);
    if (flags.resetPairing) {
      console.log("  Pairing reset — all previously paired devices are revoked.");
    }
    const relayUrl = flags.relay ?? loadConfig().relayUrl ?? DEFAULT_RELAY_URL;
    await printPairing(appUrl, pairing);
    startRelayTransport({
      relayUrl,
      pairing,
      core,
      onStatus: (event) => console.log(`  ${statusToPlainText(event)}`),
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
