---
name: test-visual
description: Launch browser on tldraw canvas, create shapes, take screenshots for visual verification
allowed-tools: Bash Read Write
---

# Visual Test Skill

This skill lets you visually verify the Woodpecker canvas by launching a headless browser, executing actions (create shapes, draw circles, trigger wand, take screenshots), and reading the results back.

## Workflow

### 1. Start dev server on port 3999

Check if a server is already running, otherwise start one:

```bash
lsof -ti:3999 > /dev/null 2>&1 || (PORT=3999 npx next dev --port 3999 > /tmp/woodpecker-test-server.log 2>&1 &)
```

Wait for it to be ready:

```bash
for i in $(seq 1 30); do curl -s http://localhost:3999/v2 > /dev/null && break; sleep 1; done
```

### 2. Write action config

Write a JSON config file to `/tmp/woodpecker-visual-test.json`. The config has this structure:

```json
{
  "headless": true,
  "actions": [
    { "type": "clear" },
    { "type": "create-shape", "text": "Hello world", "x": 400, "y": 300 },
    { "type": "screenshot", "output": "/tmp/screenshot-1.png" },
    { "type": "draw-circle", "cx": 500, "cy": 320, "radius": 180 },
    { "type": "wait", "ms": 1000 },
    { "type": "trigger-wand", "cx": 500, "cy": 320, "radius": 180 },
    { "type": "wait-for-shape", "prop": "forkSessionId", "timeout": 60000 },
    { "type": "screenshot", "output": "/tmp/screenshot-2.png" },
    { "type": "get-shapes", "output": "/tmp/shapes.json" }
  ]
}
```

### Available actions

| Action | Fields | Purpose |
|--------|--------|---------|
| `clear` | — | Delete all shapes from the canvas |
| `create-shape` | `text`, `x`, `y`, optional `props` | Create a handwritten-text shape |
| `screenshot` | `output` (file path) | Take a full-page screenshot |
| `draw-circle` | `cx`, `cy`, `radius` | Draw a freehand circle (no wand trigger) |
| `trigger-wand` | `cx`, `cy`, `radius` | Draw circle + hold 800ms to trigger magic wand |
| `wait` | `ms` | Sleep for given milliseconds |
| `wait-for-shape` | `prop`, optional `timeout` | Poll until a shape with the given prop appears |
| `get-shapes` | `output` (file path) | Dump all handwritten-text shapes to JSON |
| `set-camera` | `x`, `y`, `z` | Set camera position and zoom level |

### 3. Run the harness

```bash
npx tsx scripts/test-visual-harness.ts /tmp/woodpecker-visual-test.json
```

The harness will:
- Launch a headless Chromium browser
- Navigate to `http://localhost:3999/v2`
- Wait for the tldraw editor to initialize
- Clear existing shapes
- Execute each action in sequence
- Exit with code 0 on success, 1 on failure

### 4. Read results

- **Screenshots**: Use the Read tool to view PNG files (e.g., `/tmp/screenshot-1.png`). Claude can read images natively.
- **Shape data**: Use the Read tool on the JSON file (e.g., `/tmp/shapes.json`) for programmatic verification of shape positions, text content, and properties.
- **Error screenshot**: If the harness fails, check `/tmp/woodpecker-visual-error.png`.

### 5. Clean up

Kill the test server when done:

```bash
lsof -ti:3999 | xargs kill 2>/dev/null
```

## Tips

- Always include a `clear` action first to start with a clean canvas.
- Use `set-camera` with `{"x": 0, "y": 0, "z": 1}` to reset the viewport before screenshots.
- The `trigger-wand` action automatically sets the draw tool and holds for 800ms.
- When verifying AI responses, use `wait-for-shape` with `prop: "forkSessionId"` and a generous timeout.
- Take screenshots before and after key actions for visual diffing.
