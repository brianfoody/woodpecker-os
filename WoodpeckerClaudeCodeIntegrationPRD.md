# Refactor Woodpecker OS: Claude Code as the AI backbone

## Context

Woodpecker OS is a Next.js 15 tldraw canvas app with handwriting recognition and a magic wand gesture system. Currently uses Groq (LLaMA) with a bespoke intent-detection system routing to 10 action types, each with its own API route.

**Goal:** Replace Groq with the Claude Agent SDK — following the same pattern as [claude-code-telegram](https://github.com/RichardAtCT/claude-code-telegram). Claude Code naturally understands intent, so the entire action-routing system collapses into: circle content → send to Claude Code → render response. Paper aesthetic and circle-to-send gesture stay.

**Deployment:** Next.js runs on the user's desktop (`0.0.0.0:3000`), user interacts on iPad over LAN. Single-user, local-only — never hosted on Vercel or any cloud provider.

---

## Architecture

```
iPad browser                     Desktop (user's machine)
┌──────────────┐                ┌──────────────────────────────┐
│ tldraw canvas │──HTTP/SSE────▶│ Next.js (0.0.0.0:3000)       │
│ circle & send │◀─────────────│                                │
└──────────────┘                │  POST /api/claude-code        │
                                │    ↓ auth token check         │
                                │    ↓ ToolMonitor validation   │
                                │  @anthropic-ai/claude-agent-sdk│
                                │    ↓ (subprocess)             │
                                │  Claude Code CLI              │
                                │    ↓                          │
                                │  user's filesystem,           │
                                │  projects, tools              │
                                └──────────────────────────────┘
```

### Key architectural decisions vs. the original plan

1. **SDK is `@anthropic-ai/claude-agent-sdk`**, not `@anthropic-ai/claude-code` (renamed Sept 2025; the old package has a broken `sdk.mjs` entry point in published versions).
2. **`query()` returns an `AsyncGenerator<SDKMessage>`**, not a callback-based interface. Streaming is done via `for await (const msg of query({...}))`, filtering for `stream_event` messages.
3. **Session IDs come from Claude's response**, not generated client-side. The canvas stores the Claude-returned session ID for multi-turn, not a pre-assigned UUID.
4. **Auth token required on every request.** `0.0.0.0` binding exposes the endpoint to the entire LAN — and to any malicious website visited on any LAN device (CSRF via `fetch()` to local IPs). A shared secret header closes this.
5. **ToolMonitor validation layer** sits between the API route and the SDK, following the claude-code-telegram pattern. This is independent of and in addition to the SDK's `allowedTools`.

---

## Implementation Plan

### Phase 1: Security & SDK integration layer

#### 1.1 Install SDK

```bash
npm install @anthropic-ai/claude-agent-sdk
```

#### 1.2 Create `lib/claude-code.ts`

Thin wrapper around the SDK. Mirrors the facade pattern from claude-code-telegram but adapted for the AsyncGenerator API:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export interface ClaudeResponse {
  content: string;
  sessionId: string;
  cost?: number;
  toolsUsed: string[];
  isError: boolean;
}

export type StreamEvent = {
  type: "text_delta" | "tool_use" | "tool_result" | "question" | "error" | "done";
  content?: string;
  toolName?: string;
  sessionId?: string;
};

export async function* runClaudeCode(opts: {
  prompt: string;
  cwd?: string;
  sessionId?: string;
}): AsyncGenerator<StreamEvent> {
  const options: Record<string, unknown> = {
    cwd: opts.cwd || process.env.CLAUDE_CODE_WORKING_DIR || process.cwd(),
    allowedTools: ["Read", "Glob", "Grep"],  // Safe tools only — see §1.3
    permissionMode: "default",
    maxTurns: 10,
    includePartialMessages: true,
  };

  if (opts.sessionId) {
    options.sessionId = opts.sessionId;
    options.resume = opts.sessionId;
  }

  try {
    for await (const message of query({ prompt: opts.prompt, options })) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield { type: "text_delta", content: event.delta.text };
        }
      }
      // Tool use events
      if (message.type === "tool_use") {
        yield { type: "tool_use", toolName: message.name };
      }
      if (message.type === "tool_result") {
        yield { type: "tool_result", content: message.content };
      }
      // Extract session ID from result
      if (message.type === "result") {
        yield {
          type: "done",
          content: message.content,
          sessionId: message.sessionId, // Store this for multi-turn
        };
      }
    }
  } catch (error) {
    // If session resume fails, fall back to new session (auto-recovery)
    if (opts.sessionId && error instanceof Error && error.message.includes("session")) {
      yield* runClaudeCode({ ...opts, sessionId: undefined });
    } else {
      yield { type: "error", content: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}
```

> **Note on `query()` types:** The exact message type structure should be verified against the installed SDK version. The above is based on the v0.2.x API surface — field names may shift in later releases. Run `npx tsc --noEmit` after install to catch any drift.

#### 1.3 Tool allowlist — start conservative

The original plan pre-approves `Bash`, `Edit`, and `Write`. **Don't do this for MVP.**

| Tool    | MVP | Post-MVP | Risk |
|---------|-----|----------|------|
| Read    | ✅  | ✅       | Low — read-only |
| Glob    | ✅  | ✅       | Low — file listing |
| Grep    | ✅  | ✅       | Low — search |
| Bash    | ❌  | ✅ (with ToolMonitor) | High — arbitrary command execution |
| Edit    | ❌  | ✅ (with path validation) | Medium — can modify any file |
| Write   | ❌  | ✅ (with path validation) | Medium — can create any file |

For MVP, Claude can answer questions, read code, and search — but can't execute commands or modify files. This covers the core Woodpecker use case (circle a question → get a thoughtful response). Bash/Edit/Write get unlocked in Phase 6 behind the ToolMonitor.

#### 1.4 Create `lib/auth.ts`

Simple shared-secret auth for LAN security:

```typescript
export function validateRequest(request: Request): boolean {
  const token = request.headers.get("X-Woodpecker-Token");
  return token === process.env.WOODPECKER_AUTH_TOKEN;
}
```

The iPad client includes this header on every fetch. The token is generated once at setup (`openssl rand -hex 32`) and stored in `.env`.

#### 1.5 Create `lib/claude-code-session.ts`

Server-side session storage (not localStorage — session IDs come from Claude's response and must be available to the API route):

```typescript
// In-memory for single-user local deployment.
// Maps a canvas context key → Claude session ID.
const sessions = new Map<string, string>();

export function saveSession(canvasKey: string, sessionId: string) {
  sessions.set(canvasKey, sessionId);
}

export function getSession(canvasKey: string): string | undefined {
  return sessions.get(canvasKey);
}

export function clearSession(canvasKey: string) {
  sessions.delete(canvasKey);
}
```

The client sends a `canvasKey` (e.g. a shape ID or "default") — the server maps it to the Claude session ID returned by the SDK. This avoids exposing Claude session internals to the browser.

#### 1.6 Add to `.env.example`

```
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_CODE_WORKING_DIR=/path/to/project
WOODPECKER_AUTH_TOKEN=<generate with: openssl rand -hex 32>
```

---

### Phase 2: API route

#### 2.1 Create `app/api/claude-code/route.ts`

Single POST route that streams Claude Code responses via SSE. Uses the non-blocking `ReadableStream` pattern — Next.js buffers the response if you `await` inside `start()`.

```typescript
import { validateRequest } from "@/lib/auth";
import { runClaudeCode } from "@/lib/claude-code";
import { getSession, saveSession } from "@/lib/claude-code-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validateRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { prompt, canvasKey } = await request.json();
  const sessionId = canvasKey ? getSession(canvasKey) : undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      (async () => {
        try {
          for await (const event of runClaudeCode({ prompt, sessionId })) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
            // Persist session ID for multi-turn
            if (event.type === "done" && event.sessionId && canvasKey) {
              saveSession(canvasKey, event.sessionId);
            }
          }
          controller.close();
        } catch (e) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", content: String(e) })}\n\n`)
          );
          controller.close();
        }
      })(); // Fire-and-forget — returns immediately so Next.js doesn't buffer
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

