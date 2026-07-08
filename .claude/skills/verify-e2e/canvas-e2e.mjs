/**
 * Woodpecker end-to-end verifier.
 *
 * Drives the REAL production canvas (or a URL you point it at) in headless
 * Chromium using this machine's pairing: joins the relay, checks the
 * connector is present, draws a scribble, circles it with the magic pen,
 * and waits for the agent reply card to appear on the canvas.
 *
 * Prereqs: the connector must be running (`npx @woodpeckeros/connect`) and
 * this machine must be paired (~/.woodpecker/pairing.json).
 *
 * Usage:
 *   node .claude/skills/verify-e2e/canvas-e2e.mjs
 *   WOODPECKER_URL=http://localhost:3000 node .claude/skills/verify-e2e/canvas-e2e.mjs
 *
 * Exit codes: 0 = PASS, 1 = infra failure, 2 = connector absent on channel.
 */

import { chromium } from "playwright";
import { readFileSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.WOODPECKER_URL || "https://woodpeckeros.com").replace(/\/$/, "");
const REPLY_TIMEOUT_MS = 90_000;

let pairing;
try {
  pairing = JSON.parse(readFileSync(join(homedir(), ".woodpecker/pairing.json"), "utf8"));
} catch {
  console.log("VERDICT: FAIL — no pairing at ~/.woodpecker/pairing.json (run the connector once first)");
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), "wp-e2e-"));
console.log(`[setup] screenshots → ${out}`);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
const wsCloses = [];
let connectorPresent = null;

page.on("console", (m) => {
  const text = m.text();
  if (m.type() === "error") consoleErrors.push(text);
  if (/wsdiag|Magic pen|OCR|connector/i.test(text)) console.log(`[console:${m.type()}]`, text.slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("websocket", (ws) => {
  ws.on("framereceived", (f) => {
    const s = String(f.payload);
    if (s.includes('"joined"')) {
      try {
        connectorPresent = JSON.parse(s).peer.connector;
        console.log("[relay] joined; connector present:", connectorPresent);
      } catch {}
    }
  });
});

// Surface close codes (e.g. 1013 "throughput limit") and outsized frames.
await page.addInitScript(() => {
  const OrigWS = window.WebSocket;
  window.WebSocket = class extends OrigWS {
    constructor(...args) {
      super(...args);
      this.addEventListener("close", (e) =>
        console.log(`[wsdiag] close code=${e.code} reason=${e.reason} clean=${e.wasClean}`)
      );
    }
    send(data) {
      const size = typeof data === "string" ? data.length : data.byteLength || 0;
      if (size > 1_000_000) console.log(`[wsdiag] sending LARGE frame: ${size} bytes`);
      return super.send(data);
    }
  };
});
page.on("console", (m) => {
  const match = m.text().match(/\[wsdiag\] close code=(\d+) reason=(.*?) clean/);
  if (match) wsCloses.push({ code: Number(match[1]), reason: match[2] });
});

await page.goto(`${BASE}/pair#${pairing.channelId}.${pairing.key}`, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(5000);
console.log("[nav] at:", page.url());

if (connectorPresent === false) {
  await page.screenshot({ path: `${out}/no-connector.png` });
  console.log("VERDICT: FAIL — no connector on the relay channel.");
  console.log("  Check: is `npx @woodpeckeros/connect` running? Is the relay on ONE machine (`fly scale show -a woodpecker-relay`)?");
  await browser.close();
  process.exit(2);
}

// Dismiss the first-run overlay (its CTA is "Try it") — it intercepts clicks.
for (const label of ["Try it", "Got it", "Close"]) {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
    await btn.click().catch(() => {});
    break;
  }
}
await page.waitForTimeout(500);

const cv = page.locator(".tl-canvas").first();
const box = await cv.boundingBox();
if (!box) {
  console.log("VERDICT: FAIL — canvas never rendered");
  await browser.close();
  process.exit(1);
}
const cx = box.x + 500;
const cy = box.y + 380;

async function stroke(points) {
  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
}

await page.keyboard.press("d"); // draw tool
await page.waitForTimeout(300);
await stroke([[cx - 80, cy], [cx - 40, cy - 22], [cx, cy + 8], [cx + 40, cy - 18], [cx + 80, cy + 4]]);
await page.waitForTimeout(800);

const magicBtn = page.locator('[data-testid="magic-pen-tool"]').first();
if ((await magicBtn.count()) === 0) {
  console.log("VERDICT: FAIL — magic pen tool button not found (data-testid changed?)");
  await browser.close();
  process.exit(1);
}
await magicBtn.click();
await page.waitForTimeout(400);

const circle = [];
for (let a = -0.3; a <= Math.PI * 2 + 0.35; a += Math.PI / 14) {
  circle.push([cx + 130 * Math.cos(a), cy + 130 * Math.sin(a) * 0.6]);
}
await stroke(circle);
console.log("[gesture] circle drawn — waiting for agent reply (OCR + Claude Code on this machine)...");

const start = Date.now();
let replied = false;
while (Date.now() - start < REPLY_TIMEOUT_MS) {
  const body = await page.evaluate(() => document.body.innerText);
  if (/WOODPECKER\n/.test(body)) {
    replied = true;
    const idx = body.indexOf("WOODPECKER");
    console.log("[reply]", JSON.stringify(body.slice(idx, idx + 240)));
    break;
  }
  await page.waitForTimeout(2000);
}

await page.screenshot({ path: `${out}/final.png` });
await browser.close();

if (replied && wsCloses.length === 0) {
  console.log("VERDICT: PASS — circle → OCR → agent reply, socket stayed up");
  process.exit(0);
}
if (replied) {
  console.log(`VERDICT: PASS (flaky) — reply arrived but socket dropped ${wsCloses.length}x:`, JSON.stringify(wsCloses));
  process.exit(0);
}
console.log("VERDICT: FAIL — no agent reply within", REPLY_TIMEOUT_MS / 1000, "s");
if (wsCloses.length) console.log("  ws closes:", JSON.stringify(wsCloses), "(1013 = relay throughput limit)");
if (consoleErrors.length) console.log("  console errors:", JSON.stringify(consoleErrors.slice(-3)));
console.log("  screenshots in", out);
process.exit(1);
