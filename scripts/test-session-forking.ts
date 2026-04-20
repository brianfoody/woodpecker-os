#!/usr/bin/env npx tsx
/**
 * Integration test for session forking.
 *
 * Runs real queries against the local Claude agent SDK, verifies:
 *   1. A fresh query returns a session ID
 *   2. forkSession() creates an immutable snapshot
 *   3. Two resumes from the same fork produce independent branches
 *   4. Branch isolation — neither branch sees the other's content
 *   5. The fork point remains immutable
 *
 * Run:  npm run test:fork
 */

import {
  query,
  forkSession,
  getSessionMessages,
  getSessionInfo,
} from "@anthropic-ai/claude-agent-sdk";

// deleteSession exists at runtime but is not yet in the published type definitions
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { deleteSession } = require("@anthropic-ai/claude-agent-sdk") as { deleteSession: (id: string, opts: { dir: string }) => Promise<void> };

const CWD = process.cwd();
const sessionsToCleanup: string[] = [];

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

function assert(condition: boolean, msg: string) {
  if (condition) {
    pass(msg);
  } else {
    fail(msg);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runQuery(opts: {
  prompt: string;
  resume?: string;
  forkSession?: boolean;
}): Promise<{ sessionId: string; text: string }> {
  const options: Record<string, unknown> = {
    cwd: CWD,
    allowedTools: ["Read", "Glob", "Grep"],
    permissionMode: "default",
    maxTurns: 3,
  };

  if (opts.resume) {
    options.resume = opts.resume;
    if (opts.forkSession) options.forkSession = true;
  }

  let sessionId = "";
  let text = "";

  for await (const message of query({ prompt: opts.prompt, options })) {
    const msg = message as any;
    if (msg.session_id) sessionId = msg.session_id;

    if (message.type === "result") {
      sessionId = msg.session_id || msg.sessionId || sessionId;
      if (typeof msg.result === "string") {
        text = msg.result;
      } else if (msg.result?.content) {
        text =
          typeof msg.result.content === "string"
            ? msg.result.content
            : JSON.stringify(msg.result.content);
      }
    }
  }

  if (!sessionId) throw new Error("No session ID returned from query");
  return { sessionId, text };
}

async function cleanup() {
  step("CLEANUP — deleting test sessions");
  for (const id of sessionsToCleanup) {
    try {
      await deleteSession(id, { dir: CWD });
      info(`Deleted session ${id.slice(0, 8)}...`);
    } catch {
      info(`Could not delete session ${id.slice(0, 8)}... (may already be gone)`);
    }
  }
}

// ── Test runner ──────────────────────────────────────────────────────

async function main() {
  console.log("\n🪶  Woodpecker Session Forking — Integration Test\n");

  let originalSessionId: string;
  let forkId: string;
  let branchAId: string;
  let branchBId: string;

  try {
    // ── Step 1: Create initial session ────────────────────────────
    step("1/5  Create initial session");
    info("Sending query...");

    const result = await runQuery({
      prompt:
        'Reply with exactly: "WOODPECKER_TEST_ALPHA". Nothing else. No explanation, no quotes.',
    });

    originalSessionId = result.sessionId;
    sessionsToCleanup.push(originalSessionId);

    assert(!!originalSessionId, `Got session ID: ${originalSessionId.slice(0, 8)}...`);
    assert(
      result.text.includes("WOODPECKER_TEST_ALPHA"),
      `Response contains WOODPECKER_TEST_ALPHA`
    );

    // ── Step 2: Fork the session ──────────────────────────────────
    step("2/5  Fork the session (pure JSONL copy, no API call)");

    const forkResult = await forkSession(originalSessionId, { dir: CWD });
    forkId = forkResult.sessionId;
    sessionsToCleanup.push(forkId);

    assert(!!forkId, `Fork created: ${forkId.slice(0, 8)}...`);
    assert(forkId !== originalSessionId, "Fork ID differs from original");

    const forkInfo = await getSessionInfo(forkId, { dir: CWD });
    assert(!!forkInfo, "Fork is discoverable via getSessionInfo");

    // ── Step 3: Create two branches from the same fork ────────────
    step("3/5  Create two independent branches from the same fork");

    info("Branch A — sending query with resume + forkSession...");
    const branchA = await runQuery({
      prompt:
        'Reply with exactly: "WOODPECKER_TEST_BRANCH_A". Nothing else. No explanation, no quotes.',
      resume: forkId,
      forkSession: true,
    });
    branchAId = branchA.sessionId;
    sessionsToCleanup.push(branchAId);

    assert(branchAId !== forkId, `Branch A session: ${branchAId.slice(0, 8)}... (differs from fork)`);
    assert(branchAId !== originalSessionId, "Branch A differs from original");
    assert(
      branchA.text.includes("WOODPECKER_TEST_BRANCH_A"),
      "Branch A response contains WOODPECKER_TEST_BRANCH_A"
    );

    info("Branch B — sending query with resume + forkSession (same fork point)...");
    const branchB = await runQuery({
      prompt:
        'Reply with exactly: "WOODPECKER_TEST_BRANCH_B". Nothing else. No explanation, no quotes.',
      resume: forkId,
      forkSession: true,
    });
    branchBId = branchB.sessionId;
    sessionsToCleanup.push(branchBId);

    assert(branchBId !== forkId, `Branch B session: ${branchBId.slice(0, 8)}... (differs from fork)`);
    assert(branchBId !== branchAId, "Branch B differs from Branch A");
    assert(
      branchB.text.includes("WOODPECKER_TEST_BRANCH_B"),
      "Branch B response contains WOODPECKER_TEST_BRANCH_B"
    );

    // ── Step 4: Verify branch isolation ───────────────────────────
    step("4/5  Verify branch isolation");

    const messagesA = await getSessionMessages(branchAId, { dir: CWD });
    const messagesB = await getSessionMessages(branchBId, { dir: CWD });

    const textA = messagesA.map((m: any) => JSON.stringify(m.message)).join(" ");
    const textB = messagesB.map((m: any) => JSON.stringify(m.message)).join(" ");

    assert(textA.includes("WOODPECKER_TEST_ALPHA"), "Branch A has original context (ALPHA)");
    assert(textA.includes("WOODPECKER_TEST_BRANCH_A"), "Branch A has its own content (BRANCH_A)");
    assert(!textA.includes("WOODPECKER_TEST_BRANCH_B"), "Branch A does NOT have Branch B content");
    info(`Branch A: ${messagesA.length} messages`);

    assert(textB.includes("WOODPECKER_TEST_ALPHA"), "Branch B has original context (ALPHA)");
    assert(textB.includes("WOODPECKER_TEST_BRANCH_B"), "Branch B has its own content (BRANCH_B)");
    assert(!textB.includes("WOODPECKER_TEST_BRANCH_A"), "Branch B does NOT have Branch A content");
    info(`Branch B: ${messagesB.length} messages`);

    // ── Step 5: Fork immutability ─────────────────────────────────
    step("5/5  Verify fork point is immutable");

    const forkMessages = await getSessionMessages(forkId, { dir: CWD });
    const forkText = forkMessages.map((m: any) => JSON.stringify(m.message)).join(" ");

    assert(forkText.includes("WOODPECKER_TEST_ALPHA"), "Fork has original context");
    assert(!forkText.includes("WOODPECKER_TEST_BRANCH_A"), "Fork does NOT have Branch A content");
    assert(!forkText.includes("WOODPECKER_TEST_BRANCH_B"), "Fork does NOT have Branch B content");
    info(`Fork: ${forkMessages.length} messages (unchanged)`);

    // ── Done ──────────────────────────────────────────────────────
    console.log(`\n${"━".repeat(60)}`);
    console.log("  🎉  All tests passed!");
    console.log(`${"━".repeat(60)}\n`);
  } catch (err) {
    console.error("\n💥  Test failed:", err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main();