#### 2.2 Update `next.config.js`

```javascript
const nextConfig = {
  compress: false, // Prevents compression buffering on SSE streams
  // No serverExternalPackages needed — claude-agent-sdk runs as subprocess
};
```

#### 2.3 Client-side auth

The iPad client must include the auth token on every request. Create `lib/api-client.ts`:

```typescript
export function claudeCodeFetch(prompt: string, canvasKey?: string) {
  return fetch("/api/claude-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Woodpecker-Token": process.env.NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN!,
    },
    body: JSON.stringify({ prompt, canvasKey }),
  });
}
```

> **Note:** `NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN` is exposed to the browser. This is acceptable for a single-user LAN tool — it prevents drive-by CSRF from external websites but is not a secret from the iPad user (who is the owner). If multi-user support is ever added, switch to session-based auth.

---

### Phase 3: New interaction bubble shape

No changes from the original plan. This is pure tldraw UI work and doesn't touch the SDK.

#### 3.1 Create `lib/shapes/interaction-bubble-shape.ts`

```typescript
export type InteractionBubbleShape = TLBaseShape<
  'interaction-bubble',
  {
    w: number; h: number;
    question: string;
    options: string[];
    selectedOption?: string;
    status: 'pending' | 'answered';
  }
>;
```

#### 3.2 Create `lib/shapes/interaction-bubble-shape-util.tsx`

