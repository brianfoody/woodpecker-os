#!/usr/bin/env npx tsx
/**
 * End-to-end rendering tests for Woodpecker state nodes.
 *
 * Verifies that content renders correctly inside themed AI response cards
 * (handwritten-text shapes with card styling) — the "state nodes" that
 * users see on the canvas.
 *
 * Run:  npm run test:render:e2e
 *
 * Starts a dev server on port 3999, launches Playwright, creates shapes
 * that match real AI response card styling, takes screenshots, and
 * validates the output.
 */

import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { execSync, spawn, type ChildProcess } from "child_process";

const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = "/tmp/woodpecker-e2e-renders";
const GLOBAL_TIMEOUT = 30_000;

// ── Theme tokens (matches createMossBarkTheme) ──────────────────────
// These mirror the props that use-claude-code.ts applies to AI response shapes.
const AI_CARD_PROPS = {
  font: "sans",
  size: "m",
  color: "#4a5c3a",
  autoSize: true,
  w: 500,
  h: 40,
  cardBg: "#f3f0eb",
  cardBorder: "#6b7a5a",
  cardBorderWidth: 5,
  cardRadius: 16,
  cardShadow: "0 1px 3px rgba(0,0,0,0.05)",
  cardLabel: "WOODPECKER",
  cardLabelColor: "#6b7a5a",
  cardFont: "'Lora', serif",
  labelFont: null,
  labelFontSize: null,
  labelFontWeight: null,
  labelLetterSpacing: null,
  labelUppercase: null,
};

// ── Helpers ──────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function step(label: string) {
  console.log(`\n${"━".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"━".repeat(60)}`);
}

async function createStateNode(
  page: Page,
  text: string,
  x: number,
  y: number,
  extraProps: Record<string, any> = {}
): Promise<string> {
  return page.evaluate(
    ({ text, x, y, cardProps, extraProps }) => {
      const editor = (window as any).__woodpecker_editor;
      if (!editor) throw new Error("Editor not found on window");

      const rand = Math.random().toString(36).slice(2, 12);
      const id = `shape:${rand}` as any;
      editor.createShapes([
        {
          id,
          type: "handwritten-text",
          x,
          y,
          props: { ...cardProps, ...extraProps, text },
        },
      ]);
      return id;
    },
    { text, x, y, cardProps: AI_CARD_PROPS, extraProps }
  );
}

async function clearCanvas(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    const shapes = editor.getCurrentPageShapes();
    if (shapes.length > 0) {
      editor.deleteShapes(shapes.map((s: any) => s.id));
    }
  });
}

async function setCamera(page: Page, x: number, y: number, z: number) {
  await page.evaluate(
    ({ x, y, z }) => {
      (window as any).__woodpecker_editor.setCamera({ x, y, z });
    },
    { x, y, z }
  );
}

async function screenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function getRenderedHTML(page: Page, shapeId: string): Promise<string> {
  return page.evaluate((id: string) => {
    const editor = (window as any).__woodpecker_editor;
    const el = document.querySelector(`[data-shape-id="${id}"]`) as HTMLElement;
    return el?.innerHTML ?? "";
  }, shapeId);
}

async function getShapeElement(page: Page, shapeId: string) {
  // tldraw wraps shapes in containers; find the rendered content
  return page.evaluate((id: string) => {
    // Look for tables, code blocks, etc. inside the shape's rendered DOM
    const containers = Array.from(document.querySelectorAll(".tl-shape"));
    for (const c of containers) {
      const html = c.innerHTML;
      if (html.includes("table") || html.includes("WOODPECKER")) {
        // Check shape identity through the editor
      }
    }
    return null;
  }, shapeId);
}

// ── Server management ────────────────────────────────────────────────

function isServerRunning(): boolean {
  try {
    execSync(`lsof -ti:${PORT}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function startServer(): ChildProcess {
  log("Starting dev server on port " + PORT + "...");
  const proc = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
    detached: true,
  });
  proc.stdout?.on("data", () => {});
  proc.stderr?.on("data", () => {});
  return proc;
}

async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      execSync(`curl -sf ${BASE_URL}/v2 > /dev/null 2>&1`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Server not ready after ${timeoutMs}ms`);
}

function killServer() {
  try {
    execSync(`lsof -ti:${PORT} | xargs kill 2>/dev/null`);
  } catch {}
}

// ── Magic wand helpers ───────────────────────────────────────────────

const MOCK_AI_RESPONSE = [
  "# Analysis",
  "",
  "| Aspect | Detail |",
  "|--------|--------|",
  "| Question | Meaning of life |",
  "| Source | Handwritten note |",
  "",
  "## Key Points",
  "- This is a philosophical question",
  "- It has been debated for centuries",
  "",
  "```",
  "answer = 42",
  "```",
].join("\n");

function buildSSEResponse(text: string, sessionId: string, forkSessionId: string): string {
  const lines: string[] = [];
  lines.push(`data: ${JSON.stringify({ type: "status", content: "processing..." })}\n`);

  // Send text in chunks to simulate streaming
  const chunkSize = 50;
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    lines.push(`data: ${JSON.stringify({ type: "text_delta", content: chunk })}\n`);
  }

  lines.push(`data: ${JSON.stringify({ type: "done", content: text, sessionId, forkSessionId })}\n`);
  return lines.join("\n");
}

