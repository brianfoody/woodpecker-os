# Key Technical Decisions

This document records important technical decisions made during the development of the Woodpecker project.

_Last reviewed: 2026-07-08. Decisions tied to the original handwriting-recognition architecture have been moved to [Superseded decisions](#superseded-decisions) below._

---

## 0. Going Live: Local Connector + E2E-Encrypted Relay (woodpeckeros.com)

**Decision**: woodpeckeros.com hosts only the static canvas UI; each user runs a local **connector** (`npx @woodpeckeros/connect`) that executes Claude Code on their own machine with their own Claude login. Browser and connector communicate through a dumb WebSocket **relay** with end-to-end encryption. No user accounts.

**Date**: July 2026

**Context**:

- The original app ran the Claude Agent SDK inside the Next.js server with a shared static token baked into the client bundle — unusable as a public product (arbitrary command execution behind a public token)
- The product ethos is self-hosted: your machine, your files, your Claude Max login, no cloud storage

**Decision Details**:

- **Three artifacts, one repo (npm workspaces)**: the Next.js app (Vercel, fully static, zero API routes), `connector/` (npm package `@woodpeckeros/connect`, bundles the Agent SDK invocation moved verbatim from the old `lib/claude-code.ts`), `relay/` (~200-line Node `ws` server on Fly.io at `relay.woodpeckeros.com`)
- **Shared protocol** in `packages/protocol` — relay frames (join/relay/peer-status) carry only ciphertext; app-layer messages (hello, execute→StreamEvent stream, cancel, extract-text, canvas-save/load, sessions-list, transcript) are AES-256-GCM encrypted (WebCrypto on both sides, zero deps)
- **Pairing**: connector generates a 128-bit channelId + 256-bit key, prints a QR for `https://woodpeckeros.com/pair#<id>.<key>` — the fragment never reaches the server. Re-pair/revoke with `--reset-pairing`. Replay protection via per-sender epoch + monotonic seq
- **No accounts**: all durable state (pairing, config, devices, canvas snapshots) lives in `~/.woodpecker/` on the user's machine; cross-device canvas sync flows through the connector (monotonic rev, last-writer-wins)
- **Guardrails**: every tool call routes through `canUseTool` (connector `guardrails.ts`): read-only + user MCP tools auto-allowed, Edit/Write scoped to the working dir, Bash checked against a destructive-command denylist; denials surface as status events on the canvas. `--yolo` bypasses
- **Relay choice**: plain Node `ws` on Fly.io over Cloudflare DO / Ably / PartyKit (no second toolchain, no per-message pricing, identical server runs locally). WebRTC skipped for v1
- **Local dev**: `woodpecker connect --local` serves plaintext WS on localhost:8787; the canvas auto-connects when running on localhost with no pairing

**Alternatives Considered**:

- Fully hosted per-user sandboxes (Fly Machines / E2B) — rejected: heavy ops, users' own files/MCPs unavailable, needs accounts + billing
- Docs-only self-hosting — rejected: too much friction for "anyone can use it"

**Implications**:

- woodpeckeros.com never sees keys or executes user code; compromise of the relay leaks only ciphertext and presence
- Gmail/Calendar OAuth routes, mirroir hardcoding, the settings page, and the old `/api/*` surface were deleted; users' own MCP config passes through instead
- The web app is fully static — only env var is `NEXT_PUBLIC_RELAY_URL`

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

## 9. Writing-Anchored Reply Layout for the Magic Pen

**Decision**: Anchor the magic pen reply chain (YOU card + AI response) to the user's circled **writing**, and decide loop membership by polygon containment — replacing the card-relative 5-slot positioning table and the bbox-graze capture test

**Date**: July 2026

**Context**:

- Users often write at the edge of an AI card and circle their writing; the reply then appeared far from the handwriting (up to card-width + 685px away)
- Three compounding causes: (1) any shape whose bbox merely grazed the circle's bbox was "captured", so the neighbouring card hijacked the layout anchor; (2) placement then snapped to one of 5 hardcoded slots relative to the whole card (`card.x ± (665 + 20)`); (3) `estimateTextHeight` assumed 500px-wide cards while cards are 665px, inflating every stacking gap ~35%

**Decision Details**:

- Layout math extracted to a pure, unit-tested module: `lib/magic-loop-layout.ts` (`isShapeInLoop`, `rectsIntersect`, `computeReplyLayout`)
- **Capture is split by shape kind**: *ink* (strokes, text, bubbles) is circled only when its center is inside the loop polygon (ray-casting), the loop was drawn ON it, or ≥50% of its area lies in the loop bounds — grazing strokes no longer pollute the anchor bounds. *AI cards* keep generous bbox-overlap capture: circling writing at the edge of a card must still capture the card so its **session resumes** (strict containment here would trade the layout bug for a lost-context bug). Connector arrows and thinking indicators are never captured
- **Placement**: reply is left-aligned with the circled ink (fallback: loop bounds). If the 665px reply column horizontally overlaps the source card it drops below `max(content bottom, card bottom) + 20px` so it can't land on the card; writing *beside* a (possibly tall) card keeps the reply level with the writing instead of pushing it below the card. Branch direction (`under`/`left`/`right`) is *derived* from where the reply lands and only controls connector anchors; the 5-slot table and the `isBodyLevel` knife-edge are gone
- **Collision + visibility**: reply nudges downward past existing cards/bubbles, and the camera pans (`centerOnPoint`) if the final spot is off-viewport
- Layout anchor and session-resume anchor now use the same bottom-most-first card ordering so the connector and the resumed session always agree
- `estimateTextHeight` default width corrected to 665

**Alternatives Considered**:

- Keeping the 5-slot table with better direction detection (rejected: any card-relative slot can still land far from the handwriting)
- Point-in-polygon for every point of every shape (rejected: center + majority-area is enough and cheap)

**Implications**:

- Replies now appear directly under the handwriting; side-branch layouts still emerge naturally when the user writes beside a card
- Circling empty space *near* a card no longer resumes that card's session — the circle must be on the card or around its center
- `lib/__tests__/magic-loop-layout.test.ts` covers capture and placement scenarios

---

## 10. Landing Page: Scoped CSS Design System + Pure-CSS Animation

**Decision**: The marketing landing page (`app/page.tsx`) uses its own scoped design system (`app/landing.css`, all classes prefixed `lp-`) with pure CSS/SVG animation — no animation library, no client JS beyond a tiny IntersectionObserver reveal and the existing pairing-aware CTA.

**Date**: July 2026

**Context**:

- The original landing page was a single narrow column of inline styles referencing a font (`Share Tech Mono`) that was never loaded, with no visual explanation of the architecture or security model
- The page must visually document how the system works (canvas → relay → machine) and its security guarantees, and needs an FAQ

**Decision Details**:

- **Scoped stylesheet** `app/landing.css` under a `.lp` root: ink-dark palette, sage/teal accent, violet "magic pen", paper-toned demo card; uses the fonts already loaded in `layout.tsx` (Geist, Geist Mono, Caveat, Kalam — the handwriting fonts double as the product's ink aesthetic)
- **Hero demo** (`components/landing/hero-demo.tsx`): a looping pure-CSS/SVG reenactment of the core gesture — handwritten note wipes in (clip-path), a hand-drawn SVG circle draws itself (`pathLength`/dashoffset), the reply appears in ink
- **Security diagram** (`components/landing/security.tsx`): canvas/relay/machine nodes with an animated packet lane *below* the cards (packets behind flex-1 cards are invisible — lane must be its own strip); the packet crossfades plaintext → 🔒 ciphertext → plaintext to show E2E encryption, plus a 6-card security grid sourced from decision #0
- **FAQ** (`components/landing/faq.tsx`): native `<details>` accordion, CSS-only animation — stays a server component
- Scroll reveals via one small client component (`components/landing/reveal.tsx`); all motion disabled under `prefers-reduced-motion`
- Everything remains fully static (no API routes), per decision #0

**Alternatives Considered**:

- Framer Motion / GSAP (rejected: bundle weight and a client-side dependency for what CSS keyframes do fine on a static page)
- Tailwind utility classes throughout (rejected for this page: a bespoke marketing design with many keyframes reads better as one scoped stylesheet; the app proper keeps Tailwind/shadcn)

**Implications**:

- The landing page ships zero animation-library JS and works with JS disabled except for scroll reveals and the paired-device CTA swap
- Security claims on the page (AES-256-GCM, fragment-carried keys, replay protection, guardrails, `--reset-pairing`, `--local`) mirror decision #0 — update both together

---

## 11. Connector Onboarding as a Guided Tutorial (@clack/prompts)

**Decision**: `woodpecker connect` runs a three-step guided tutorial on every interactive start (choose folder → pair iPad → going live), built on `@clack/prompts`, with a text-prompt-→-arrow-key-directory-browser folder picker and a live "✓ Paired!" celebration when the first device handshakes.

**Date**: July 2026

**Context**:

- The old flow was a bare readline prompt, a QR dump, and raw `[connector]`/`[agent]` log lines — a newcomer had no way to know the folder they pick is what the iPad controls, or that a parent folder containing multiple repos makes them all reachable from one canvas
- There was no observable event for "a device actually paired" — only relay-level "canvas connected"

**Decision Details**:

- **`@clack/prompts`** (devDependency, esbuild-bundled into `dist/cli.js` like qrcode-terminal) provides intro/note/log/outro and the text/select prompts; new modules `connector/src/dirpicker.ts` (folder picker with `(git repo)` / `(N repos inside)` badges) and `connector/src/tutorial.ts` (step copy + status renderer)
- The QR code and live status lines print with plain `console.log` — clack `note()` borders would mangle the QR, and persistent spinners fight async agent logs
- **Typed `StatusEvent` union** replaces the string `onStatus` callback in `transports.ts`; **`createCore` gained `onDeviceConnected`** (fed by `recordDevice`, which now returns `{isNew, isFirstEver}`) so the CLI can celebrate the first handshake, then drop to dimmed `[connector]` log lines
- Non-TTY runs keep the exact legacy output (no clack anywhere); `--dir` still skips the prompt; terminals that claim a TTY but can't do raw mode fall back to the non-interactive path

**Alternatives Considered**:

- First-run-only tutorial (rejected by user: runs every launch — the folder confirmation is a feature)
- Hand-rolled raw-mode picker with zero deps (rejected: ~120 lines of keypress/redraw code to own for what clack does better)
- inquirer/enquirer/ink (rejected: heavier; ink drags in React for a CLI)

**Implications**:

- Any new transport status must be added to the `StatusEvent` union and both renderers (tutorial + `statusToPlainText`)
- The tutorial copy promises "everything inside the folder is reachable" — Claude Code can already traverse into sub-repos of `cwd`, but per-session repo targeting from the canvas remains future work

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