Paper-styled card with the question in handwriting font and tappable option bubbles. Follows the pattern of `WebsiteBubbleShapeUtil`.

#### 3.3 Create `components/interaction-bubble.tsx`

React component. Emits `onSelect(option)` callback when user taps.

#### 3.4 Update `lib/shapes/index.ts` — export new shape.

---

### Phase 4: Canvas integration

#### 4.1 Create `hooks/use-claude-code.ts`

Hook that:
- Sends prompts to `/api/claude-code` via `claudeCodeFetch()` (includes auth token)
- Reads SSE stream using `EventSource` or manual `ReadableStream` reader
- Creates/updates shapes as events arrive:
  - `text_delta` → accumulate into `HandwrittenTextShape` with typewriter effect (reuse `HandwrittenResponseRenderer`)
  - `tool_use` → small handwritten note: "reading files..." / "searching..."
  - `question` → create `InteractionBubbleShape`
  - `error` → handwritten text in red
- On interaction bubble selection → new fetch to resume session with user's answer
- Passes `canvasKey` (shape ID of the circled content) for session continuity

**First-circle latency:** The SDK spawns a subprocess on first `query()` call, adding ~12 seconds before the first token. For a personal tool this is acceptable, but surface it to the user — show a "waking up..." handwritten note during the initial wait. Subsequent queries in the same session are faster.

> **SSE vs EventSource:** Since this uses POST (not GET), you can't use the browser's native `EventSource`. Use `fetch()` + `response.body.getReader()` to read the stream manually. This is the same pattern the existing handwriting recognition likely uses.

#### 4.2 Simplify `components/tldraw-canvas.tsx`

The big win — the magic wand flow collapses:

**Old (10 branches):**
```
circle → capture → summarise → chooseTask → show action menu → user picks → execute specific handler
```

**New (1 path):**
```
circle → capture text/image → send to Claude Code → render response
```

**Remove:**
- All 10 `execute*` functions (`executeAskAI`, `executeSearch`, `executeSendMessage`, etc.)
- `handleActionSelect` with 10 branches
- `ActionPromptModal` / `AIActionsContextMenu`
- `currentImageSummary`, `currentCapturedImageBlob` action-routing state
- Import of `AIBubbleShapeUtil`

**Keep:**
- Magic wand gesture (`HoldDetector`, `analyzeForSingleLoop`)
- Handwriting recognition (`HandwritingContextManagerV2`)
- `HandwrittenResponseRenderer` for typewriter effect
- `HandwrittenTextShapeUtil`, `MessageBubbleShapeUtil`, `WebsiteBubbleShapeUtil`
- Canvas auto-save, all tldraw config

**Replace `handleMagicWandGesture` core with:**
1. Capture bounded shapes (text extraction + image if drawings present)
2. Build prompt from extracted content
3. Call `useClaudeCode.execute(prompt, canvasKey, position)`
4. Claude Code handles intent naturally — no classification needed