async function setupMockAPI(page: Page, responseText: string) {
  await page.route("**/api/extract-text", (route) => {
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello world" }),
    });
  });

  await page.route("**/api/claude-code", (route) => {
    route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
      body: buildSSEResponse(responseText, "mock-session-123", "mock-fork-456"),
    });
  });
}

async function drawCircle(page: Page, cx: number, cy: number, radius: number, steps = 20) {
  const startX = cx + radius;
  const startY = cy;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let i = 1; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    await page.mouse.move(x, y, { steps: 1 });
  }

  await page.mouse.move(startX, startY, { steps: 1 });
}

async function triggerMagicWand(page: Page, cx: number, cy: number, radius: number) {
  await drawCircle(page, cx, cy, radius);
  // Hold still for 600ms (hold threshold is 500ms)
  await new Promise((r) => setTimeout(r, 600));
  await page.mouse.up();
}

async function waitForShapeWithProp(page: Page, propName: string, timeout = 60_000): Promise<any> {
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

// ── Test infrastructure ──────────────────────────────────────────────

interface TestCase {
  name: string;
  run: (page: Page, context: BrowserContext) => Promise<void>;
}

const tests: TestCase[] = [];
const results: { name: string; passed: boolean; error?: string }[] = [];

function test(name: string, fn: (page: Page, context: BrowserContext) => Promise<void>) {
  tests.push({ name, run: fn });
}

// ── Test definitions ─────────────────────────────────────────────────

test("markdown table renders as HTML table", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  const tableText = [
    "## Schedule",
    "",
    "| Time | Task | Status |",
    "|------|------|--------|",
    "| 9:00 | Stand-up | Done |",
    "| 10:00 | Code review | In Progress |",
    "| 11:30 | Lunch | Pending |",
    "| 13:00 | Deploy | Pending |",
  ].join("\n");

  await createStateNode(page, tableText, 100, 80);
  await new Promise((r) => setTimeout(r, 1000));

  const ssPath = await screenshot(page, "table-basic");
  log(`Screenshot: ${ssPath}`);

  // Verify a <table> element exists on the page
  const tableCount = await page.evaluate(() => {
    return document.querySelectorAll(".tl-shape table").length;
  });
  if (tableCount === 0) throw new Error("No <table> elements found in rendered shapes");

  // Verify header cells exist
  const thCount = await page.evaluate(() => {
    return document.querySelectorAll(".tl-shape table th").length;
  });
  if (thCount < 3) throw new Error(`Expected >= 3 <th> cells, found ${thCount}`);

  // Verify body rows
  const tdCount = await page.evaluate(() => {
    return document.querySelectorAll(".tl-shape table td").length;
  });
  if (tdCount < 12) throw new Error(`Expected >= 12 <td> cells, found ${tdCount}`);
});

test("markdown table with bold and inline code in cells", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  const tableText = [
    "| Feature | Status | Notes |",
    "|---------|--------|-------|",
    "| **Auth** | `done` | OAuth2 |",
    "| **API** | `wip` | REST + GraphQL |",
    "| **UI** | `planned` | React |",
  ].join("\n");

  await createStateNode(page, tableText, 100, 80);
  await new Promise((r) => setTimeout(r, 1000));

  const ssPath = await screenshot(page, "table-inline-markdown");
  log(`Screenshot: ${ssPath}`);

  // Verify bold elements inside table
  const boldCount = await page.evaluate(() => {
    return document.querySelectorAll(".tl-shape table strong").length;
  });
  if (boldCount < 3) throw new Error(`Expected >= 3 <strong> in table, found ${boldCount}`);

  // Verify inline code in table
  const codeCount = await page.evaluate(() => {
    return document.querySelectorAll(".tl-shape table code").length;
  });
  if (codeCount < 3) throw new Error(`Expected >= 3 <code> in table, found ${codeCount}`);
});

test("heading renders with correct weight and size", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  const headingText = "# Main Title\n## Subtitle\n### Section\n#### Subsection";
  await createStateNode(page, headingText, 100, 80);
  await new Promise((r) => setTimeout(r, 1000));

  const ssPath = await screenshot(page, "headings");
  log(`Screenshot: ${ssPath}`);

  // Check that heading elements exist with bold weight
  const headingFontWeights = await page.evaluate(() => {
    const divs = document.querySelectorAll(".tl-shape div[style]");
    const weights: number[] = [];
    divs.forEach((d) => {
      const w = (d as HTMLElement).style.fontWeight;
      if (w && parseInt(w) >= 600) weights.push(parseInt(w));
    });
    return weights;
  });
  if (headingFontWeights.length < 4)
    throw new Error(`Expected >= 4 bold headings, found ${headingFontWeights.length}`);
});

test("fenced code block renders with monospace font", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  const codeText = [
    "Here is some code:",
    "",
    "```typescript",
    "function greet(name: string) {",
    "  return `Hello ${name}!`;",
    "}",
    "```",
    "",
    "And `inline code` too.",
  ].join("\n");

  await createStateNode(page, codeText, 100, 80);
  await new Promise((r) => setTimeout(r, 1000));

  const ssPath = await screenshot(page, "code-blocks");
  log(`Screenshot: ${ssPath}`);

  // Verify <pre> block exists
  const preCount = await page.evaluate(() => {
    return document.querySelectorAll(".tl-shape pre").length;
  });
  if (preCount === 0) throw new Error("No <pre> elements found for code block");

  // Verify inline <code> exists
  const inlineCodeCount = await page.evaluate(() => {
    return document.querySelectorAll(".tl-shape code").length;
  });
  if (inlineCodeCount === 0) throw new Error("No inline <code> elements found");
});

