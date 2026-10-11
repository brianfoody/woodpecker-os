# Woodpecker OS

A notebook that reads along.

Write your day by hand (or press and hold to say it). When a line needs doing, a small mark appears in the margin and your agent quietly gets it ready: questions are answered right there, actions (emails, invites…) wait as drafts until you tick. Cancel one and say why; it learns when to stay quiet.

The agent is a real Claude Code agent running on **your own Claude plan**, hosted for you by Woodpecker Cloud (one private container per person), or on your own computer if you prefer. Install the notebook as an app from the browser (PWA).

- App: `/notebook` · landing: `/` · the older tldraw canvas still lives at `/canvas`
- Hosted agents: `woodpecker fleet` on one Lightsail box, `deploy/fleet/fleet.yaml` (decision #14)

Live at **[woodpeckeros.com](https://woodpeckeros.com)**.

## How it works

```
┌─ woodpeckeros.com (Vercel, static) ─┐      ┌─ relay.woodpeckeros.com (Fly.io) ─┐
│  canvas UI · landing · /pair        │◄────►│  dumb pipe — sees only ciphertext │
└─────────────────────────────────────┘  wss └────────────────┬──────────────────┘
                                                              │ wss
                                             ┌────────────────┴──────────────────┐
                                             │  your machine                     │
                                             │  npx @woodpeckeros/connect         │
                                             │  → Claude Agent SDK, your login   │
                                             │  → your files, your MCP servers   │
                                             │  → state in ~/.woodpecker/        │
                                             └───────────────────────────────────┘
```

- **No accounts.** Pairing is a QR code: the connector prints `https://woodpeckeros.com/pair#<channelId>.<key>` — the secret lives in the URL fragment, which never reaches any server.
- **End-to-end encrypted.** AES-256-GCM between browser and connector; the relay forwards ciphertext and presence, nothing else.
- **Your agent, your choice of home.** The website is static files. The agent (Claude Code, history, canvas copies, what it has learned) lives either in your private Woodpecker Cloud container or on your own machine (`~/.woodpecker/`).
- **Guardrails by default.** Edits/writes are scoped to the working directory you choose; destructive shell patterns (sudo, `curl | sh`, `rm -rf /`, …) are denied and surfaced on the canvas. `--yolo` disables if you know what you're doing.

## Using it

1. On your computer: `npx @woodpeckeros/connect` (needs Node 20+ and a signed-in Claude Code — Pro/Max plan or API key)
2. Scan the QR it prints from your iPad, or open the link in any browser
3. Write something, pick the magic pen (brain icon), circle it

Circle an AI reply to continue that thread — every reply is a fork point, so branches never contaminate each other.

Useful connector commands:

- `woodpecker pair` — re-print the current QR
- `woodpecker connect --reset-pairing` — rotate keys and revoke every paired device
- `woodpecker connect --dir ~/some/project` — choose the working directory
- `woodpecker connect --yolo` — disable tool guardrails

## Repo layout (npm workspaces)

| Path | What | Deploys to |
|---|---|---|
| `/` (root) | Next.js 15 canvas app (tldraw), fully static | Vercel |
| `connector/` | `woodpeckeros` npm package (`woodpecker` bin) | npm |
| `relay/` | ~200-line Node `ws` relay | Fly.io |
| `packages/protocol/` | shared message types + WebCrypto E2E layer | (source-only) |

## Development

```bash
npm install
npm run dev                                   # canvas on http://localhost:3000

# in a second terminal — no relay or pairing needed on localhost:
node connector/dist/cli.js connect --local --dir ~/scratch
```

The canvas auto-connects to `ws://localhost:8787` when running on localhost without a pairing.

To exercise the full relay + E2E path locally:

```bash
node relay/src/server.js                      # relay on :9000
node connector/dist/cli.js connect --relay ws://localhost:9000 --app-url http://localhost:3000
# open the printed /pair link in the browser
```

Checks: `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run build -w @woodpeckeros/connect`

## Deploying

- **Web**: Vercel project at repo root. Env: `NEXT_PUBLIC_RELAY_URL=wss://relay.woodpeckeros.com`. Point `woodpeckeros.com` + `www` at Vercel.
- **Relay**: `cd relay && fly launch --no-deploy && fly deploy`, then `fly certs add relay.woodpeckeros.com` and a CNAME for `relay`.
- **Connector**: `cd connector && npm run build && npm publish` (package `woodpeckeros`).

## Documentation

- `docs/DECISIONS.md` — architecture decisions (start with #0: the connector/relay model)
- `CLAUDE.md` — instructions for Claude Code when working on this repo
