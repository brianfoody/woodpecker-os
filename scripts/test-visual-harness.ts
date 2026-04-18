#!/usr/bin/env npx tsx
/**
 * Visual test harness for the Woodpecker canvas.
 *
 * Reads a JSON config of actions, executes them against the canvas via
 * Playwright, and writes screenshots / shape dumps to disk.
 *
 * Usage:
 *   npx tsx scripts/test-visual-harness.ts /tmp/visual-test.json
 */

import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3999";
const GLOBAL_TIMEOUT = 120_000;

// ── Action types ─────────────────────────────────────────────────────

interface ClearAction {
  type: "clear";
}

interface CreateShapeAction {
  type: "create-shape";
  text: string;
  x: number;
  y: number;
  props?: Record<string, any>;
}

interface ScreenshotAction {
  type: "screenshot";
  output: string;
}

interface DrawCircleAction {
  type: "draw-circle";
  cx: number;
  cy: number;
  radius: number;
}

interface TriggerWandAction {
  type: "trigger-wand";
  cx: number;
  cy: number;
  radius: number;
}

interface WaitAction {
  type: "wait";
  ms: number;
}

interface WaitForShapeAction {
  type: "wait-for-shape";
  prop: string;
  timeout?: number;
}

interface GetShapesAction {
  type: "get-shapes";
  output: string;
}

interface SetCameraAction {
  type: "set-camera";
  x: number;
  y: number;
  z: number;
}

type Action =
  | ClearAction
  | CreateShapeAction
  | ScreenshotAction
  | DrawCircleAction
  | TriggerWandAction
  | WaitAction
  | WaitForShapeAction
  | GetShapesAction
  | SetCameraAction;

interface Config {
  headless?: boolean;
  storageKey?: string;
  actions: Action[];
}

// ── Canvas helpers ───────────────────────────────────────────────────

async function drawCircle(
  page: Page,
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

  await page.mouse.move(startX, startY, { steps: 2 });
}

async function triggerMagicWand(
  page: Page,
  cx: number,
  cy: number,
  radius: number
) {
  await drawCircle(page, cx, cy, radius);
  // Hold still for 800ms (hold threshold is 500ms)
  await new Promise((r) => setTimeout(r, 800));
  await page.mouse.up();
}

async function createTextShape(
  page: Page,
  text: string,
  x: number,
  y: number,
  extraProps?: Record<string, any>
): Promise<string> {
  return page.evaluate(
    ({
      text,
      x,
      y,
      extraProps,
    }: {
      text: string;
      x: number;
      y: number;
      extraProps?: Record<string, any>;
    }) => {
      const editor = (window as any).__woodpecker_editor;
      if (!editor) throw new Error("Editor not found on window");

      // Generate a tldraw-compatible shape ID without require()
      const rand = Math.random().toString(36).slice(2, 12);
      const id = `shape:${rand}` as any;
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
            ...extraProps,
          },
        },
      ]);
      return id;
    },
    { text, x, y, extraProps }
  );
}

async function waitForShapeWithProp(
  page: Page,
  propName: string,
  timeout = 60_000
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
        props: match.props,
      };
    }, propName);

    if (shape) return shape;
    await new Promise((r) => setTimeout(r, 2000));
    process.stdout.write(".");
  }
  throw new Error(`Timeout waiting for shape with prop "${propName}"`);
}

async function getAllTextShapes(page: Page): Promise<any[]> {
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
        props: s.props,
      }));
  });
}

// ── Action executor ──────────────────────────────────────────────────