test("list items render with bullet points", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  const listText = [
    "## Todo",
    "- Buy groceries",
    "- Walk the dog",
    "- Write code",
    "* Review PRs",
  ].join("\n");

  await createStateNode(page, listText, 100, 80);
  await new Promise((r) => setTimeout(r, 1000));

  const ssPath = await screenshot(page, "list-items");
  log(`Screenshot: ${ssPath}`);

  // Verify bullet characters appear in rendered text
  const bulletCount = await page.evaluate(() => {
    const el = document.querySelector(".tl-shape");
    if (!el) return 0;
    return (el.textContent?.match(/\u2022/g) || []).length;
  });
  if (bulletCount < 4) throw new Error(`Expected >= 4 bullet chars, found ${bulletCount}`);
});

test("card styling is applied (bg, border, label)", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  await createStateNode(page, "This is an AI response card.", 100, 80);
  await new Promise((r) => setTimeout(r, 1000));

  const ssPath = await screenshot(page, "card-styling");
  log(`Screenshot: ${ssPath}`);

  // Verify card label "WOODPECKER" appears
  const hasLabel = await page.evaluate(() => {
    const el = document.querySelector(".tl-shape");
    return el?.textContent?.includes("WOODPECKER") ?? false;
  });
  if (!hasLabel) throw new Error("Card label 'WOODPECKER' not found");

  // Verify background color is applied
  const hasBg = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll(".tl-shape div"));
    for (const d of divs) {
      const bg = (d as HTMLElement).style.background;
      if (bg && bg !== "" && bg !== "none") return true;
    }
    return false;
  });
  if (!hasBg) throw new Error("No background color found on card");
});

test("mixed content: heading + table + code + list", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  const mixedText = [
    "# Project Status",
    "",
    "| Module | Owner | Status |",
    "|--------|-------|--------|",
    "| Backend | Alice | **Done** |",
    "| Frontend | Bob | `WIP` |",
    "",
    "## Next Steps",
    "- Deploy to staging",
    "- Run integration tests",
    "",
    "```bash",
    "npm run build && npm run deploy",
    "```",
  ].join("\n");

  await createStateNode(page, mixedText, 100, 60);
  await new Promise((r) => setTimeout(r, 1500));

  const ssPath = await screenshot(page, "mixed-content");
  log(`Screenshot: ${ssPath}`);

  // Verify all element types are present
  const counts = await page.evaluate(() => {
    const shape = document.querySelector(".tl-shape");
    if (!shape) return { tables: 0, pre: 0, strong: 0, bullets: 0 };
    return {
      tables: shape.querySelectorAll("table").length,
      pre: shape.querySelectorAll("pre").length,
      strong: shape.querySelectorAll("strong").length,
      bullets: (shape.textContent?.match(/\u2022/g) || []).length,
    };
  });

  if (counts.tables === 0) throw new Error("No table in mixed content");
  if (counts.pre === 0) throw new Error("No code block in mixed content");
  if (counts.strong === 0) throw new Error("No bold text in mixed content");
  if (counts.bullets < 2) throw new Error(`Expected >= 2 bullets, found ${counts.bullets}`);
});

test("plain text without markdown renders cleanly", async (page) => {
  await clearCanvas(page);
  await setCamera(page, 0, 0, 1);

  const plainText =
    "This is just a plain text response without any markdown formatting. " +
    "It should render cleanly in the card without any extra markup.";

  await createStateNode(page, plainText, 100, 80);
  await new Promise((r) => setTimeout(r, 1000));

  const ssPath = await screenshot(page, "plain-text");
  log(`Screenshot: ${ssPath}`);

  // Verify no spurious table/pre/code elements
  const spurious = await page.evaluate(() => {
    const shape = document.querySelector(".tl-shape");
    if (!shape) return 0;
    return (
      shape.querySelectorAll("table").length +
      shape.querySelectorAll("pre").length +
      shape.querySelectorAll("code").length
    );
  });
  if (spurious > 0) throw new Error(`Found ${spurious} unexpected markup elements in plain text`);
});

// ── Magic wand interaction tests ─────────────────────────────────────

