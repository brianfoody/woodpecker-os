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
- 250ms debounce for handwriting recognition
- 500ms debounce for WebSocket sync
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