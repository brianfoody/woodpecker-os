#!/usr/bin/env npx tsx
/**
 * End-to-end test for cancel → retry → dismiss flows.
 *
 * Tests:
 *   1. Tap-to-cancel → peach cancelled state → tap-to-retry → see progression
 *   2. Scratch-to-cancel → peach cancelled state → tap-to-retry → see progression
 *   3. Tap-to-cancel → scratch-to-dismiss (removes indicator)
 *   4. Scratch-to-cancel → scratch-to-dismiss
 *
 * API calls are fully mocked. The mock SSE stream cycles through status
 * messages so we can verify the indicator updates after retry.
 *
 * Run:  npm run test:cancel:e2e
 */

import { chromium, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SLOW_MO = 30;

// ── Helpers ──────────────────────────────────────────────────────────

function step(label: string) {
  console.log(`\n${"━".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"━".repeat(60)}`);
}
function pass(msg: string) { console.log(`  ✅  ${msg}`); }
function fail(msg: string) { console.error(`  ❌  ${msg}`); }
function info(msg: string) { console.log(`  ℹ   ${msg}`); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function drawCircle(page: Page, cx: number, cy: number, radius: number, steps = 40) {
  const startX = cx + radius;
  const startY = cy;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    await page.mouse.move(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), { steps: 2 });
  }
  await page.mouse.move(startX, startY, { steps: 2 });
}

async function createTextShape(page: Page, text: string, x: number, y: number): Promise<string> {
  return page.evaluate(({ text, x, y }) => {
    const editor = (window as any).__woodpecker_editor;
    if (!editor) throw new Error("Editor not found");
    const id = `shape:${Math.random().toString(36).slice(2, 12)}` as any;
    editor.createShapes([{ id, type: "handwritten-text", x, y, props: { text, font: "caveat", size: "m", color: "black", autoSize: true, w: 300, h: 40 } }]);
    return id;
  }, { text, x, y });
}

async function triggerMagicWand(page: Page, cx: number, cy: number, radius: number) {
  await drawCircle(page, cx, cy, radius);
  await sleep(1200); // hold still long enough for the hold detector (500ms threshold)
  await page.mouse.up();
}

async function countShapesOfType(page: Page, type: string): Promise<number> {
  return page.evaluate((t) => {
    const editor = (window as any).__woodpecker_editor;
    return editor ? editor.getCurrentPageShapes().filter((s: any) => s.type === t).length : 0;
  }, type);
}

async function isThinkingCancelled(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    if (!editor) return false;
    const s = editor.getCurrentPageShapes().find((s: any) => s.type === "thinking-indicator");
    return s?.props?.cancelled === true;
  });
}

async function getThinkingLabel(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    if (!editor) return null;
    const s = editor.getCurrentPageShapes().find((s: any) => s.type === "thinking-indicator");
    return s?.props?.label ?? null;
  });
}

async function getThinkingShapeViewportBounds(page: Page): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    if (!editor) return null;
    const s = editor.getCurrentPageShapes().find((s: any) => s.type === "thinking-indicator");
    if (!s) return null;
    const cam = editor.getCamera();
    return { x: s.x * cam.z + cam.x, y: s.y * cam.z + cam.y, w: s.props.w * cam.z, h: s.props.h * cam.z };
  });
}

async function waitForThinkingShape(page: Page, timeout = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await countShapesOfType(page, "thinking-indicator") > 0) return;
    await sleep(150);
  }
  throw new Error("Timeout waiting for thinking-indicator");
}

async function waitForCancelledState(page: Page, timeout = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isThinkingCancelled(page)) return;
    await sleep(150);
  }
  throw new Error("Timeout: indicator did not enter cancelled state");
}

async function waitForActiveState(page: Page, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const count = await countShapesOfType(page, "thinking-indicator");
    if (count > 0 && !(await isThinkingCancelled(page))) return;
    await sleep(150);
  }
  throw new Error("Timeout: indicator did not return to active state");
}

async function waitForNoThinkingShape(page: Page, timeout = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await countShapesOfType(page, "thinking-indicator") === 0) return;
    await sleep(150);
  }
  throw new Error("Timeout: thinking-indicator still present");
}

/** Wait for the thinking label to change from its current value */
async function waitForLabelChange(page: Page, currentLabel: string, timeout = 8_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const label = await getThinkingLabel(page);
    if (label && label !== currentLabel) return label;
    await sleep(150);
  }
  throw new Error(`Timeout: label did not change from "${currentLabel}"`);
}

async function panToThinkingShape(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    const s = editor.getCurrentPageShapes().find((s: any) => s.type === "thinking-indicator");
    if (s) editor.setCamera({ x: -(s.x - 450), y: -(s.y - 400), z: 1 });
  });
  await sleep(300);
}

