# woodpeckeros

The [Woodpecker OS](https://woodpeckeros.com) connector — drive your local Claude Code from a handwriting canvas.

```bash
npx @woodpeckeros/connect
```

Then scan the QR code it prints from your iPad (or open the link in any browser), write something on the canvas, and circle it with the magic pen.

- Runs Claude Code on **this machine** with your existing Claude login (Pro/Max or API key)
- End-to-end encrypted to your browser — woodpeckeros.com never sees your keys or your content
- State lives in `~/.woodpecker/`

Commands:

| Command | |
|---|---|
| `woodpecker connect` | start (confirms working dir, prints pairing QR) |
| `woodpecker connect --dir <path>` | set the working directory, skipping the prompt |
| `woodpecker connect --reset-pairing` | rotate keys, revoke all devices |
| `woodpecker connect --yolo` | disable tool guardrails |
| `woodpecker connect --local` | local dev: plain WS on localhost:8787 |
| `woodpecker pair` | re-print the current QR |

Requires Node 20+.
