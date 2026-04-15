# Key Technical Decisions

This document records important technical decisions made during the development of the Woodpecker project.

## 1. Handwriting Recognition Architecture

**Decision**: Use MyScript iink-ts with WebSocket-based cloud recognition for web, native SDKs for mobile

**Date**: January 2025

**Context**:

- Needed robust handwriting recognition for the e-ink notepad interface
- Evaluated both offline and online approaches

**Decision Details**:

- **Web App**: Use iink-ts with WebSocket connection to MyScript cloud
  - Provides best accuracy and real-time recognition
  - Requires internet connection
  - Follows official MyScript/TLDraw integration pattern
- **Mobile Apps**: Will use MyScript's native offline SDKs
  - iOS SDK provides full offline handwriting recognition
  - Android SDK available for future Android version
  - No internet connection required

**Alternatives Considered**:

- TensorFlow.js for browser-based offline recognition (rejected: accuracy concerns)
- Hybrid online/offline web approach (rejected: complexity vs benefit)
- Other OCR libraries (rejected: not optimized for handwriting)

**Implications**:

- Web app requires internet connection for handwriting features
- Mobile apps will have full offline capability
- Consistent recognition quality across platforms when online

---

## 2. AI Response Rendering

**Decision**: Render AI responses using custom handwriting fonts in TLDraw shapes

**Date**: January 2025

**Context**:

- Wanted AI responses to feel natural on the e-ink notepad
- Needed to maintain the handwritten aesthetic

**Decision Details**:

- Created custom `handwritten-text` TLDraw shape
- Use Kalam and Caveat fonts for handwritten appearance
- Implement typewriter animation for natural feel
- Position responses spatially near questions

**Implications**:

- Natural integration with handwritten notes
- Maintains sketching metaphor throughout

---

## 3. Intent Detection Pattern

**Decision**: Use debounced recognition with contextual intent detection

**Date**: January 2025

**Context**:

- Need to detect when users expect AI responses without explicit commands
- Balance between responsiveness and avoiding false triggers

**Decision Details**:

- 1000ms (1 second) debounce for WebSocket sync
- Context-aware intent detection using:
  - Temporal context (last 30 seconds)
  - Spatial context (nearby text)
  - Conversation history
- 70% confidence threshold for triggering responses

**Implications**:

- Natural interaction without manual triggers
- Reduced false positives
- Maintains conversation context

---

## 4. Magic Wand Gesture

**Decision**: Keep magic wand tool for explicit AI interactions alongside automatic detection

**Date**: January 2025

**Context**:

- Originally only had magic wand for AI interactions
- Added automatic handwriting detection
- Decided to keep both methods

**Decision Details**:

- Magic wand remains for:
  - Selecting specific areas for AI analysis
  - Forcing AI interaction when automatic detection fails
  - Working with non-text content (diagrams, sketches)
- Automatic detection handles:
  - Natural question writing
  - Conversational flow

**Implications**:

- Users have multiple ways to interact with AI
- Fallback method always available
- Supports different interaction preferences

---

## 5. State Persistence

**Decision**: Use localStorage for canvas auto-save, no cloud storage initially

**Date**: January 2025

**Context**:

- Need to preserve user's work between sessions
- Privacy and simplicity considerations

**Decision Details**:

- Auto-save to localStorage every 3 seconds
- Immediate save for draw operations
- Store complete TLDraw document state
- No user accounts or cloud sync initially

**Implications**:

- Work persists locally only
- No cross-device sync
- Simple implementation
- Future: Can add cloud sync as optional feature

---

## 6. Framework Choices

**Decision**: Next.js 15 with App Router, TLDraw for canvas, Tailwind CSS v4

**Date**: January 2025

**Context**:

- Building modern web application
- Need flexible canvas/drawing capabilities

**Decision Details**:

- **Next.js 15**: Latest features, App Router, React 19 support
- **TLDraw**: Powerful canvas with built-in tools, extensible
- **Tailwind CSS v4**: Modern styling approach
- **TypeScript**: Type safety throughout

**Implications**:

- Modern development experience
- Good performance and SEO capabilities
- Extensive customization options

---

## 7. AI Integration

**Decision**: Use Groq for LLM capabilities

**Date**: January 2025

**Context**:

- Need fast, capable AI for various features
- Cost and performance considerations

**Decision Details**:

- Groq API for text generation
- Llama models for different tasks:
  - `llama-3.3-70b-versatile` for general queries
  - `llama-4-scout-17b-16e-instruct` for vision tasks
- Custom prompts for intent detection

**Implications**:

- Fast response times
- Good accuracy for intended use cases
- Reasonable API costs

---

## 8. WebSocket SSR Stroke Accumulation Handling

**Decision**: Implement client-side text extraction to handle server-side stroke accumulation

**Date**: January 2025

**Context**:

- MyScript WebSocket SSR maintains a persistent session with all strokes
- Server accumulation is **session-only** - lost on page reload/reconnection
- When adding new strokes, the server returns recognition for ALL accumulated strokes
- Writing "Boop!" would return "Hello\n\nBoop!" if "Hello" was written earlier in the same session

**Decision Details**:

- **Why filter**: The e-ink notepad metaphor expects discrete writing actions, especially for AI interactions
- **How it works**:
  - Track the last recognized text in the InkRecognizer class
  - Extract only new text by comparing full results with previous recognition
  - Reset tracking when canvas is cleared