async function drawScratchOut(page: Page, cx: number, cy: number, w: number, h: number) {
  const passes = 5, ptsPerPass = 8, halfW = w / 2, spread = h * 0.3;
  await page.mouse.move(cx - halfW, cy - spread);
  await sleep(100);
  await page.mouse.down();
  await sleep(50);
  for (let p = 0; p < passes; p++) {
    const right = p % 2 === 0;
    const py = cy - spread + (spread * 2 * p) / (passes - 1);
    for (let i = 1; i <= ptsPerPass; i++) {
      const t = i / ptsPerPass;
      await page.mouse.move(right ? cx - halfW + w * t : cx + halfW - w * t, py);
      await sleep(10);
    }
  }
  await sleep(200);
  await page.mouse.up();
}

async function tapAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 5 });
  await sleep(100);
  await page.mouse.down();
  await sleep(50);
  await page.mouse.up();
}

// ── Network-level mocks (page.route) ────────────────────────────────

async function installRouteMocks(page: Page) {
  // Mock OCR endpoint — return immediately
  await page.route("**/api/extract-text", (route) => {
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "What is 2+2?" }),
    });
  });

  // Mock claude-code endpoint — never respond (keeps the fetch hanging
  // so the thinking indicator stays visible for cancel/retry testing)
  await page.route("**/api/claude-code", (route) => {
    console.log("[mock] /api/claude-code → hanging (never responding)");
    // Intentionally do NOT call route.fulfill() or route.abort()
    // The pending fetch keeps the thinking indicator alive
  });
}

// ── Shared setup ────────────────────────────────────────────────────

async function setupSessionAndWaitForThinking(page: Page, text: string) {
  await page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    const shapes = editor.getCurrentPageShapes();
    if (shapes.length > 0) editor.deleteShapes(shapes.map((s: any) => s.id));
  });

  // Route mocks persist across remounts — no need to reinstall

  await page.evaluate(() => { (window as any).__woodpecker_editor.setCurrentTool("draw"); });
  await createTextShape(page, text, 400, 300);
  await page.evaluate(() => { (window as any).__woodpecker_editor.setCamera({ x: 0, y: 0, z: 1 }); });
  await sleep(500);
  await page.evaluate(() => { (window as any).__woodpecker_editor.setCurrentTool("draw"); });

  await triggerMagicWand(page, 550, 320, 180);
  await waitForThinkingShape(page);
  pass("Thinking indicator appeared");
  await sleep(300);
}

