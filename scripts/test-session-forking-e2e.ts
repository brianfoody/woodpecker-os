#!/usr/bin/env npx tsx
/**
 * End-to-end visual test for session forking on the canvas.
 *
 * Opens a real browser, draws text, circles it, waits for AI response,
 * then forks from the response to verify branching works visually.
 *
 * Run:  npm run test:fork:e2e
 *
 * The browser stays open so you can inspect the result.
 * Press Ctrl+C to close.
 */

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SLOW_MO = 50; // ms between Playwright actions — makes it watchable

// ── Helpers ──────────────────────────────────────────────────────────

function step(label: string) {
  console.log(`\n${"━".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"━".repeat(60)}`);
}

function pass(msg: string) {
  console.log(`  ✅  ${msg}`);
}

function fail(msg: string) {
  console.error(`  ❌  ${msg}`);
}

function info(msg: string) {
  console.log(`  ℹ   ${msg}`);
}

/** Draw a circle on the tldraw canvas at (cx, cy) with the given radius */
async function drawCircle(
  page: any,
  cx: number,
  cy: number,
  radius: number,
  steps = 40
) {
  const startX = cx + radius;
  const startY = cy;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let i = 1; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    await page.mouse.move(x, y, { steps: 2 });
  }

  // Close the loop
  await page.mouse.move(startX, startY, { steps: 2 });
}

/** Write text on the canvas using the handwritten-text shape programmatically */
async function createTextShape(
  page: any,
  text: string,
  x: number,
  y: number
): Promise<string> {
  return page.evaluate(
    ({ text, x, y }: { text: string; x: number; y: number }) => {
      const editor = (window as any).__woodpecker_editor;
      if (!editor) throw new Error("Editor not found on window");

      const { createShapeId } = require("tldraw");
      const id = createShapeId();
      editor.createShapes([
        {
          id,
          type: "handwritten-text",
          x,
          y,
          props: {
            text,
            font: "caveat",
            size: "m",
            color: "black",
            autoSize: true,
            w: 300,
            h: 40,
          },
        },
      ]);
      return id;
    },
    { text, x, y }
  );
}

/** Wait for a handwritten-text shape with specific prop to appear */
async function waitForShapeWithProp(
  page: any,
  propName: string,
  timeout = 120_000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const shape = await page.evaluate((prop: string) => {
      const editor = (window as any).__woodpecker_editor;
      if (!editor) return null;
      const shapes = editor.getCurrentPageShapes();
      const match = shapes.find(
        (s: any) => s.type === "handwritten-text" && s.props?.[prop]
      );
      if (!match) return null;
      return {
        id: match.id,
        x: match.x,
        y: match.y,
        props: {
          text: match.props.text?.slice(0, 100),
          claudeSessionId: match.props.claudeSessionId,
          forkSessionId: match.props.forkSessionId,
          w: match.props.w,
          h: match.props.h,
        },
      };
    }, propName);

    if (shape) return shape;
    await new Promise((r) => setTimeout(r, 2000));
    process.stdout.write(".");
  }
  throw new Error(`Timeout waiting for shape with prop "${propName}"`);
}

/** Count shapes with a given prop */
async function countShapesWithProp(
  page: any,
  propName: string
): Promise<number> {
  return page.evaluate((prop: string) => {
    const editor = (window as any).__woodpecker_editor;
    if (!editor) return 0;
    return editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "handwritten-text" && s.props?.[prop])
      .length;
  }, propName);
}

/** Get all handwritten-text shapes */
async function getAllTextShapes(page: any): Promise<any[]> {
  return page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    if (!editor) return [];
    return editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "handwritten-text")
      .map((s: any) => ({
        id: s.id,
        x: s.x,
        y: s.y,
        text: s.props.text?.slice(0, 80),
        claudeSessionId: s.props.claudeSessionId,
        forkSessionId: s.props.forkSessionId,
      }));
  });
}

/** Trigger the magic wand gesture programmatically on circled shapes */
async function triggerMagicWand(
  page: any,
  cx: number,
  cy: number,
  radius: number
): Promise<void> {
  // Draw circle gesture
  await drawCircle(page, cx, cy, radius);

  // Hold still for 600ms (hold threshold is 500ms)
  info("Holding still to trigger magic wand...");
  await new Promise((r) => setTimeout(r, 800));

  // Release
  await page.mouse.up();
}

// ── Main test ────────────────────────────────────────────────────────

