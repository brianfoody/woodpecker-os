# Woodpecker

> _"Describe the tongue of a woodpecker."_ — Leonardo da Vinci, c. 1500s

An AI-enhanced web interface for e-ink displays (and iPads) that protects "boring" time. You write and sketch by hand in a calm, distraction-free canvas, and can **summon** technology only when you need it — by circling a region with the magic pen and asking it to take an action in the real world.

The goal: make doing the right thing easy and doing the wrong thing annoying (but not impossible). The notepad should feel lovely and magical; the smartphone should feel odd and dated beside it.

## What it is

A [Next.js 15](https://nextjs.org) (App Router, React 19, TypeScript) app built around a [tldraw](https://tldraw.dev) canvas. You handwrite and draw freely; the **magic pen** captures a circled region of the canvas as an image, extracts the text from it with Claude vision, runs an AI decision maker over it, and returns an actionable response card (title, description, actions) directly on the canvas.

### Tech stack

- **Framework:** Next.js 15 (App Router) · React 19 · TypeScript
- **Canvas:** tldraw 3
- **Styling:** Tailwind CSS v4 · shadcn/ui (new-york) · Geist + Orbitron fonts
- **AI / text extraction:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — the circled region is sent as an image to Claude for OCR (`app/api/extract-text`)
- **Persistence:** localStorage auto-save · SQLite (`better-sqlite3`) for sessions

> **Note:** Real-time stroke-based handwriting recognition (MyScript / `iink-ts`) is **deprecated** right now. The `lib/iink-*.ts` files and `NEXT_PUBLIC_MYSCRIPT_*` env vars are dormant; text is currently recognized by sending the captured image to Claude vision instead.

### Routes

| Route       | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `/`         | Default light canvas                                         |
| `/v2`       | Neon Grid dark theme (Orbitron / Share Tech Mono) — for e-ink / iPad |
| `/explore`  | Design explorations                                          |
| `/settings` | App settings                                                 |
| `/sessions` | Saved sessions                                               |

## Getting started

### Prerequisites

- Node.js 18+ (developed on Node 22)
- An Anthropic Claude account. With Claude Max no API key is needed — the SDK uses your local CLI auth. Otherwise set `ANTHROPIC_API_KEY`.

### Setup

```bash
npm install
cp .env.example .env   # then fill in the values you need
```

`.env.example` lists the three values the app needs:

- `CLAUDE_CODE_WORKING_DIR` — directory the Claude Agent SDK operates in
- `WOODPECKER_AUTH_TOKEN` / `NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN` — the auth token pair (use the same value for both)

### Run

```bash
npm run dev     # dev server on http://localhost:3000
npm run build   # production bundle
npm run start   # serve the production build
npm run lint    # ESLint
```

## Testing on an iPad

The canvas is designed to be used with a stylus on a tablet. The easiest way to try it on a real iPad is to run the dev server on your Mac and open it from the iPad over your local Wi-Fi — no deploy needed.

> An iPad with an **Apple Pencil** gives the best experience: pressure/tilt sketching, palm rejection, and the magic-pen circling gesture all work as intended.

### 1. Put both devices on the same Wi-Fi

Your Mac and iPad must be on the **same network** (and not isolated by "client isolation" / guest Wi-Fi).

### 2. Start the dev server so the network can reach it

```bash
npm run dev
```

Next.js prints both a **Local** and a **Network** URL on startup, e.g.:

```
- Local:        http://localhost:3000
- Network:      http://10.200.23.26:3000
```

Use that Network URL on the iPad. If you don't see a Network URL, bind explicitly:

```bash
npx next dev -H 0.0.0.0 -p 3000
```

To find your Mac's LAN IP manually:

```bash
ipconfig getifaddr en0   # e.g. 10.200.23.26 (try en1 on Wi-Fi-only Macs)
```

### 3. Open it on the iPad

In **Safari**, go to:

```
http://<your-mac-ip>:3000        # default canvas
http://<your-mac-ip>:3000/v2     # Neon Grid dark theme (recommended for e-ink feel)
```

### 4. Make it feel like an appliance (recommended)

For the distraction-free, e-ink-like experience:

- **Add to Home Screen** — tap the Share icon → _Add to Home Screen_. Launching from the home-screen icon runs it standalone (no Safari address bar or tabs), which is closer to the intended device feel.
- **Enable Guided Access** (Settings → Accessibility → Guided Access) to lock the iPad to just this app and disable system gestures while you write.
- **Lock rotation** to your preferred orientation.

### 5. Use it

- Sketch and handwrite anywhere on the canvas with the Apple Pencil.
- Tap the **magic pen** (brain icon) in the toolbar to activate it — it highlights blue when active.
- **Circle** a region of your writing/drawing with the magic pen. The enclosed contents are captured, recognized, and sent to the AI, which returns an action card on the canvas.

### Using it on the move (remote access)

When the iPad isn't on the same Wi-Fi as your Mac (coffee shop, travelling, cellular), expose the local dev server through a tunnel and open the public HTTPS URL on the iPad. As a bonus this also gives you HTTPS, which unlocks secure-context-only browser features.

**Quickest — Cloudflare Tunnel** (free, no account for a throwaway URL):

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://<random>.trycloudflare.com` URL — open that on the iPad.

**ngrok** (free tier shows a one-time interstitial, then works the same):

```bash
brew install ngrok
ngrok config add-authtoken <your-token>   # one-time, from dashboard.ngrok.com
ngrok http 3000
```

Open the printed `https://<random>.ngrok-free.app` URL on the iPad.

**Most private — Tailscale** (recommended if you do this regularly): install [Tailscale](https://tailscale.com) on both the Mac and iPad, sign into the same account, and reach the Mac at `http://<mac-tailscale-ip>:3000`. Nothing is exposed to the public internet — the iPad reaches your Mac over a private mesh VPN from anywhere.

> ⚠️ **Security:** the app's only gate is a shared token that is also baked into the client (`NEXT_PUBLIC_WOODPECKER_AUTH_TOKEN`), so a public tunnel URL is effectively open to anyone who has it — and the magic pen can drive Claude with access to your `CLAUDE_CODE_WORKING_DIR`. Don't leave a `cloudflared`/`ngrok` tunnel running unattended, and prefer **Tailscale** for anything beyond a quick test.

Next.js may reject tunneled requests as cross-origin in dev. If you see warnings or assets fail to load, allow the tunnel host via `allowedDevOrigins` in `next.config.js`:

```js
const nextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app"],
  // ...existing config
};
```

### Troubleshooting

- **iPad can't connect / page won't load:**
  - Confirm both devices are on the same Wi-Fi and that it isn't a guest network with client isolation.
  - macOS firewall may block incoming connections: System Settings → Network → Firewall → allow `node` (or temporarily turn the firewall off to test).
  - Make sure you used the **Network** IP, not `localhost` (which on the iPad means the iPad itself).
- **Changes not hot-reloading on the iPad:** a hard refresh in Safari usually picks up Fast Refresh; if not, reload the tab.
- **Pencil drawing feels off / Safari hijacks gestures:** use the Home-Screen (standalone) launch and/or Guided Access to stop Safari from intercepting swipes.
- **HTTPS-only browser features:** core sketching works over plain HTTP. If a feature that requires a secure context misbehaves, use a tunnel from [Using it on the move](#using-it-on-the-move-remote-access) to get an HTTPS URL.

## Documentation

- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — key technical decisions and architectural choices
- [`docs/MOBILE_APP_CHECKLIST.md`](./docs/MOBILE_APP_CHECKLIST.md) — checklist for a native mobile version
- [`CLAUDE.md`](./CLAUDE.md) — project brief and guidance for working in this repo
- [`LOCAL_DEV.md`](./LOCAL_DEV.md) — running the browser-automation service locally

When you make a significant technical decision, record it in `docs/DECISIONS.md` (context, alternatives considered, implications).