test("magic wand triggers and renders AI response card", async (_page, context) => {
  const newPage = await context.newPage();
  newPage.setDefaultTimeout(GLOBAL_TIMEOUT);

  try {
    await setupMockAPI(newPage, MOCK_AI_RESPONSE);
    await newPage.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });
    await newPage.waitForSelector(".tl-canvas", { timeout: 15_000 });
    await newPage.waitForFunction(
      () => !!(window as any).__woodpecker_editor,
      { timeout: 10_000 }
    );

    await clearCanvas(newPage);
    await setCamera(newPage, 0, 0, 1);

    // Create a text shape to circle
    await newPage.evaluate(() => {
      const editor = (window as any).__woodpecker_editor;
      const rand = Math.random().toString(36).slice(2, 12);
      editor.createShapes([{
        id: `shape:${rand}` as any,
        type: "handwritten-text",
        x: 400,
        y: 300,
        props: {
          text: "What is the meaning of life?",
          font: "caveat",
          size: "m",
          color: "black",
          autoSize: true,
          w: 300,
          h: 40,
        },
      }]);
    });

    // Set draw tool and trigger magic wand
    await newPage.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });
    await triggerMagicWand(newPage, 550, 320, 180);

    // Wait for AI response shape to appear
    log("Waiting for AI response shape...");
    const shape = await waitForShapeWithProp(newPage, "forkSessionId", 15_000);
    console.log(""); // newline after dots

    await new Promise((r) => setTimeout(r, 1500)); // let rendering settle
    const ssPath = await screenshot(newPage, "wand-response");
    log(`Screenshot: ${ssPath}`);

    // Assert forkSessionId matches mock
    if (shape.props.forkSessionId !== "mock-fork-456") {
      throw new Error(`Expected forkSessionId "mock-fork-456", got "${shape.props.forkSessionId}"`);
    }

    // Assert rendered text contains mock response content
    const hasContent = await newPage.evaluate(() => {
      const shapes = Array.from(document.querySelectorAll(".tl-shape"));
      for (const s of shapes) {
        if (s.textContent?.includes("Analysis")) return true;
      }
      return false;
    });
    if (!hasContent) throw new Error("AI response content not found in rendered shape");

    // Assert table element is present
    const tableCount = await newPage.evaluate(() => {
      return document.querySelectorAll(".tl-shape table").length;
    });
    if (tableCount === 0) throw new Error("No <table> element found in AI response card");

    // Assert WOODPECKER label is visible
    const hasLabel = await newPage.evaluate(() => {
      const shapes = Array.from(document.querySelectorAll(".tl-shape"));
      for (const s of shapes) {
        if (s.textContent?.includes("WOODPECKER")) return true;
      }
      return false;
    });
    if (!hasLabel) throw new Error("WOODPECKER label not found on AI response card");
  } finally {
    await newPage.close();
  }
});

test("magic wand creates YOU echo card from OCR", async (_page, context) => {
  const newPage = await context.newPage();
  newPage.setDefaultTimeout(GLOBAL_TIMEOUT);

  try {
    await setupMockAPI(newPage, MOCK_AI_RESPONSE);
    await newPage.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });
    await newPage.waitForSelector(".tl-canvas", { timeout: 15_000 });
    await newPage.waitForFunction(
      () => !!(window as any).__woodpecker_editor,
      { timeout: 10_000 }
    );

    await clearCanvas(newPage);
    await setCamera(newPage, 0, 0, 1);

    // Create a text shape to circle
    await newPage.evaluate(() => {
      const editor = (window as any).__woodpecker_editor;
      const rand = Math.random().toString(36).slice(2, 12);
      editor.createShapes([{
        id: `shape:${rand}` as any,
        type: "handwritten-text",
        x: 400,
        y: 300,
        props: {
          text: "Tell me something interesting",
          font: "caveat",
          size: "m",
          color: "black",
          autoSize: true,
          w: 300,
          h: 40,
        },
      }]);
    });

    // Set draw tool and trigger magic wand
    await newPage.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });
    await triggerMagicWand(newPage, 550, 320, 180);

    // Wait for YOU echo card to appear
    log("Waiting for YOU echo card...");
    const youShape = await waitForShapeWithProp(newPage, "cardLabel", 15_000);
    console.log(""); // newline after dots

    await new Promise((r) => setTimeout(r, 1000));
    const ssPath = await screenshot(newPage, "wand-you-card");
    log(`Screenshot: ${ssPath}`);

    // Find the YOU card specifically
    const youCard = await newPage.evaluate(() => {
      const editor = (window as any).__woodpecker_editor;
      const shapes = editor.getCurrentPageShapes();
      return shapes.find(
        (s: any) => s.type === "handwritten-text" && s.props?.cardLabel === "YOU"
      );
    });

    if (!youCard) throw new Error("No shape with cardLabel 'YOU' found");

    // Verify it contains the mocked OCR text
    if (!youCard.props.text.includes("Hello world")) {
      throw new Error(`Expected YOU card to contain "Hello world", got "${youCard.props.text}"`);
    }
  } finally {
    await newPage.close();
  }
});

// ── Layout scenario tests ─────────────────────────────────────────────

/** Helper: get the canvas-space offset from screen coordinates.
 *  With camera at (0,0,1), screen coords differ from canvas coords by
 *  a fixed offset caused by tldraw UI chrome (toolbar, etc.).
 */
async function getCanvasOffset(page: Page): Promise<{ dx: number; dy: number }> {
  return page.evaluate(() => {
    const editor = (window as any).__woodpecker_editor;
    if (!editor) return { dx: 0, dy: 0 };
    // screenToPage converts a screen point to canvas coordinates
    const screenOrigin = editor.screenToPage({ x: 0, y: 0 });
    return { dx: -screenOrigin.x, dy: -screenOrigin.y };
  });
}

/** Helper: run a layout scenario test.
 *  Creates a WOODPECKER source card and user text, draws a circle that
 *  overlaps both, then asserts relative YOU card positioning.
 */