async function executeAction(page: Page, action: Action) {
  switch (action.type) {
    case "clear":
      console.log("  [clear] Deleting all shapes");
      await page.evaluate(() => {
        const editor = (window as any).__woodpecker_editor;
        const shapes = editor.getCurrentPageShapes();
        if (shapes.length > 0) {
          editor.deleteShapes(shapes.map((s: any) => s.id));
        }
      });
      break;

    case "create-shape":
      console.log(
        `  [create-shape] "${action.text}" at (${action.x}, ${action.y})`
      );
      await createTextShape(
        page,
        action.text,
        action.x,
        action.y,
        action.props
      );
      break;

    case "screenshot": {
      const dir = path.dirname(action.output);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      console.log(`  [screenshot] → ${action.output}`);
      await page.screenshot({ path: action.output, fullPage: true });
      break;
    }

    case "draw-circle":
      console.log(
        `  [draw-circle] center=(${action.cx}, ${action.cy}) r=${action.radius}`
      );
      await page.evaluate(() => {
        (window as any).__woodpecker_editor.setCurrentTool("draw");
      });
      await drawCircle(page, action.cx, action.cy, action.radius);
      await page.mouse.up();
      break;

    case "trigger-wand":
      console.log(
        `  [trigger-wand] center=(${action.cx}, ${action.cy}) r=${action.radius}`
      );
      await page.evaluate(() => {
        (window as any).__woodpecker_editor.setCurrentTool("draw");
      });
      await triggerMagicWand(page, action.cx, action.cy, action.radius);
      break;

    case "wait":
      console.log(`  [wait] ${action.ms}ms`);
      await new Promise((r) => setTimeout(r, action.ms));
      break;

    case "wait-for-shape":
      console.log(
        `  [wait-for-shape] prop="${action.prop}" timeout=${action.timeout || 60000}ms`
      );
      await waitForShapeWithProp(page, action.prop, action.timeout);
      console.log(""); // newline after dots
      break;

    case "get-shapes": {
      const shapes = await getAllTextShapes(page);
      const outDir = path.dirname(action.output);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(action.output, JSON.stringify(shapes, null, 2));
      console.log(
        `  [get-shapes] ${shapes.length} shapes → ${action.output}`
      );
      break;
    }

    case "set-camera":
      console.log(
        `  [set-camera] x=${action.x} y=${action.y} z=${action.z}`
      );
      await page.evaluate(
        ({ x, y, z }: { x: number; y: number; z: number }) => {
          (window as any).__woodpecker_editor.setCamera({ x, y, z });
        },
        { x: action.x, y: action.y, z: action.z }
      );
      break;

    default:
      console.warn(`  [unknown] Skipping unknown action: ${(action as any).type}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: npx tsx scripts/test-visual-harness.ts <config.json>");
    process.exit(1);
  }

  const config: Config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const headless = config.headless !== false;

  console.log(`\n🪶  Woodpecker Visual Test Harness`);
  console.log(`  Target: ${BASE_URL}/v2`);
  console.log(`  Headless: ${headless}`);
  console.log(`  Actions: ${config.actions.length}\n`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: undefined,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(GLOBAL_TIMEOUT);

  try {
    // Navigate to canvas
    console.log("  [init] Loading canvas...");
    await page.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tl-canvas", { timeout: 15_000 });
    await page.waitForFunction(
      () => !!(window as any).__woodpecker_editor,
      { timeout: 10_000 }
    );
    console.log("  [init] Editor ready");

    // Clear existing shapes to start fresh
    await page.evaluate(() => {
      const editor = (window as any).__woodpecker_editor;
      const shapes = editor.getCurrentPageShapes();
      if (shapes.length > 0) {
        editor.deleteShapes(shapes.map((s: any) => s.id));
      }
    });

    // Set draw tool as default
    await page.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });

    // Execute actions
    for (const action of config.actions) {
      await executeAction(page, action);
    }

    console.log("\n  ✅  All actions completed successfully\n");
  } catch (err) {
    console.error("\n  ❌  Test failed:", err);

    // Take error screenshot
    try {
      await page.screenshot({
        path: "/tmp/woodpecker-visual-error.png",
        fullPage: true,
      });
      console.error("  Error screenshot → /tmp/woodpecker-visual-error.png");
    } catch {}

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
