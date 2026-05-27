# Key Technical Decisions

This document records important technical decisions made during the development of the Woodpecker project.

_Last reviewed: 2026-05-27. Decisions tied to the original handwriting-recognition architecture have been moved to [Superseded decisions](#superseded-decisions) below._

---

## 1. Framework Choices

**Decision**: Next.js 15 with App Router, tldraw for the canvas, Tailwind CSS v4, TypeScript

**Date**: January 2025

**Context**:

- Building a modern web app with a flexible drawing/sketching surface

**Decision Details**:

- **Next.js 15**: App Router, React 19 support
- **tldraw 3**: powerful, extensible canvas with built-in tools
- **Tailwind CSS v4** + shadcn/ui ("new-york") for styling
- **TypeScript** throughout

**Implications**:

- Modern development experience and extensive customization
- The canvas (`components/tldraw-canvas.tsx`) is the heart of the app

---

## 2. Text Extraction via Claude Vision

**Decision**: Extract handwritten text by sending the captured canvas region to Claude as an image (vision OCR), via the Claude Agent SDK

**Date**: April 2026 (supersedes the original MyScript handwriting-recognition architecture)

**Context**:

- The original real-time stroke recognition (MyScript / `iink-ts`) was dropped — it required a paid, account-bound cloud service, incompatible with the self-hosted goal
- We still need to turn handwriting into text for the AI, but only at the moment of an explicit magic-pen action, not continuously

**Decision Details**:

- The magic pen captures the circled region of the canvas as a PNG
- `app/api/extract-text` sends that image to Claude via the Claude Agent SDK with a single instruction: "Extract only the handwritten text visible in this image."
- Recognition therefore happens on-demand (one shot per action), not as a live stream

**Alternatives Considered**:

- MyScript `iink-ts` WebSocket recognition (dropped — paid/account-required, see [Superseded](#superseded-decisions))
- Browser-based OCR / TensorFlow.js (rejected: accuracy)

**Implications**:

- No separate handwriting-recognition service to run or pay for
- Image-based OCR is good enough because it only runs on a deliberately-circled region
- Requires an internet connection (Claude) at action time

---

## 3. Magic Pen as the Explicit AI Trigger

**Decision**: AI interactions are triggered solely by the magic pen tool — circle a region to send it to the AI. No automatic/continuous intent detection.

**Date**: April 2026 (supersedes the earlier "magic wand + automatic detection" model)

**Context**:

- The original design layered automatic intent detection on top of continuous handwriting recognition; with that recognition removed, automatic triggering no longer applies
- An explicit, deliberate gesture also fits the Woodpecker philosophy: technology is *summoned*, not always listening

**Decision Details**:

- The magic pen is a proper, independent tldraw tool (brain icon, native blue highlight when active)
- Circling a region (see `lib/gesture-detection.ts`) captures all enclosed shapes
- The captured image flows through text extraction (Decision 2) and then the AI (Decision 4), returning an action card on the canvas
- The magic-pen stroke is deleted immediately on trigger (it's a gesture, not content)

**Implications**:

- A single, predictable path to invoke the AI — no false triggers
- Works with non-text content (diagrams, sketches) since it's image-based

---

## 4. AI Integration via the Claude Agent SDK

**Decision**: Use the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) for both text extraction and the action/decision step

**Date**: April 2026 (supersedes the earlier Groq/Llama integration)

**Context**:

- Need a single, capable provider for vision OCR and for reasoning/acting on the captured request
- With Claude Max, auth comes from the local CLI — no API key to manage; otherwise `ANTHROPIC_API_KEY`

**Decision Details**:

- `app/api/extract-text` — image → text (vision)
- `app/api/claude-code` — runs the agent against `CLAUDE_CODE_WORKING_DIR` to act on the request
- Responses render back onto the canvas as cards

**Alternatives Considered**:

- Groq + Llama models (the original choice; replaced by Claude for unified vision + agentic capability)

**Implications**:

- One provider, one auth story
- The agent can operate on a working directory, so guard the auth token (see README security note)

---

## 5. State Persistence

**Decision**: localStorage for canvas auto-save; SQLite (`better-sqlite3`) for session history

**Date**: January 2025 (updated April 2026)

**Decision Details**:

- Canvas document state auto-saves to localStorage (immediate on draw, debounced otherwise)
- Each route uses an independent `storageKey` so `/` and `/v2` canvases don't collide
- Session/conversation history is stored in a local SQLite database (`.woodpecker-sessions.db`), see `lib/session-db.ts`
- No user accounts or cloud sync

**Implications**:

- Work persists locally only; no cross-device sync (yet)
- Simple, private, single-user

---

## 6. Themed Canvas Variant (`/v2`)

**Decision**: Offer a themed variant of the interactive canvas at `/v2` (currently the **Neon Grid** dark theme) by threading a `WoodpeckerCanvasTheme` through the component tree, leaving `/` untouched

**Date**: April 2026

**Context**:

- Wanted a polished, distraction-free dark look (good for e-ink / iPad) without forking the canvas

**Decision Details**:

- A `WoodpeckerCanvasTheme` is passed as an optional prop; absent = original `/` rendering (backward compatible)
- `/v2` uses `createNeonGridTheme("dark")` (`lib/woodpecker-theme.ts`): dark background (`#0a0a14`), Orbitron / Share Tech Mono fonts, styled response cards
- Independent `storageKey` keeps `/v2` canvas state separate from `/`
- `createMossBarkTheme()` (an earlier exploration) remains in `lib/woodpecker-theme.ts` but is not the active `/v2` theme

**Alternatives Considered**:

- Forking `TldrawCanvas` (rejected: duplication)
- Replacing `/` (rejected: keep the original for comparison)

**Implications**:

- Both `/` and `/v2` are fully functional; new themes = new `WoodpeckerCanvasTheme` implementations
- No change to the serialized canvas data format

---

## 7. Session Forking via Fork-Per-Bubble

**Decision**: Use the SDK's `forkSession()` to create immutable fork points on every AI response, enabling spatial branching from any historical bubble

**Date**: April 2026

**Context**:

- The canvas is spatial — users expect to circle any past response and fork a new conversation from that point
- Previously `claudeSessionId` lived on the last shape only; circling an old response resumed with ALL subsequent context

**Decision Details**:

- After each query completes, call `forkSession(sessionId, { dir: cwd })` to snapshot (pure JSONL copy — no API call, no tokens)
- Store `forkSessionId` on ALL response shapes; store `claudeSessionId` on the LAST shape only (for replay)
- When resuming, use `options.resume = forkSessionId` + `options.forkSession = true` so the fork stays immutable
- Session resolution lives in shape props (source of truth); the API route is a pass-through

**Alternatives Considered**:

- `query()` with `maxTurns: 0` to clone (rejected: wasteful API call)
- Fork IDs on last shape only (rejected: can't fork from intermediate bubbles)

**Implications**:

- Shapes without `forkSessionId` fall back to `claudeSessionId` (backward compatible, degraded)
- When multiple bubbles are circled, the most recent (highest y) is used

---

## 8. Email, Teams & Chat Integration (OAuth)

**Decision**: OAuth-based Gmail/Outlook/Teams integration with read-only + reply-only scopes and encrypted local token storage

**Date**: March 2026

**Status**: Auth scaffolding present (`app/api/auth/{google,microsoft,status}`, `/settings`); the original SmartAction handlers were folded into the agent flow.

**Decision Details**:

- **Scopes intentionally restricted**: Google `gmail.readonly` + `gmail.send` (no `gmail.modify`); Microsoft `Mail.Read` + `Mail.Send` + `Chat.Read` + `ChatMessage.Send` (no `Mail.ReadWrite`) — can't delete even if code has bugs
- **Token storage**: local AES-256-GCM-encrypted JSON, no cloud DB (`WOODPECKER_TOKEN_PATH`, `WOODPECKER_ENCRYPTION_KEY`); tokens auto-refresh
- **Connection flow**: one-time consent via the `/settings` page

**Alternatives Considered**:

- IMAP/SMTP directly (rejected: no Teams, harder auth)
- Full email client (rejected: over-engineered for a distraction-free tool)

**Implications**:

- Requires Google Cloud Console and Azure AD app registrations for credentials (not part of the minimal `.env.example`)
- Safety guardrails enforced at the OAuth-scope level

---

## Superseded decisions

These reflect earlier choices that are no longer active. They're kept for historical context.

### Handwriting recognition via MyScript / `iink-ts` _(superseded April 2026)_

The web app originally used MyScript `iink-ts` over a WebSocket for real-time, stroke-based cloud recognition, with native MyScript SDKs planned for offline mobile. **Dropped** because it required a paid, account-bound service, incompatible with the self-hosted goal. Replaced by on-demand Claude vision OCR (Decision 2). The `lib/iink-*.ts` and `lib/handwriting-context-manager-v2.ts` files remain in the tree but are dormant and not imported by `app`/`components`; the `NEXT_PUBLIC_MYSCRIPT_*` env vars are unused.

### Debounced contextual intent detection _(superseded April 2026)_

Because recognition was continuous, the app tried to *automatically* detect when a user expected an AI response — 1000ms debounce, temporal/spatial context, ~70% confidence threshold, with a lowered-threshold "chat mode". This is gone: the magic pen is now the single explicit trigger (Decision 3).

### WebSocket SSR stroke-accumulation handling _(moot)_

MyScript's WebSocket SSR accumulated all strokes per session and re-returned recognition for everything, so we tracked/diffed "last recognized text" to extract only new writing (`extractNewText()` etc.). Moot now that recognition is a single-shot image OCR per action rather than a persistent stroke session.

### AI provider: Groq / Llama _(superseded April 2026)_

The original LLM provider was Groq (`llama-3.3-70b-versatile` for text, `llama-4-scout-17b-16e-instruct` for vision). Replaced by the Claude Agent SDK (Decision 4) for unified vision + agentic capability. No Groq dependency remains.

### Handwritten-font AI responses (Kalam/Caveat, typewriter) _(partially superseded)_

AI responses were originally rendered in handwriting fonts (Kalam/Caveat) with a typewriter animation to match the notepad aesthetic. The `handwritten-text` tldraw shape still exists, but themed variants (e.g. `/v2`'s Neon Grid) now render responses as styled cards with theme fonts (Orbitron / Share Tech Mono) rather than the handwriting look.