async function runLayoutTest(
  context: BrowserContext,
  opts: {
    name: string;
    sourcePos: { x: number; y: number };
    userTextPos: { x: number; y: number };
    /** Scenario: which layout rule we expect to trigger */
    scenario: "center-under" | "left-body" | "left-under" | "right-body" | "right-under";
    tolerance: number;
  }
) {
  const newPage = await context.newPage();
  newPage.setDefaultTimeout(GLOBAL_TIMEOUT);

  try {
    await setupMockAPI(newPage, MOCK_AI_RESPONSE);
    await newPage.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });
    await newPage.waitForSelector(".tl-canvas", { timeout: 15_000 });
    await newPage.waitForFunction(
      () => !!(window as any).__woodpecker_editor,
      { timeout: 10_000 }
    );

    await clearCanvas(newPage);
    await setCamera(newPage, 0, 0, 1);

    // Get canvas offset for screen→canvas coordinate mapping
    const offset = await getCanvasOffset(newPage);

    // Create WOODPECKER source AI card
    const sourceId = await createStateNode(
      newPage,
      "Source AI card for layout test.\nTwo lines of content here.",
      opts.sourcePos.x,
      opts.sourcePos.y
    );

    await new Promise((r) => setTimeout(r, 500));

    // Query actual source card bounds
    const sourceBounds = await newPage.evaluate((id: string) => {
      const editor = (window as any).__woodpecker_editor;
      const shape = editor.getShape(id);
      const geo = editor.getShapeGeometry(shape);
      return {
        x: shape.x,
        y: shape.y,
        w: geo.bounds.width,
        h: geo.bounds.height,
      };
    }, sourceId);

    const sourceRight = sourceBounds.x + sourceBounds.w;
    const sourceBottom = sourceBounds.y + sourceBounds.h;
    const sourceCenterX = sourceBounds.x + sourceBounds.w / 2;

    // Create user text shape
    await newPage.evaluate(
      ({ x, y }) => {
        const editor = (window as any).__woodpecker_editor;
        const rand = Math.random().toString(36).slice(2, 12);
        editor.createShapes([{
          id: `shape:${rand}` as any,
          type: "handwritten-text",
          x,
          y,
          props: {
            text: "User question here",
            font: "caveat",
            size: "m",
            color: "black",
            autoSize: true,
            w: 200,
            h: 40,
          },
        }]);
      },
      { x: opts.userTextPos.x, y: opts.userTextPos.y }
    );

    // Compute a circle center (in canvas coords) that overlaps BOTH shapes.
    // For left/right scenarios, the circle must NOT straddle sourceCenterX.
    const userX = opts.userTextPos.x;
    const userY = opts.userTextPos.y;
    const userCX = userX + 100; // approximate user text center X
    const userCY = userY + 20;  // approximate user text center Y

    let circleCX: number;
    let circleCY: number;
    let radius: number;

    if (opts.scenario === "center-under") {
      // Circle should straddle sourceCenterX
      circleCX = sourceCenterX;
      circleCY = (sourceBottom + userCY) / 2;
      radius = Math.max(
        Math.abs(circleCY - sourceBounds.y) + 20,
        Math.abs(circleCY - userCY) + 40
      );
    } else if (opts.scenario.startsWith("left")) {
      // Circle center left of sourceCenterX, right edge overlaps source left edge
      // but stays below sourceCenterX
      const targetRightEdge = sourceBounds.x + sourceBounds.w * 0.3; // overlap left 30% of source
      circleCX = (userCX + targetRightEdge) / 2;
      radius = (targetRightEdge - circleCX) + 10;
      // Ensure radius reaches user text
      const distToUser = Math.abs(circleCX - userCX);
      if (radius < distToUser + 40) radius = distToUser + 40;
      // Ensure circle doesn't straddle source center
      if (circleCX + radius > sourceCenterX) {
        // Shift circle left
        circleCX = sourceCenterX - radius - 10;
      }
      circleCY = opts.scenario === "left-body"
        ? (sourceBounds.y + sourceBounds.h / 2 + userCY) / 2
        : (sourceBottom + userCY) / 2;
      // Ensure radius covers Y range
      const distYToSource = Math.abs(circleCY - sourceBounds.y);
      const distYToUser = Math.abs(circleCY - userCY);
      const neededRadius = Math.max(distYToSource, distYToUser) + 40;
      if (radius < neededRadius) radius = neededRadius;
    } else {
      // Right scenarios: circle center right of sourceCenterX
      const targetLeftEdge = sourceBounds.x + sourceBounds.w * 0.7; // overlap right 30% of source
      circleCX = (userCX + targetLeftEdge) / 2;
      radius = (circleCX - targetLeftEdge) + 10;
      const distToUser = Math.abs(circleCX - userCX);
      if (radius < distToUser + 40) radius = distToUser + 40;
      // Ensure circle doesn't straddle source center
      if (circleCX - radius < sourceCenterX) {
        circleCX = sourceCenterX + radius + 10;
      }
      circleCY = opts.scenario === "right-body"
        ? (sourceBounds.y + sourceBounds.h / 2 + userCY) / 2
        : (sourceBottom + userCY) / 2;
      const distYToSource = Math.abs(circleCY - sourceBounds.y);
      const distYToUser = Math.abs(circleCY - userCY);
      const neededRadius = Math.max(distYToSource, distYToUser) + 40;
      if (radius < neededRadius) radius = neededRadius;
    }

    // Convert canvas coords to screen coords
    const screenCX = circleCX + offset.dx;
    const screenCY = circleCY + offset.dy;

    // Set draw tool and trigger magic wand
    await newPage.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });
    await triggerMagicWand(newPage, screenCX, screenCY, radius);

    // Wait for YOU card to appear
    log("Waiting for YOU card...");
    const youCard = await newPage.evaluate(async () => {
      const start = Date.now();
      while (Date.now() - start < 15000) {
        const editor = (window as any).__woodpecker_editor;
        if (editor) {
          const shapes = editor.getCurrentPageShapes();
          const you = shapes.find(
            (s: any) => s.type === "handwritten-text" && s.props?.cardLabel === "YOU"
          );
          if (you) return { x: you.x, y: you.y };
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    });

    if (!youCard) throw new Error("YOU card not found");

    await new Promise((r) => setTimeout(r, 1000));
    const ssPath = await screenshot(newPage, `layout-${opts.name}`);
    log(`Screenshot: ${ssPath}`);

    // Compute expected position based on scenario and actual source bounds
    let expectedX: number;
    let expectedY: number;
    const CARD_W = 500;
    const GAP = 20;

    // The circle stroke bounding box in canvas coords determines circleMaxY
    // Approximate it from our circle parameters
    const canvasCircleMaxY = circleCY + radius;

    switch (opts.scenario) {
      case "center-under":
        expectedX = sourceBounds.x + (sourceBounds.w - CARD_W) / 2;
        expectedY = canvasCircleMaxY + GAP;
        break;
      case "left-body":
        expectedX = sourceBounds.x - CARD_W - GAP;
        expectedY = canvasCircleMaxY + GAP;
        break;
      case "left-under":
        expectedX = sourceBounds.x - CARD_W - GAP;
        expectedY = canvasCircleMaxY + GAP;
        break;
      case "right-body":
        expectedX = sourceRight + GAP;
        expectedY = canvasCircleMaxY + GAP;
        break;
      case "right-under":
        expectedX = sourceRight + GAP;
        expectedY = canvasCircleMaxY + GAP;
        break;
    }

    log(`Source bounds: (${sourceBounds.x}, ${sourceBounds.y}, w=${sourceBounds.w}, h=${sourceBounds.h})`);
    log(`Circle (canvas): center=(${circleCX.toFixed(0)}, ${circleCY.toFixed(0)}), r=${radius.toFixed(0)}`);
    log(`Expected YOU: (${expectedX.toFixed(0)}, ${expectedY.toFixed(0)})`);
    log(`Actual YOU:   (${youCard.x}, ${youCard.y})`);

    // Assert position within tolerance
    const dx = Math.abs(youCard.x - expectedX);
    const dy = Math.abs(youCard.y - expectedY);

    if (dx > opts.tolerance) {
      throw new Error(
        `YOU card X: expected ~${expectedX.toFixed(0)}, got ${youCard.x} (diff ${dx.toFixed(0)} > ${opts.tolerance})`
      );
    }
    if (dy > opts.tolerance) {
      throw new Error(
        `YOU card Y: expected ~${expectedY.toFixed(0)}, got ${youCard.y} (diff ${dy.toFixed(0)} > ${opts.tolerance})`
      );
    }

    log(`Position OK — within tolerance ${opts.tolerance}px`);

    // Verify connector properties (dash style and anchor points)
    // In tldraw, bindings go FROM arrow TO shape. So getBindingsToShape(sourceId)
    // returns bindings where the source card is the target.
    const connector = await newPage.evaluate((sourceId: string) => {
      const editor = (window as any).__woodpecker_editor;

      // Find all arrow shapes on the page
      const allShapes = editor.getCurrentPageShapes();
      const arrows = allShapes.filter((s: any) => s.type === "arrow");

      for (const arrow of arrows) {
        // Get bindings from this arrow
        const bindings = editor.getBindingsFromShape(arrow.id, "arrow");
        if (!bindings || bindings.length < 2) continue;

        const startB = bindings.find((b: any) => b.props?.terminal === "start");
        const endB = bindings.find((b: any) => b.props?.terminal === "end");

        // Check if start binding points to our source card
        if (startB?.toId === sourceId) {
          return {
            dash: arrow.props?.dash,
            kind: arrow.props?.kind,
            startAnchor: startB?.props?.normalizedAnchor,
            endAnchor: endB?.props?.normalizedAnchor,
          };
        }
      }
      return null;
    }, sourceId);

    if (!connector) {
      throw new Error("No connector arrow found from source card");
    }

    log(`Connector: dash=${connector.dash}, kind=${connector.kind}`);
    log(`  start anchor: (${connector.startAnchor?.x}, ${connector.startAnchor?.y})`);
    log(`  end anchor: (${connector.endAnchor?.x}, ${connector.endAnchor?.y})`);

    // All connectors should exit from bottom center of source card
    if (Math.abs(connector.startAnchor?.x - 0.5) > 0.01 || Math.abs(connector.startAnchor?.y - 1.0) > 0.01) {
      throw new Error(
        `Start anchor should be (0.5, 1.0) but got (${connector.startAnchor?.x}, ${connector.startAnchor?.y})`
      );
    }

    // Verify dash and kind per scenario
    if (opts.scenario === "center-under") {
      if (connector.dash !== "dashed") {
        throw new Error(`Center+under connector should be dashed, got "${connector.dash}"`);
      }
      if (connector.kind === "elbow") {
        throw new Error("Center+under connector should NOT be elbow");
      }
      // End anchor should be top center
      if (Math.abs(connector.endAnchor?.x - 0.5) > 0.01 || Math.abs(connector.endAnchor?.y - 0.0) > 0.01) {
        throw new Error(
          `Center+under end anchor should be (0.5, 0.0) but got (${connector.endAnchor?.x}, ${connector.endAnchor?.y})`
        );
      }
    } else {
      if (connector.dash !== "solid") {
        throw new Error(`${opts.scenario} connector should be solid, got "${connector.dash}"`);
      }
      if (connector.kind !== "elbow") {
        throw new Error(`${opts.scenario} connector should be elbow, got "${connector.kind}"`);
      }
      // Left variants: end anchor should be right side (1.0, 0.5)
      // Right variants: end anchor should be left side (0.0, 0.5)
      const expectedEndX = opts.scenario.startsWith("left") ? 1.0 : 0.0;
      if (Math.abs(connector.endAnchor?.x - expectedEndX) > 0.01 || Math.abs(connector.endAnchor?.y - 0.5) > 0.01) {
        throw new Error(
          `${opts.scenario} end anchor should be (${expectedEndX}, 0.5) but got (${connector.endAnchor?.x}, ${connector.endAnchor?.y})`
        );
      }
    }

    log("Connector OK");
  } finally {
    await newPage.close();
  }
}