**Add:**
- `InteractionBubbleShapeUtil` to `<Tldraw shapeUtils={[...]}>`
- `useClaudeCode` hook
- Interaction bubble response handler

---

### Phase 5: Remove Groq + clean up

**Remove files:**
- `lib/ai.ts` — Groq AI functions
- `lib/ai-processing.ts` — action processing
- `app/api/ask-ai/route.ts`
- `app/api/detect-intent/route.ts`
- `app/api/confirm-task/route.ts`
- `app/api/summarise-image/route.ts`
- `app/api/search/route.ts`
- `app/api/send-message/route.ts`
- `app/api/extract-message/route.ts`
- `app/api/extract-contact/route.ts`
- `app/api/find-contact/route.ts`
- `app/api/read-contact-messages/route.ts`
- `app/api/read-messages/route.ts`
- `app/api/emails/read/route.ts`, `summarize/route.ts`, `reply/route.ts`
- `app/api/teams/read/route.ts`, `summarize/route.ts`, `reply/route.ts`
- `components/action-prompt-modal.tsx`

**Keep:**
- `app/api/auth/*` — OAuth flows still needed
- `lib/gmail-client.ts`, `lib/teams-client.ts`, `lib/token-storage.ts` — will become MCP tools later
- `app/api/create-website/*` — keep for now

**Update `package.json`:**
- Remove `groq-sdk`
- Add `@anthropic-ai/claude-agent-sdk`

---

### Phase 6: ToolMonitor — unlock Bash/Edit/Write

Once the core flow is working with read-only tools, add a validation layer to safely enable write operations. This follows the claude-code-telegram ToolMonitor pattern.

#### 6.1 Create `lib/tool-monitor.ts`

```typescript
const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Bash", "Edit", "Write"];

// Directories Claude is allowed to read/write within
const APPROVED_DIRECTORIES = [
  process.env.CLAUDE_CODE_WORKING_DIR,
].filter(Boolean) as string[];

// Bash commands that are never allowed
const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+\//, // rm -rf /
  /\bcurl\b.*\|.*\bsh\b/, // curl | sh
  /\bsudo\b/, // any sudo
  /\bchmod\b/, // permission changes
  /\bchown\b/, // ownership changes
  /\bnc\b.*-[le]/, // netcat listeners
];

export function validateToolUse(toolName: string, args: Record<string, unknown>): {
  allowed: boolean;
  reason?: string;
} {
  if (!ALLOWED_TOOLS.includes(toolName)) {
    return { allowed: false, reason: `Tool "${toolName}" not in allowlist` };
  }

  // Path validation for file operations
  if (["Read", "Edit", "Write"].includes(toolName) && args.path) {
    const resolvedPath = require("path").resolve(String(args.path));
    const inApproved = APPROVED_DIRECTORIES.some(dir => resolvedPath.startsWith(dir));
    if (!inApproved) {
      return { allowed: false, reason: `Path "${args.path}" outside approved directories` };
    }
  }

  // Bash command validation
  if (toolName === "Bash" && args.command) {
    const cmd = String(args.command);
    for (const pattern of BLOCKED_COMMANDS) {
      if (pattern.test(cmd)) {
        return { allowed: false, reason: `Blocked command pattern: ${pattern}` };
      }
    }
  }

  return { allowed: true };
}
```

#### 6.2 Integrate with `lib/claude-code.ts`

Once the ToolMonitor is in place, update the `allowedTools` in `runClaudeCode()`:

```typescript
allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write"],
```

And add a PreToolUse hook (if the SDK version supports it) or validate tool calls in the stream processing loop.

#### 6.3 Add cost/rate controls

Following claude-code-telegram's multi-layered approach:

```typescript
// In runClaudeCode options:
maxTurns: 10,              // Prevent runaway loops
// maxBudgetUsd: 1.0,      // Per-request cost cap (if SDK supports)
```

---

### Phase 7 (future): MCP tools for email/SMS/search

Not needed for MVP. Claude Code handles coding and knowledge tasks natively. Email/Teams/SMS/search capabilities can be added later as MCP servers that reuse the existing client code in `lib/`. The MCP config would be passed to Claude Code via the SDK options — same approach as claude-code-telegram's JSON config file.