- **Key insight**: We're not fighting iink's design - we're adapting it for our use case where users expect each writing gesture to be processed independently

**Implementation**:

- `extractNewText()`: Compares full text with last recognized text
- `updateLastRecognizedText()`: Updates tracking after each recognition
- `resetTextTracking()`: Clears tracking on canvas clear

**Alternatives Considered**:

- Using full accumulated context (rejected: would confuse AI intent detection with old text)
- Creating new content parts on server (rejected: not supported by WebSocket SSR API)
- Clearing and re-sending all strokes (rejected: inefficient and poor UX)
- Using REST API instead of WebSocket (rejected: loses real-time recognition)

**Implications**:

- Clean separation of new text from accumulated history
- Better AI intent detection accuracy (processes only what user just wrote)
- Maintains handwriting recognition benefits (server still has full context)
- Works within MyScript WebSocket SSR limitations

**Future Considerations**:

- Could add toggle for "continuous mode" (show all accumulated text) vs "discrete mode" (current behavior)
- May need adjustment if MyScript adds content part management to WebSocket API

## 7. Email, Teams & Interactive Chat Integration

**Decision**: OAuth-based Gmail/Outlook/Teams integration with read-only + reply-only permissions, encrypted token storage, and interactive chat mode

**Date**: March 2026

**Context**:

- Users want to check important emails and Teams messages from the canvas without picking up a phone
- Must be safe: no accidental deletions, no composing new messages, reply-only
- Single-user personal tool, so minimal auth infrastructure needed

**Decision Details**:

- **OAuth Scopes**: Intentionally restricted
  - Google: `gmail.readonly` + `gmail.send` (no `gmail.modify` which would allow deletion)
  - Microsoft: `Mail.Read` + `Mail.Send` + `Chat.Read` + `ChatMessage.Send` (no `Mail.ReadWrite`)
- **Token Storage**: Local encrypted JSON file using AES-256-GCM, no cloud database
  - Path configurable via `WOODPECKER_TOKEN_PATH` env var
  - Encryption key via `WOODPECKER_ENCRYPTION_KEY` (32-byte hex)
  - Tokens auto-refresh, so one-time OAuth consent only
- **API Clients**: Direct fetch to Gmail API and Microsoft Graph (no heavy SDK wrappers)
  - Matches existing pattern of lightweight API calls
- **AI Summarization**: Emails/Teams messages summarized by Groq with importance classification (high/medium/low)
  - Calm, distraction-free tone matching the Woodpecker philosophy
- **Reply Flow**: Two-step confirmation — AI generates draft, user circles draft to send
- **Chat Mode**: Toggle that lowers intent detection thresholds for rapid back-and-forth
  - Debounce: 1000ms -> 500ms, confidence threshold: 0.7 -> 0.3, history window: 3 -> 10
- **New SmartActions**: `check_emails`, `check_teams`, `reply_email`, `reply_teams`
  - Integrated into existing magic wand gesture pipeline
  - Responses rendered as handwritten text (consistent with existing AI responses)

**Alternatives Considered**:

- IMAP/SMTP directly: More complex, no Teams support, harder auth
- Full email client: Over-engineered for a distraction-free tool
- API keys only: Not possible for Gmail/Outlook/Teams

**Implications**:

- Requires Google Cloud Console and Azure AD app registration for OAuth credentials
- Settings page (`/settings`) provides one-time account connection flow
- Safety guardrails at both OAuth scope level (can't delete even if code has bugs) and application level (no delete/compose functions exist)

---

## 9. Moss & Bark Themed Canvas (`/v2`)

**Decision**: Create a themed variant of the interactive canvas at `/v2` using the Moss & Bark design tokens, leaving the original `/` untouched

**Date**: April 2026

**Context**:

- The `/explore` page has a polished Moss & Bark visual theme but is purely decorative
- The main canvas at `/` has full interactivity but no visual theme
- Wanted to merge both: full interactive canvas with Moss & Bark styling

**Decision Details**:

- **Theme prop approach**: Thread a `WoodpeckerCanvasTheme` through the existing component tree via optional props
- When theme is absent, all components render identically to today (backward-compatible)
- When present, AI response shapes render as styled cards (cream bg, bark accent border, "WOODPECKER" label, DM Sans font)
- Canvas background uses warm off-white (`#f8f7f4`)
- Gesture frame uses tldraw `"green"` color (closest to moss) instead of `"light-blue"`
- Independent `storageKey` param on persistence functions so `/v2` canvas state is separate from `/`
- Card styling props added to `HandwrittenTextShape` with null/0 defaults (backward-compatible with existing serialized shapes)

**Alternatives Considered**:

- Fork `TldrawCanvas` into a separate component (rejected: massive duplication, maintenance burden)
- CSS-only theming with global variables (rejected: card styling on shapes requires per-shape props)
- Replace `/` with themed version (rejected: preserve existing experience, allow A/B comparison)

**Implications**:

- Both `/` and `/v2` are fully functional interactive canvases
- Theme tokens sourced from existing `earthMossBark` design exploration
- Future themes can be created by implementing `WoodpeckerCanvasTheme`
- No changes to existing serialized canvas data format
