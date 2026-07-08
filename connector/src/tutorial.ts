/**
 * The `woodpecker connect` guided tutorial: step copy, pairing screen,
 * and the live status renderer that narrates the connection until the
 * first device pairs, then drops to quiet log lines.
 *
 * The QR code and live status lines are printed with plain console.log —
 * clack note() borders would mangle the QR's wide lines, and persistent
 * spinners fight with async [agent]/[connector] logs.
 */

import { intro, note, outro } from "@clack/prompts";
import { pairingUrl, type Pairing } from "@woodpeckeros/protocol";
import { renderQr } from "./pairing";
import type { DeviceConnectedInfo } from "./core";
import type { StatusEvent } from "./transports";

const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;

export function tutorialIntro(): void {
  intro("Let's connect your canvas — three quick steps.");
}

export function folderStep(): void {
  note(
    `This is the folder Claude Code will work in — whatever you pick here
is what you'll be able to see and change from your iPad.

Tip: choose a parent folder like ~/apps to control several repos
from one canvas. Every project inside becomes reachable.

You can change this any time by re-running npx woodpecker connect.`,
    "Step 1 of 3 · Choose your folder"
  );
}

export async function pairingStep(
  appUrl: string,
  pairing: Pairing,
  resetDone: boolean
): Promise<void> {
  console.log(`\n${dim("──")} Step 2 of 3 · Pair your iPad ${dim("──")}\n`);
  if (resetDone) {
    console.log(
      green("✓") +
        " Pairing reset — all previously paired devices are revoked. Here's your fresh code:\n"
    );
  }
  console.log(
    `Scan this QR code with your iPad's camera, or open the link below
in any browser. It connects that device to this machine.\n`
  );
  const url = pairingUrl(appUrl, pairing);
  console.log(await renderQr(url));
  console.log(`  ${url}\n`);
  console.log(
    yellow("⚠") +
      ` Treat this link like a password — anyone who has it can drive
  Claude Code on this computer.
  Revoke every paired device any time with:
  ${dim("npx woodpecker connect --reset-pairing")}`
  );
}

export function localModeStep(): void {
  note(
    `Local mode — no pairing needed.
Open http://localhost:3000/canvas and it connects automatically.`,
    "Step 2 of 3 · Pair your iPad"
  );
}

export type StatusRenderer = {
  onStatus: (event: StatusEvent) => void;
  onDeviceConnected: (info: DeviceConnectedInfo) => void;
};

/**
 * Narrates connection events as tutorial lines until the first device
 * pairs (the celebration + outro), then switches to dimmed log lines so
 * ongoing [connector]/[agent] output reads as one consistent stream.
 */
export function createStatusRenderer(opts: { local: boolean }): StatusRenderer {
  let phase: "tutorial" | "running" = "tutorial";
  let openHintShown = false;
  let stepHeaderShown = false;

  const stepHeader = (): void => {
    if (stepHeaderShown) return;
    stepHeaderShown = true;
    console.log(`\n${dim("──")} Step 3 of 3 · Going live ${dim("──")}\n`);
  };

  const celebrate = (who: string): void => {
    console.log(`\n${green("✓")} Paired with ${who}!`);
    outro(
      `You're all set. Try it: write something on the canvas and circle it
with the magic pen — Claude Code will answer right on the page.

Keep this window open; it's the bridge to your iPad. (Ctrl+C to stop.)`
    );
    phase = "running";
  };

  return {
    onStatus(event) {
      if (phase === "running") {
        switch (event.kind) {
          case "relay-connecting":
            console.log(dim("[connector] reconnecting to relay..."));
            break;
          case "relay-waiting":
            console.log(dim("[connector] connected to relay"));
            break;
          case "canvas-connected":
            console.log(dim("[connector] canvas connected"));
            break;
          case "canvas-disconnected":
            console.log(dim("[connector] canvas disconnected"));
            break;
          case "relay-retry":
            console.log(
              dim(`[connector] relay connection lost — retrying in ${event.seconds}s`)
            );
            break;
          case "local-listening":
            console.log(dim(`[connector] listening on ws://localhost:${event.port}`));
            break;
        }
        return;
      }

      stepHeader();
      switch (event.kind) {
        case "relay-connecting":
          console.log("◇ Reaching the relay…");
          break;
        case "relay-waiting":
          console.log(
            `${green("✓")} Connected to the relay ${dim("(end-to-end encrypted — it can't read your traffic)")}`
          );
          if (!openHintShown) {
            openHintShown = true;
            console.log(
              "● Now open the link on your iPad. This window will light up when it arrives."
            );
          }
          break;
        case "local-listening":
          console.log(`${green("✓")} Listening on ws://localhost:${event.port}`);
          console.log(
            "● Now open http://localhost:3000/canvas — this window will light up when it connects."
          );
          break;
        case "canvas-connected":
          console.log(`${green("✓")} Canvas connected — finishing the handshake…`);
          break;
        case "canvas-disconnected":
          console.log("◇ Canvas disconnected — waiting for it to come back…");
          break;
        case "relay-retry":
          console.log(
            `${yellow("▲")} Relay connection lost — retrying in ${event.seconds}s ${dim("(your work is safe; it reconnects automatically)")}`
          );
          break;
      }
    },

    onDeviceConnected(info) {
      if (phase === "tutorial") {
        stepHeader();
        celebrate(info.deviceName ?? "your device");
      } else {
        console.log(
          dim(`[connector] device connected: ${info.deviceName ?? info.deviceId}`)
        );
      }
    },
  };
}

/** Plain-text rendering for non-TTY runs — matches the old log lines. */
export function statusToPlainText(event: StatusEvent): string {
  switch (event.kind) {
    case "relay-connecting":
      return "connecting to relay...";
    case "relay-waiting":
      return "connected to relay — waiting for canvas";
    case "canvas-connected":
      return event.local ? "canvas connected (local)" : "canvas connected";
    case "canvas-disconnected":
      return "canvas disconnected";
    case "relay-retry":
      return `relay connection lost — retrying in ${event.seconds}s`;
    case "local-listening":
      return `local mode: ws://localhost:${event.port}`;
  }
}