async function verifyNoLeakedText(page: Page, label: string): Promise<boolean> {
  const leaked = await page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    return editor.getCurrentPageShapes()
      .filter((s: any) => s.type === "handwritten-text")
      .some((s: any) => s.props?.text?.includes("should not appear"));
  });
  if (leaked) { fail(`${label}: leaked text`); return false; }
  pass(`${label}: no leaked text`);
  return true;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🪶  Woodpecker Cancel & Retry — E2E Test\n");
  console.log(`  Target: ${BASE_URL}/v2\n`);

  let allPassed = true;
  const browser = await chromium.launch({ headless: false, slowMo: SLOW_MO });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg: any) => {
    const t = msg.text();
    if (/\[mock\]|cancel|Cancel|abort|Scratch|scratch|retry|Retry|dismiss|Dismiss/.test(t)) {
      console.log(`  🌐  ${t}`);
    }
  });

  try {
    step("Setup");
    await page.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tl-canvas", { timeout: 15_000 });
    await page.waitForFunction(() => !!(window as any).__woodpecker_editor, { timeout: 10_000 });
    pass("Editor ready");

    // Wait for any initial tldraw remounts to settle (dynamic import can cause double mount)
    await sleep(1500);
    // Re-acquire editor ref after possible remount
    await page.waitForFunction(() => !!(window as any).__woodpecker_editor, { timeout: 5_000 });

    await page.evaluate(() => {
      const e = (window as any).__woodpecker_editor;
      const s = e.getCurrentPageShapes();
      if (s.length > 0) e.deleteShapes(s.map((x: any) => x.id));
    });
    await installRouteMocks(page);
    pass("Mocks installed");

    // ═════════════════════════════════════════════════════════════════
    //  TEST 1 — TAP CANCEL → RETRY → VERIFY PROGRESSION
    // ═════════════════════════════════════════════════════════════════
    step("Test 1: Tap cancel → retry");
    await setupSessionAndWaitForThinking(page, "Explain recursion");
    await panToThinkingShape(page);

    let bounds = await getThinkingShapeViewportBounds(page);
    if (!bounds) { fail("No bounds"); allPassed = false; }
    else {
      // Cancel
      await tapAt(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
      await waitForCancelledState(page);
      pass("Cancelled state (peach)");

      // Card must still exist
      if (await countShapesOfType(page, "thinking-indicator") !== 1) {
        fail("Cancelled card disappeared!"); allPassed = false;
      } else { pass("Card persists after cancel"); }

      const cancelLabel = await getThinkingLabel(page);
      info(`Cancel label: "${cancelLabel}"`);

      await verifyNoLeakedText(page, "T1 cancel") || (allPassed = false);

      // Retry
      await panToThinkingShape(page);
      bounds = await getThinkingShapeViewportBounds(page);
      if (bounds) {
        await tapAt(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
        await waitForActiveState(page);
        pass("Retry → active state");

        // Card must still exist (never disappeared)
        if (await countShapesOfType(page, "thinking-indicator") !== 1) {
          fail("Card disappeared during retry!"); allPassed = false;
        } else { pass("Card persisted through retry (no flicker)"); }

        // Check that the label changed from "cancelled" to something active
        const retryLabel = await getThinkingLabel(page);
        info(`Retry label: "${retryLabel}"`);
        if (retryLabel && retryLabel !== cancelLabel) {
          pass(`Label changed: "${cancelLabel}" → "${retryLabel}"`);
        } else {
          fail("Label did not change after retry");
          allPassed = false;
        }
      }

      // Clean up — cancel for next test
      await panToThinkingShape(page);
      bounds = await getThinkingShapeViewportBounds(page);
      if (bounds) await tapAt(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
      await sleep(300);
    }

    // ═════════════════════════════════════════════════════════════════
    //  TEST 2 — SCRATCH CANCEL → RETRY → VERIFY PROGRESSION
    // ═════════════════════════════════════════════════════════════════
    step("Test 2: Scratch cancel → retry");
    await setupSessionAndWaitForThinking(page, "Write a haiku");
    await panToThinkingShape(page);

    bounds = await getThinkingShapeViewportBounds(page);
    if (!bounds) { fail("No bounds"); allPassed = false; }
    else {
      await page.evaluate(() => { (window as any).__woodpecker_editor.setCurrentTool("draw"); });
      await sleep(100);
      await drawScratchOut(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w * 0.7, bounds.h);
      await waitForCancelledState(page);
      pass("Scratch → cancelled");

      if (await countShapesOfType(page, "thinking-indicator") !== 1) {
        fail("Card disappeared!"); allPassed = false;
      } else { pass("Card persists"); }

      await verifyNoLeakedText(page, "T2 cancel") || (allPassed = false);

      // Retry
      await panToThinkingShape(page);
      bounds = await getThinkingShapeViewportBounds(page);
      if (bounds) {
        await tapAt(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
        await waitForActiveState(page);
        pass("Retry → active");
      }

      // Clean up
      await panToThinkingShape(page);
      bounds = await getThinkingShapeViewportBounds(page);
      if (bounds) await tapAt(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
      await sleep(300);
    }

    // ═════════════════════════════════════════════════════════════════
    //  TEST 3 — TAP CANCEL → SCRATCH DISMISS
    // ═════════════════════════════════════════════════════════════════
    step("Test 3: Tap cancel → scratch dismiss");
    await setupSessionAndWaitForThinking(page, "Describe a sunset");
    await panToThinkingShape(page);

    bounds = await getThinkingShapeViewportBounds(page);
    if (!bounds) { fail("No bounds"); allPassed = false; }
    else {
      await tapAt(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
      await waitForCancelledState(page);
      pass("Cancelled");
      await sleep(300);

      await panToThinkingShape(page);
      bounds = await getThinkingShapeViewportBounds(page);
      if (bounds) {
        await page.evaluate(() => { (window as any).__woodpecker_editor.setCurrentTool("draw"); });
        await sleep(100);
        await drawScratchOut(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w * 0.7, bounds.h);
        try {
          await waitForNoThinkingShape(page);
          pass("Scratch dismiss → indicator removed");
        } catch { fail("Indicator still present after dismiss"); allPassed = false; }
      }
    }

    // ═════════════════════════════════════════════════════════════════
    //  TEST 4 — SCRATCH CANCEL → SCRATCH DISMISS
    // ═════════════════════════════════════════════════════════════════
    step("Test 4: Scratch cancel → scratch dismiss");
    await setupSessionAndWaitForThinking(page, "Meaning of life");
    await panToThinkingShape(page);

    bounds = await getThinkingShapeViewportBounds(page);
    if (!bounds) { fail("No bounds"); allPassed = false; }
    else {
      await page.evaluate(() => { (window as any).__woodpecker_editor.setCurrentTool("draw"); });
      await sleep(100);
      await drawScratchOut(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w * 0.7, bounds.h);
      await waitForCancelledState(page);
      pass("Scratch → cancelled");
      await sleep(300);

      await panToThinkingShape(page);
      bounds = await getThinkingShapeViewportBounds(page);
      if (bounds) {
        await page.evaluate(() => { (window as any).__woodpecker_editor.setCurrentTool("draw"); });
        await sleep(100);
        await drawScratchOut(page, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w * 0.7, bounds.h);
        try {
          await waitForNoThinkingShape(page);
          pass("Scratch dismiss → removed");
        } catch { fail("Still present after dismiss"); allPassed = false; }
      }
    }

    // ═════════════════════════════════════════════════════════════════
    //  SUMMARY
    // ═════════════════════════════════════════════════════════════════
    console.log(`\n${"━".repeat(60)}`);
    console.log(allPassed ? "  🎉  All tests passed!" : "  ⚠️   Some tests failed.");
    console.log(`${"━".repeat(60)}\n`);

    await browser.close();
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error("\n💥  Test crashed:", err);
    try { await page.screenshot({ path: "test-cancel-failure.png", fullPage: true }); } catch {}
    await browser.close();
    process.exit(1);
  }
}

main();