test("layout: center + under", async (_page, context) => {
  // User text below source, centered — circle straddles source center X
  await runLayoutTest(context, {
    name: "center-under",
    sourcePos: { x: 300, y: 100 },
    userTextPos: { x: 450, y: 350 },
    scenario: "center-under",
    tolerance: 60,
  });
});

test("layout: left + body", async (_page, context) => {
  // User text to the left, at body level (within source card height)
  await runLayoutTest(context, {
    name: "left-body",
    sourcePos: { x: 600, y: 100 },
    userTextPos: { x: 200, y: 130 },
    scenario: "left-body",
    tolerance: 60,
  });
});

test("layout: left + under", async (_page, context) => {
  // User text to the left, below the source card
  await runLayoutTest(context, {
    name: "left-under",
    sourcePos: { x: 600, y: 100 },
    userTextPos: { x: 200, y: 400 },
    scenario: "left-under",
    tolerance: 60,
  });
});

test("layout: right + body", async (_page, context) => {
  // User text to the right, at body level
  await runLayoutTest(context, {
    name: "right-body",
    sourcePos: { x: 100, y: 100 },
    userTextPos: { x: 750, y: 130 },
    scenario: "right-body",
    tolerance: 60,
  });
});

test("layout: right + under", async (_page, context) => {
  // User text to the right, below the source card
  await runLayoutTest(context, {
    name: "right-under",
    sourcePos: { x: 100, y: 100 },
    userTextPos: { x: 750, y: 400 },
    scenario: "right-under",
    tolerance: 60,
  });
});

