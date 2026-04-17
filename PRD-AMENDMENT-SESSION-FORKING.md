# PRD Amendment: Session forking via response bubbles

**Amends:** Woodpecker OS Claude Code Refactor PRD
**Scope:** Replaces the session management approach in Phase 1.5 (`lib/claude-code-session.ts`) and modifies the response rendering in Phase 4.
**Assumes:** Phases 1–5 of the base PRD are implemented and working. The magic wand gesture triggers Claude Code, responses stream in via SSE, and linear multi-turn works via session resume.

---

## Problem

The current implementation stores a single session ID per canvas context key in a server-side Map. Multi-turn works linearly — each new circle resumes the latest session state. But the canvas is spatial, not linear. When a user circles an older response bubble and writes a new question, they expect to fork from that point in the conversation, excluding any exchanges that happened after it.

The screenshot below illustrates the problem. The user should be able to circle "Done! You're now on feature/zustand-state-management" and write "What tests exist?" — and that new branch should have no knowledge of the "Let me review the changes" exchange that followed.

---

## Design: fork-per-bubble

Every response bubble becomes a fork point. Circling any bubble creates a new conversation branch from that exact moment in history.

### Shape prop changes

Add `forkSessionId` and `cwd` to the response bubble shape props:

```typescript
// Existing response bubble shape — add these props:
{
  // ... existing props (w, h, content, status, etc.)
  forkSessionId: string;      // Session snapshot at this bubble's point in time
  parentBubbleId?: string;    // The bubble this response follows (for visual threading)
  cwd: string;                // Working directory for this conversation branch
}
```

`forkSessionId` is the session ID that captures conversation history up to and including this response, but nothing after it. It is immutable once set — future exchanges in the same linear thread don't modify it.

### How fork IDs get created

After each Claude response completes and the `done` event arrives with a `sessionId`, the server creates a fork of that session. The fork is a zero-cost JSONL file copy — no API call, no tokens spent.

```
Response completes → live session S1 has messages [1..N]
                   → server forks S1 → fork F1 is a snapshot of S1 at message N
                   → bubble stores forkSessionId = F1
                   → if user continues linearly, S1 grows to [1..N+2]
                   → F1 remains frozen at [1..N]
```

When the user later circles this bubble with new handwriting, the API calls `query()` with `resume: F1, forkSession: true`. This creates a brand new session branching from F1's frozen history. The original F1 is never mutated.

### How circling detects the fork target

In `handleMagicWandGesture`, after extracting handwritten text from the circled shapes:

```typescript
// Check if any response bubbles are inside the circle
const circledBubble = circledShapeIds
  .map(id => editor.getShape(id))
  .find(shape =>
    shape?.type === "response-bubble" &&
    shape.props.status === "complete" &&
    shape.props.forkSessionId
  );

if (circledBubble) {
  // Fork from this bubble's frozen session
  execute({
    prompt: handwrittenText,
    resumeSessionId: circledBubble.props.forkSessionId,
    parentBubbleId: circledBubble.id,
    cwd: circledBubble.props.cwd,
    position: { x: ..., y: ... },
  });
} else {
  // No bubble circled — start a fresh session
  execute({
    prompt: handwrittenText,
    position: { x: ..., y: ... },
  });
}
```

---

## Implementation

### 1. Update `lib/claude-code.ts`

Add a `createForkPoint` function and modify `runClaudeCode` to yield the fork ID alongside the result.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Add to StreamEvent type:
export type StreamEvent = {
  type: "text_delta" | "tool_use" | "tool_result" | "error" | "done";
  content?: string;
  toolName?: string;
  sessionId?: string;
  forkSessionId?: string;   // NEW — the frozen fork for bubble storage
};
```

In `runClaudeCode`, change the session resume logic:

```typescript
export async function* runClaudeCode(opts: {
  prompt: string;
  cwd?: string;
  resumeSessionId?: string;  // CHANGED — was `sessionId`
}): AsyncGenerator<StreamEvent> {

  // ...existing options setup...

  if (opts.resumeSessionId) {
    options.resume = opts.resumeSessionId;
    options.forkSession = true;   // NEW — always fork, never mutate the source
  }

  // ...existing streaming loop...

  // In the result handler, after extracting sessionId:
  if (message.type === "result") {
    const resultSessionId = message.session_id;

    // Create a frozen fork for this bubble
    let forkId: string | undefined;
    try {
      forkId = await createForkPoint(resultSessionId, cwd);
    } catch {
      forkId = resultSessionId; // Fallback: store live ID, fork on-demand later
    }

    yield {
      type: "done",
      content: extractTextContent(message),
      sessionId: resultSessionId,
      forkSessionId: forkId,
    };
  }
}
```

The `createForkPoint` function:

```typescript
async function createForkPoint(sessionId: string, cwd: string): Promise<string> {
  let forkId: string | undefined;

  for await (const msg of query({
    prompt: "",
    options: {
      cwd,
      resume: sessionId,
      forkSession: true,
      maxTurns: 0,
    },
  })) {
    if (msg.type === "system" && msg.subtype === "init") {
      forkId = msg.session_id;
    }
    if (msg.type === "result" && msg.session_id) {
      forkId = msg.session_id;
    }
  }

  if (!forkId) throw new Error("Fork produced no session ID");
  return forkId;
}
```

> **If `maxTurns: 0` doesn't produce a session:** Fall back to `maxTurns: 1` with a trivial prompt. The goal is just to get a session file on disk. Verify against the installed SDK version.

### 2. Update `app/api/claude-code/route.ts`

Change the request body to accept `resumeSessionId` instead of `canvasKey`:

```typescript
const { prompt, resumeSessionId, cwd } = await request.json();
```

Remove the `getSession`/`saveSession` calls. The server no longer maintains a session map — session IDs live on bubble shape props and travel through the API request/response.

### 3. Update `hooks/use-claude-code.ts`

When handling the `done` event, store `forkSessionId` on the bubble shape:

```typescript
case "done":
  editor.updateShape({
    id: bubbleId,
    type: "response-bubble",
    props: {
      content: event.content || fullContent,
      forkSessionId: event.forkSessionId,  // Frozen fork for future branching
      status: "complete",
    },
  });
  break;