async function main() {
  console.log("\n🪶  Woodpecker Session Forking — Visual E2E Test\n");
  console.log(`  Target: ${BASE_URL}/v2`);
  console.log(`  Browser will stay open for inspection. Ctrl+C to close.\n`);

  const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW_MO,
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    // Use a fresh storage state so we don't interfere with real canvas data
    storageState: undefined,
  });

  const page = await context.newPage();

  // Log console output from the page
  page.on("console", (msg: any) => {
    const text = msg.text();
    if (
      text.includes("[sdk]") ||
      text.includes("Fork") ||
      text.includes("fork") ||
      text.includes("session")
    ) {
      console.log(`  🌐  ${text}`);
    }
  });

  try {
    // ── Step 1: Open canvas ───────────────────────────────────────
    step("1/5  Open /v2 canvas and wait for editor");
    await page.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });

    // Wait for tldraw canvas to render
    await page.waitForSelector(".tl-canvas", { timeout: 15_000 });
    info("Canvas loaded");

    // Wait for editor to be exposed on window
    await page.waitForFunction(
      () => !!(window as any).__woodpecker_editor,
      { timeout: 10_000 }
    );
    pass("Editor ready");

    // Clear any existing shapes from previous test runs
    await page.evaluate(() => {
      const editor = (window as any).__woodpecker_editor;
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) {
        editor.deleteShapes(shapes.map((s: any) => s.id));
      }
    });
    info("Canvas cleared");

    // Make sure the draw tool is selected
    await page.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });

    // ── Step 2: Write text and circle it ──────────────────────────
    step("2/5  Create text and trigger magic wand");

    // Create a text shape in the center
    const textId = await createTextShape(
      page,
      "What is the project structure?",
      400,
      300
    );
    pass(`Created text shape: ${textId}`);

    // Pan camera to ensure the text is visible
    await page.evaluate(() => {
      (window as any).__woodpecker_editor.setCamera({ x: 0, y: 0, z: 1 });
    });

    await new Promise((r) => setTimeout(r, 500));

    // Re-select draw tool (creating shape may have changed tool)
    await page.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });

    // Circle the text to trigger magic wand
    info("Drawing circle around text...");
    await triggerMagicWand(page, 550, 320, 180);

    // ── Step 3: Wait for AI response with forkSessionId ───────────
    step("3/5  Waiting for AI response with forkSessionId...");

    const responseShape = await waitForShapeWithProp(page, "forkSessionId");
    console.log("");
    pass(
      `Response shape received: forkSessionId=${responseShape.props.forkSessionId?.slice(0, 8)}...`
    );
    pass(`Response text: "${responseShape.props.text}..."`);

    if (responseShape.props.claudeSessionId) {
      pass(
        `Last shape has claudeSessionId=${responseShape.props.claudeSessionId.slice(0, 8)}...`
      );
    }

    // Count total shapes with forkSessionId
    const forkCount = await countShapesWithProp(page, "forkSessionId");
    pass(`${forkCount} shape(s) have forkSessionId (all response shapes are fork points)`);

    // ── Step 4: Circle the response to fork from it ───────────────
    step("4/5  Circling response shape to create a fork branch");

    // Re-select draw tool
    await page.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });

    // Write a follow-up question near the response
    const followUpId = await createTextShape(
      page,
      "Tell me about the lib folder specifically",
      responseShape.x + responseShape.props.w + 50,
      responseShape.y
    );
    pass(`Created follow-up text: ${followUpId}`);

    await new Promise((r) => setTimeout(r, 500));

    // Re-select draw tool
    await page.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });

    // Circle around both the response and the follow-up question
    const circleX =
      (responseShape.x + responseShape.x + responseShape.props.w + 350) / 2;
    const circleY = responseShape.y + (responseShape.props.h || 100) / 2;
    const circleRadius = Math.max(
      (responseShape.props.w + 400) / 2,
      (responseShape.props.h || 100) / 2 + 30
    );

    info("Drawing circle around response + follow-up...");
    await triggerMagicWand(page, circleX, circleY, circleRadius);

    // ── Step 5: Wait for forked response ──────────────────────────
    step("5/5  Waiting for forked response...");

    // Wait for a NEW shape with forkSessionId (different from the first one)
    const firstForkId = responseShape.props.forkSessionId;
    const start = Date.now();
    let forkedShape: any = null;

    while (Date.now() - start < 120_000) {
      const shapes = await getAllTextShapes(page);
      forkedShape = shapes.find(
        (s: any) =>
          s.forkSessionId && s.forkSessionId !== firstForkId && s.text
      );
      if (forkedShape) break;
      await new Promise((r) => setTimeout(r, 2000));
      process.stdout.write(".");
    }

    console.log("");

    if (forkedShape) {
      pass(`Forked response received!`);
      pass(`New forkSessionId: ${forkedShape.forkSessionId?.slice(0, 8)}...`);
      pass(`Text: "${forkedShape.text}..."`);

      // Verify it's a different fork from the original
      if (forkedShape.forkSessionId !== firstForkId) {
        pass("Fork IDs are different — independent branch confirmed");
      } else {
        fail("Fork IDs are the same — branching may not have worked");
      }
    } else {
      fail("Timed out waiting for forked response");
    }

    // ── Summary ───────────────────────────────────────────────────
    const allShapes = await getAllTextShapes(page);
    console.log(`\n${"━".repeat(60)}`);
    console.log("  Final canvas state:");
    console.log(`${"━".repeat(60)}`);
    for (const s of allShapes) {
      const forkTag = s.forkSessionId
        ? ` [fork:${s.forkSessionId.slice(0, 8)}]`
        : "";
      const sessionTag = s.claudeSessionId
        ? ` [session:${s.claudeSessionId.slice(0, 8)}]`
        : "";
      console.log(
        `  (${Math.round(s.x)}, ${Math.round(s.y)}) "${s.text}"${forkTag}${sessionTag}`
      );
    }

    console.log(`\n${"━".repeat(60)}`);
    console.log("  🎉  Visual test complete! Browser staying open.");
    console.log("  Press Ctrl+C to close.");
    console.log(`${"━".repeat(60)}\n`);

    // Keep browser open for inspection
    await new Promise(() => {});
  } catch (err) {
    console.error("\n💥  Test failed:", err);

    // Take screenshot on failure
    try {
      await page.screenshot({ path: "test-fork-failure.png", fullPage: true });
      info("Screenshot saved to test-fork-failure.png");
    } catch {}

    // Still keep browser open to inspect
    info("Browser staying open for inspection. Ctrl+C to close.");
    await new Promise(() => {});
  }
}

main();