test("layout: tall card right + body detects right not center", async (_page, context) => {
  // Tall card with text circled at body level to the right.
  // The circle's left edge may cross the source center but the circle
  // CENTER is clearly to the right — must detect as right, not center.
  const newPage = await context.newPage();
  newPage.setDefaultTimeout(GLOBAL_TIMEOUT);

  try {
    await setupMockAPI(newPage, MOCK_AI_RESPONSE);
    await newPage.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });
    await newPage.waitForSelector(".tl-canvas", { timeout: 15_000 });
    await newPage.waitForFunction(
      () => !!(window as any).__woodpecker_editor,
      { timeout: 10_000 }
    );

    await clearCanvas(newPage);
    await setCamera(newPage, 0, 0, 1);

    const offset = await getCanvasOffset(newPage);

    // Create a TALL source card with lots of text
    const tallText = [
      "## Project Status Report",
      "",
      "### Backend",
      "- API endpoints complete",
      "- Database migrations done",
      "- Auth middleware updated",
      "",
      "### Frontend",
      "- Components built",
      "- State management wired",
      "- Tests passing",
      "",
      "### Infrastructure",
      "- CI/CD pipeline configured",
      "- Staging environment ready",
      "- Monitoring dashboards set up",
      "",
      "### Next Steps",
      "- Load testing",
      "- Security audit",
      "- Documentation review",
    ].join("\n");

    const sourceId = await createStateNode(newPage, tallText, 100, 50);
    await new Promise((r) => setTimeout(r, 500));

    const sourceBounds = await newPage.evaluate((id: string) => {
      const editor = (window as any).__woodpecker_editor;
      const shape = editor.getShape(id);
      const geo = editor.getShapeGeometry(shape);
      return { x: shape.x, y: shape.y, w: geo.bounds.width, h: geo.bounds.height };
    }, sourceId);

    log(`Tall card bounds: (${sourceBounds.x}, ${sourceBounds.y}, w=${sourceBounds.w}, h=${sourceBounds.h})`);

    const sourceRight = sourceBounds.x + sourceBounds.w;
    const sourceCenterX = sourceBounds.x + sourceBounds.w / 2;

    // Place user text to the right at body level (mid-height of the tall card)
    const userY = sourceBounds.y + sourceBounds.h * 0.4;
    await newPage.evaluate(
      ({ x, y }) => {
        const editor = (window as any).__woodpecker_editor;
        const rand = Math.random().toString(36).slice(2, 12);
        editor.createShapes([{
          id: `shape:${rand}` as any,
          type: "handwritten-text",
          x, y,
          props: {
            text: "Tell me more about this",
            font: "caveat", size: "m", color: "black",
            autoSize: true, w: 250, h: 40,
          },
        }]);
      },
      { x: sourceRight + 40, y: userY }
    );

    // Circle that overlaps the right edge of the source card
    // Its center must be to the right of source center
    const userCX = sourceRight + 40 + 125;
    const userCY = userY + 20;
    const circleCX = (userCX + sourceRight) / 2;
    const circleCY = userCY;
    const radius = Math.max(Math.abs(circleCX - (sourceRight - 50)), Math.abs(circleCX - userCX)) + 50;

    log(`Circle center X=${circleCX.toFixed(0)}, sourceCenterX=${sourceCenterX.toFixed(0)}`);

    await newPage.evaluate(() => {
      (window as any).__woodpecker_editor.setCurrentTool("draw");
    });
    await triggerMagicWand(newPage, circleCX + offset.dx, circleCY + offset.dy, radius);

    // Wait for YOU card
    log("Waiting for YOU card...");
    const youCard = await newPage.evaluate(async () => {
      const start = Date.now();
      while (Date.now() - start < 15000) {
        const editor = (window as any).__woodpecker_editor;
        if (editor) {
          const shapes = editor.getCurrentPageShapes();
          const you = shapes.find(
            (s: any) => s.type === "handwritten-text" && s.props?.cardLabel === "YOU"
          );
          if (you) return { x: you.x, y: you.y };
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    });

    if (!youCard) throw new Error("YOU card not found");

    await new Promise((r) => setTimeout(r, 1000));
    const ssPath = await screenshot(newPage, "layout-tall-card-right-body");
    log(`Screenshot: ${ssPath}`);

    // The YOU card must be to the RIGHT of the source card, not centered below
    const expectedMinX = sourceRight;
    log(`YOU card at (${youCard.x}, ${youCard.y}), sourceRight=${sourceRight}`);

    if (youCard.x < expectedMinX) {
      throw new Error(
        `YOU card X=${youCard.x} is LEFT of sourceRight=${expectedMinX} — detected as center instead of right`
      );
    }

    log("Tall card right+body: correctly detected as RIGHT");
  } finally {
    await newPage.close();
  }
});