---

## Files summary

### New files

| File | Purpose |
|------|---------|
| `lib/claude-code.ts` | SDK wrapper (AsyncGenerator pattern) |
| `lib/claude-code-session.ts` | Server-side session storage (in-memory Map) |
| `lib/auth.ts` | Shared-secret request validation |
| `lib/api-client.ts` | Client-side fetch helper with auth header |
| `app/api/claude-code/route.ts` | SSE streaming API route |
| `lib/shapes/interaction-bubble-shape.ts` | Shape type |
| `lib/shapes/interaction-bubble-shape-util.tsx` | Shape renderer |
| `components/interaction-bubble.tsx` | Bubble React component |
| `hooks/use-claude-code.ts` | Streaming hook |
| `lib/tool-monitor.ts` | Tool validation layer (Phase 6) |

### Modified files

| File | Change |
|------|--------|
| `components/tldraw-canvas.tsx` | Replace 10-branch action routing with single Claude Code path |
| `lib/shapes/index.ts` | Export interaction bubble |
| `lib/models.ts` | Remove `SmartAction`/`SmartTask`, add stream event types |
| `package.json` | Swap `groq-sdk` for `@anthropic-ai/claude-agent-sdk` |
| `next.config.js` | Add `compress: false` for SSE |
| `.env.example` | Add `ANTHROPIC_API_KEY`, `CLAUDE_CODE_WORKING_DIR`, `WOODPECKER_AUTH_TOKEN` |

### Removed files

| Files | Reason |
|-------|--------|
| `lib/ai.ts`, `lib/ai-processing.ts` | Replaced by Claude Code |
| 17 API routes (ask-ai, detect-intent, etc.) | Single `/api/claude-code` replaces all |
| `components/action-prompt-modal.tsx` | No action menu needed |

---

## Process management

Since the SDK spawns a real subprocess per `query()` call, handle lifecycle explicitly:

**Graceful shutdown** — add to `next.config.js` or a custom server:

```typescript
process.on("SIGTERM", () => {
  // Kill any spawned Claude processes in our process group
  process.kill(-process.pid, "SIGTERM");
  process.exit(0);
});
```

**Client disconnect** — in the API route, listen for the request abort signal:

```typescript
request.signal.addEventListener("abort", () => {
  // Cancel the running query if the iPad disconnects
  // (exact mechanism depends on SDK version — may need to kill subprocess)
});
```

**Disk cleanup** — Claude Code stores session transcripts at `~/.claude/projects/` and temp files as `tmpclaude-*`. For a personal desktop tool, periodic manual cleanup is fine. If it becomes an issue, add a cron or startup script.

---

## User setup

1. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Generate auth token: `openssl rand -hex 32`
3. Configure `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   CLAUDE_CODE_WORKING_DIR=/path/to/project
   WOODPECKER_AUTH_TOKEN=<token from step 2>
   NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN=<same token>
   ```
4. `npm run dev` — consider adding `-H 0.0.0.0` to expose on LAN
5. On iPad, open `http://<desktop-ip>:3000`

---

## Verification

1. **Canvas loads** — `npm run dev` on desktop, open on iPad. Handwriting works, paper aesthetic intact.
2. **Basic Q&A** — Write "what is a woodpecker's tongue like?" → circle → handwritten response streams in with typewriter effect.
3. **Read-only code tasks** — Write "what does the handleMagicWandGesture function do?" → circle → Claude reads the codebase and responds.
4. **Auth enforcement** — `curl -X POST http://localhost:3000/api/claude-code -d '{"prompt":"hello"}'` returns 401. Same with auth header returns 200.
5. **Multi-turn** — Circle previous response + write follow-up → session resumes, Claude has context from the prior turn.
6. **Interaction bubbles** — Claude asks a question → interaction bubble appears → tap option → conversation continues.
7. **Error recovery** — Kill the Claude subprocess mid-stream → error text appears in handwriting → next circle starts a fresh session.
8. **Phase 6 gate** — Write "create a file called test.txt" → Claude responds that file operations aren't enabled yet (until ToolMonitor is active).
