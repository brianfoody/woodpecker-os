/**
 * AI steps of the Daily Drive: distilling the morning plan into todos and
 * harvesting the evening reflection into learnings.
 *
 * Both capture the whole canvas as an image and run one connector execute()
 * with a strict JSON-only prompt, consuming the stream directly instead of
 * rendering cards — these are structural steps, not conversations.
 */

import { executeClaudeStream } from "@/lib/api-client";

export interface DistilledTodo {
  title: string;
  detail?: string;
}

/** Render every shape on the canvas to a base64 PNG (bounded for vision). */
export async function captureCanvasImage(
  editor: any,
  maxDim = 1568
): Promise<string | null> {
  const shapes = editor.getCurrentPageShapes();
  if (!shapes || shapes.length === 0) return null;
  const result = await editor.toImage(
    shapes.map((s: any) => s.id),
    { format: "png", background: true, scale: 1, padding: 20 }
  );
  if (!result?.blob) return null;
  return resizeAndEncode(result.blob, maxDim);
}

function resizeAndEncode(blob: Blob, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Run one prompt+image through the connector and return the full text. */
async function runOnce(prompt: string, image: string): Promise<string> {
  let text = "";
  for await (const event of executeClaudeStream(prompt, { image })) {
    if (event.type === "text_delta" && event.content) text += event.content;
    if (event.type === "error") {
      throw new Error(event.content || "The agent returned an error");
    }
  }
  return text;
}

/**
 * Pull the first JSON array out of a model reply. The prompt demands bare
 * JSON, but models occasionally wrap it in prose or a code fence.
 */
export function parseJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in the reply");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Reply was not a JSON array");
  return parsed;
}

const DISTILL_PROMPT = `This image is a photo of my handwritten free-form plan for the day.
Extract the concrete tasks I intend to do. Ignore musings, headings and anything already crossed out.
Respond with ONLY a JSON array, no markdown fences, no commentary:
[{"title": "...", "detail": "..."}]
- "title": the task, imperative, at most ~8 words
- "detail": optional one sentence of context from my writing (people, links, constraints); omit if none
Return [] if there are no tasks.`;

export async function distillPlanToTodos(editor: any): Promise<DistilledTodo[]> {
  const image = await captureCanvasImage(editor);
  if (!image) throw new Error("The plan canvas is empty — write your day first");
  const text = await runOnce(DISTILL_PROMPT, image);
  return parseJsonArray(text)
    .map((item: any) => ({
      title: typeof item?.title === "string" ? item.title : "",
      detail: typeof item?.detail === "string" ? item.detail : undefined,
    }))
    .filter((t) => t.title.trim().length > 0);
}

const HARVEST_PROMPT = `This image is a photo of my handwritten end-of-day reflection.
Extract the durable learnings and insights worth keeping beyond today — lessons, decisions, ideas. Ignore pure diary/logistics.
Respond with ONLY a JSON array of strings, no markdown fences, no commentary. Each string one concise learning in my voice.
Return [] if there are none.`;

export async function harvestLearnings(editor: any): Promise<string[]> {
  const image = await captureCanvasImage(editor);
  if (!image) throw new Error("The reflection canvas is empty — write it up first");
  const text = await runOnce(HARVEST_PROMPT, image);
  return parseJsonArray(text)
    .filter((item): item is string => typeof item === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}