// ── Main runner ──────────────────────────────────────────────────────

async function main() {
  console.log("\n🪶  Woodpecker Rendering E2E Tests\n");

  // Ensure screenshot directory
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Start server if needed
  let serverProc: ChildProcess | null = null;
  const serverWasRunning = isServerRunning();

  if (!serverWasRunning) {
    serverProc = startServer();
    await waitForServer();
  }
  log(`Server ready at ${BASE_URL}`);

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      storageState: undefined,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(GLOBAL_TIMEOUT);

    // Navigate and wait for editor
    step("Initializing canvas");
    await page.goto(`${BASE_URL}/v2`, { waitUntil: "networkidle" });
    await page.waitForSelector(".tl-canvas", { timeout: 15_000 });
    await page.waitForFunction(
      () => !!(window as any).__woodpecker_editor,
      { timeout: 10_000 }
    );
    log("Editor ready");

    // Optional filter: pass a substring to only run matching tests
    const filterArg = process.argv[2];
    const filteredTests = filterArg
      ? tests.filter((t) => t.name.toLowerCase().includes(filterArg.toLowerCase()))
      : tests;

    if (filterArg) {
      log(`Filter: "${filterArg}" → ${filteredTests.length}/${tests.length} tests`);
    }

    // Run tests
    for (let i = 0; i < filteredTests.length; i++) {
      const t = filteredTests[i];
      step(`${i + 1}/${filteredTests.length}  ${t.name}`);

      try {
        await t.run(page, context);
        results.push({ name: t.name, passed: true });
        log(`✅  Passed`);
      } catch (err: any) {
        results.push({ name: t.name, passed: false, error: err.message });
        log(`❌  Failed: ${err.message}`);

        // Take failure screenshot
        try {
          await screenshot(page, `FAIL-${t.name.replace(/\s+/g, "-")}`);
        } catch {}
      }
    }

    // Summary
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    console.log(`\n${"━".repeat(60)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed, ${filteredTests.length} total`);
    console.log(`${"━".repeat(60)}`);

    for (const r of results) {
      console.log(`  ${r.passed ? "✅" : "❌"}  ${r.name}${r.error ? ` — ${r.error}` : ""}`);
    }

    console.log(`\n  Screenshots: ${SCREENSHOT_DIR}/`);
    console.log(`${"━".repeat(60)}\n`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("\n💥  Test harness failed:", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (serverProc && !serverWasRunning) {
      killServer();
    }
  }
}

main();
