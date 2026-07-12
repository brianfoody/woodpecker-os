/**
 * Smoke test for the Daily Drive shell at /today.
 * Drives: drive list → add todo → open task canvas (seeded TASK card) →
 * back to drive → toggle done → reflect canvas (seeded recap) → boards →
 * create board → plan view shows distill button.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? ".";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const fail = (msg: string): never => {
    throw new Error(msg);
  };

  page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

  // ── Drive view (default) ──
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=THE DRIVE", { timeout: 15000 });
  console.log("✓ /today renders the Drive view");

  // Add a todo by hand
  await page.fill('input[placeholder="Add a task by hand..."]', "Fix the relay heartbeat");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Fix the relay heartbeat");
  console.log("✓ manual todo added");

  // ── Open its task canvas ──
  await page.click("text=Fix the relay heartbeat");
  await page.waitForSelector(".tl-container", { timeout: 20000 });
  // Seeded TASK card is a handwritten-text shape rendering the title
  await page.waitForSelector("text=TASK", { timeout: 10000 });
  await page.waitForSelector("text=Fix the relay heartbeat");
  console.log("✓ task canvas opens and is seeded with the TASK card");
  await page.screenshot({ path: `${SHOT_DIR}/today-task.png` });

  // Task rail: mark done returns to drive
  await page.click("text=DONE");
  await page.waitForSelector("text=1 of 1 done", { timeout: 10000 });
  console.log("✓ DONE returns to drive with progress updated");

  // ── Reflect ──
  await page.click("text=REFLECT");
  await page.waitForSelector(".tl-container", { timeout: 20000 });
  await page.waitForSelector("text=Write up the day", { timeout: 10000 });
  await page.waitForSelector("text=Harvest learnings");
  console.log("✓ reflect canvas seeded with day recap + harvest button");
  await page.screenshot({ path: `${SHOT_DIR}/today-reflect.png` });

  // ── Boards ──
  await page.click("text=BOARDS");
  await page.waitForSelector("text=MASTERBOARDS");
  await page.fill('input[placeholder="New board name..."]', "Woodpecker");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".tl-container", { timeout: 20000 });
  console.log("✓ board created and its canvas opens");

  // Back to boards, board listed
  await page.click("text=BOARDS");
  await page.waitForSelector("text=Woodpecker");
  console.log("✓ board listed");

  // ── Plan ──
  await page.click('button:has-text("PLAN")');
  await page.waitForSelector(".tl-container", { timeout: 20000 });
  await page.waitForSelector("text=Distill into tasks");
  console.log("✓ plan canvas shows the distill action");
  await page.screenshot({ path: `${SHOT_DIR}/today-plan.png` });

  // Reload → view restored (plan), day intact
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Distill into tasks", { timeout: 20000 });
  console.log("✓ view + day survive reload");

  await browser.close();
  console.log("ALL SMOKE CHECKS PASSED");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});
