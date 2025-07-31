# Woodpecker Documentation

Welcome to the Woodpecker project documentation. This directory contains technical documentation, decisions, and guides for developers working on the project.

## 📚 Documentation Structure

### Core Documents

- **[DECISIONS.md](./DECISIONS.md)** - Key technical decisions and architectural choices made during development
- **[MOBILE_APP_CHECKLIST.md](./MOBILE_APP_CHECKLIST.md)** - Comprehensive checklist for developing native mobile versions

### Project Overview

Woodpecker is an AI-enhanced web interface for e-ink displays that enables:
- Traditional distraction-free writing and sketching
- Intelligent handwriting recognition
- Context-aware AI responses
- Natural interaction through drawing and writing

## 🏗️ Architecture Overview

### Web Application
- **Framework**: Next.js 15 with App Router
- **Canvas**: TLDraw for drawing and sketching
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript

### Handwriting Recognition
- **Web**: MyScript iink-ts with WebSocket cloud recognition
- **Mobile** (planned): MyScript native SDKs for offline support

### AI Integration
- **LLM Provider**: Groq
- **Intent Detection**: Context-aware with spatial and temporal understanding
- **Response Rendering**: Custom handwriting fonts with typewriter animation

## 🔑 Key Features

1. **Handwriting Recognition**
   - Real-time recognition via WebSocket
   - Automatic intent detection
   - Context preservation across sessions

2. **AI Interactions**
   - Magic wand tool for explicit selections
   - Automatic question detection
   - Natural handwritten responses

3. **Canvas Features**
   - Auto-save to localStorage
   - Multiple drawing tools
   - Custom shape implementations

## 📱 Platform Strategy

- **Web**: Cloud-based recognition (requires internet)
- **iOS/Android**: Offline-capable with native SDKs
- **Data Sync**: Future consideration for cross-platform synchronization

## 🚀 Getting Started

For development setup and running instructions, see the main [README.md](../README.md) in the project root.

## 📖 Additional Resources

- [MyScript Developer Portal](https://developer.myscript.com/)
- [TLDraw Documentation](https://tldraw.dev/)
- [Next.js Documentation](https://nextjs.org/docs)

## 🤝 Contributing

When making significant technical decisions:
1. Document the decision in [DECISIONS.md](./DECISIONS.md)
2. Include context, alternatives considered, and implications
3. Update relevant documentation as needed