```

When calling `execute`, accept and forward the fork context:

```typescript
async function execute(opts: {
  prompt: string;
  resumeSessionId?: string;   // From the circled bubble's forkSessionId prop
  parentBubbleId?: string;     // For visual threading
  cwd?: string;
  position: { x: number; y: number };
})
```

### 4. Update `lib/api-client.ts`

```typescript
export function claudeCodeFetch(opts: {
  prompt: string;
  resumeSessionId?: string;   // Was canvasKey
  cwd?: string;
}) {
  return fetch("/api/claude-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Woodpecker-Token": process.env.NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN!,
    },
    body: JSON.stringify(opts),
  });
}
```

### 5. Remove `lib/claude-code-session.ts`

This file is no longer needed. Delete it and remove its imports from the API route.

---

## Lifecycle walkthrough

```
1. User writes "Switch to zustand branch" → circles it
   API: query({ prompt: "Switch to zustand branch" })
   → Session S1 created
   → Claude responds: "I'll switch to the zustand branch..."
   → createForkPoint(S1) → Fork F1
   → Bubble A stores: forkSessionId = F1

2. Claude's multi-turn continues (tool calls, second response)
   → S1 now has more messages
   → Claude responds: "Done! You're now on feature/zustand-state-management"
   → createForkPoint(S1) → Fork F2
   → Bubble B stores: forkSessionId = F2

3. User circles Bubble B + writes "How do the changes look?"
   API: query({ prompt: "How do...", resume: F2, forkSession: true })
   → New session S2 forked from F2
   → Claude has context: branch switch conversation, nothing else
   → Claude responds: "Let me review the changes..."
   → createForkPoint(S2) → Fork F3
   → Bubble C stores: forkSessionId = F3

4. User circles Bubble B AGAIN + writes "What tests exist?"
   API: query({ prompt: "What tests...", resume: F2, forkSession: true })
   → New session S3 forked from F2 (same snapshot as step 3)
   → Claude has NO knowledge of "Let me review the changes"
   → Claude responds: "Let me check the test files..."
   → createForkPoint(S3) → Fork F4
   → Bubble E stores: forkSessionId = F4
```

F2 is frozen. Both branches fork from identical history. The canvas becomes a visible session tree.

---

## Edge cases

**Bubble with no `forkSessionId`:** If `createForkPoint` fails and the fallback stores the live session ID, circling that bubble later does `resume + forkSession: true` at request time. Functionally identical — just means the fork happens on-demand rather than proactively. The only risk is that the live session may have accumulated more messages since the bubble was created, meaning the fork includes context the user didn't expect. This is the degraded path, not the happy path.

**Circling multiple bubbles at once:** If the circle encompasses more than one response bubble, use the most recent one (highest y-position or latest creation time). The handwritten text becomes the new prompt; the selected bubble provides the session context.

**Circling a bubble with no handwriting:** If the user circles only a response bubble with no new text, treat it as "continue this conversation" — resume the bubble's session with an empty or minimal prompt. Claude will ask what the user wants to do next.

**Working directory mismatch:** Sessions are stored under `~/.claude/projects/<encoded-cwd>/`. If a bubble's `cwd` differs from the current canvas directory, the resume must use the bubble's stored `cwd`, not the current one. This is why `cwd` is stored per-bubble.

**Disk accumulation:** Each fork is a few KB JSONL file. A busy day of 50 bubbles produces ~50 fork files. Over months this adds up but stays manageable. Add a cleanup script if needed — delete fork files older than 30 days that aren't referenced by any bubble in the saved canvas.

---

## Verification

All existing verification steps from the base PRD remain valid. Add:

1. **Linear follow-up** — Circle the latest response + write "tell me more" → response has full context.
2. **Branch from old bubble** — Circle an earlier response (not the latest) + write a new question → response has context only up to that bubble, nothing after.
3. **Branch isolation** — Create two branches from the same bubble → each branch is independent, continuing one doesn't affect the other.
4. **Re-fork** — Circle the same bubble a third time → creates yet another independent branch.
5. **Fork persistence** — Restart the dev server → circle an old bubble → fork still works (session files persist on disk, `forkSessionId` persists in tldraw's canvas auto-save).
