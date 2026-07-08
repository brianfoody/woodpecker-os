---
name: verify-e2e
description: Verify the full Woodpecker pipeline end-to-end — headless browser pairs with production, draws on the canvas, circles with the magic pen, and confirms an agent reply comes back through the E2E-encrypted relay from Claude Code on this machine. Use after changes to the relay, connector, protocol, or canvas connection code, or when a user reports "circling does nothing".
---

# Verify Woodpecker end-to-end

Runs the real product loop against production (or any deployment): pair →
relay join → draw → magic-pen circle → OCR → Claude Code executes on this
machine → reply card appears on the canvas.

## Prerequisites

- Connector running on this machine: `npx @woodpeckeros/connect`
  (it must get past the working-dir prompt — check its terminal)
- Pairing exists: `~/.woodpecker/pairing.json`
- `playwright` resolves from the repo root (it's in devDependencies)

## Run

```bash
node .claude/skills/verify-e2e/canvas-e2e.mjs
# against a preview/local deployment:
WOODPECKER_URL=http://localhost:3000 node .claude/skills/verify-e2e/canvas-e2e.mjs
```

The script prints a final `VERDICT: PASS/FAIL` line and exits 0 on pass.
Screenshots land in a temp dir printed at startup — look at `final.png`
when it fails.

## Interpreting failures (learned the hard way, July 2026)

| Symptom | Likely cause |
|---|---|
| `connector present: false` (exit 2) | Connector not running, OR relay scaled to >1 machine — channels are in-memory, peers get load-balanced apart. Check `fly scale show -a woodpecker-relay`; must be exactly 1. Redeploy with `fly deploy --ha=false`. |
| ws close `code=1013 reason=throughput limit` | Relay per-socket caps tripped (msg rate or bytes/min in `relay/src/server.js`). Historically caused by un-deduplicated full-snapshot `canvas-save` spam. |
| TLS/socket error before join | Missing cert on relay.woodpeckeros.com — `fly certs list -a woodpecker-relay`. The `.fly.dev` domain always has a cert; compare against it to isolate. |
| Connected but no `hello-ack` (stuck "waiting for connector") | Connector zombie socket (pre-0.1.1 had no heartbeat) — restart the connector. |
| Works headless but user's tab broken | Stale JS bundle in their tab; compare their console-error chunk hash to chunks served by `/canvas`. Hard reload fixes. |
| API "Could not process image" from OCR | An image was sent as a full data URL; the API needs raw base64 (the canvas strips the prefix at `tldraw-canvas.tsx` — probes must too). |

## Gotchas baked into the script

- The first-run overlay's CTA is **"Try it"** and it intercepts all clicks
  until dismissed.
- Magic pen tool button: `[data-testid="magic-pen-tool"]`.
- Draw tool keyboard shortcut: `d`.
- The reply card is detected by `WOODPECKER` appearing in body text.
- Production redirects apex → `www.woodpeckeros.com`; the relay URL is
  baked into the bundle (falls back to `DEFAULT_RELAY_URL` from
  `packages/protocol`).

## Lighter probe (no browser)

To check only "is the connector reachable on the channel":

```bash
node -e '
const WebSocket = require("ws");
const p = require(process.env.HOME + "/.woodpecker/pairing.json");
const ws = new WebSocket("wss://relay.woodpeckeros.com");
ws.on("open", () => ws.send(JSON.stringify({type:"join",channelId:p.channelId,role:"client"})));
ws.on("message", (d) => { const f = JSON.parse(d); if (f.type === "joined") { console.log("connector present:", f.peer.connector); process.exit(f.peer.connector ? 0 : 1); } });
setTimeout(() => { console.log("timeout"); process.exit(1); }, 8000);'
```

Note: a full run executes a real Claude Code session on this machine (the
scribble isn't legible, so the agent usually just asks what you meant —
cheap and harmless, but it does create a session).
