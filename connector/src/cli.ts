#!/usr/bin/env node
/**
 * woodpecker — the Woodpecker OS connector.
 *
 *   woodpecker connect [--dir <path>] [--relay <url>] [--local] [--port <n>]
 *                      [--yolo] [--reset-pairing] [--app-url <url>]
 *   woodpecker pair        re-print the current pairing QR
 *   woodpecker help
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  DEFAULT_APP_URL,
  DEFAULT_LOCAL_PORT,
  DEFAULT_RELAY_URL,
} from "@woodpeckeros/protocol";
import { createCore } from "./core";
import { loadOrCreatePairing, printPairing } from "./pairing";
import { startLocalServer, startRelayTransport } from "./transports";
import { loadConfig, saveConfig, WOODPECKER_HOME } from "./storage";

const VERSION = "0.1.0";

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

async function resolveWorkingDir(flagDir: string | undefined): Promise<string> {
  const config = loadConfig();
  let dir = flagDir ?? config.workingDir;

  if (!dir) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Which folder should Claude Code work in? [${process.cwd()}] `
    );
    rl.close();
    dir = answer.trim() || process.cwd();
  }

  const resolved = resolve(dir);
  if (!existsSync(resolved)) {
    console.error(`Directory does not exist: ${resolved}`);
    process.exit(1);
  }
  if (resolved !== config.workingDir) {
    saveConfig({ ...config, workingDir: resolved });
  }
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
    printPairing(appUrl, pairing);
    return;
  }

  if (command !== "connect") {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  printBanner();
  const cwd = await resolveWorkingDir(flags.dir);
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
      onStatus: (s) => console.log(`  ${s}`),
    });
    console.log(
      `\n  Local mode — open http://localhost:3000/canvas and it will connect automatically.\n`
    );
  } else {
    const pairing = loadOrCreatePairing(flags.resetPairing);
    if (flags.resetPairing) {
      console.log("  Pairing reset — all previously paired devices are revoked.");
    }
    const relayUrl = flags.relay ?? config.relayUrl ?? DEFAULT_RELAY_URL;
    printPairing(appUrl, pairing);
    startRelayTransport({
      relayUrl,
      pairing,
      core,
      onStatus: (s) => console.log(`  ${s}`),
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
