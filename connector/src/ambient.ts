/**
 * The ambient canvas: the agent reads along as the user writes.
 *
 *   observe  — transcribe changed lines + classify each: is this just
 *              writing, a question, or something to do? (cheap, Haiku)
 *   draft    — for a line the user didn't wave off: answer it (info) or
 *              prepare it (action) using READ-ONLY tools. Nothing with a
 *              side effect can run here — enforced by canUseTool, not by
 *              asking nicely.
 *   approve  — the user ticked the draft: now execute it for real, under
 *              the normal guardrails.
 *
 * The classifier is conditioned on learning.ts — every tick and cancel the
 * user has made, with their reasons — so it gets quieter where it should.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  Draft,
  IntentClass,
  ObserveLine,
  ObservedLine,
  StreamEvent,
} from "@woodpeckeros/protocol";
import { learningPrompt } from "./learning";
import { runClaudeCode } from "./agent";

type ContentBlock =
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/png"; data: string };
    }
  | { type: "text"; text: string };

function singleMessage(content: ContentBlock[]): AsyncIterable<SDKUserMessage> {
  const userMessage: SDKUserMessage = {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  };
  return (async function* () {
    yield userMessage;
  })();
}

/** Pull a JSON object out of whatever the model returned. */
function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function runStructured(
  prompt: AsyncIterable<SDKUserMessage> | string,
  options: Record<string, unknown>,
  onTool?: (toolName: string, input: Record<string, unknown>) => void
): Promise<unknown> {
  let text = "";
  let structured: unknown = null;
  for await (const message of query({ prompt, options })) {
    const msg = message as any;
    if (message.type === "assistant" && Array.isArray(msg.message?.content)) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) text += block.text;
        if (block.type === "tool_use" && block.name !== "StructuredOutput") {
          onTool?.(block.name, block.input ?? {});
        }
      }
    }
    if (message.type === "result") {
      if (msg.structured_output) structured = msg.structured_output;
      else if (typeof msg.result === "string" && !text) text = msg.result;
      if (msg.subtype && msg.subtype !== "success" && !structured && !text) {
        throw new Error(
          Array.isArray(msg.errors) && msg.errors.length
            ? msg.errors.join("; ")
            : `agent stopped: ${msg.subtype}`
        );
      }
    }
  }
  const parsed = structured ?? parseJsonLoose(text);
  if (!parsed) console.warn(`[ambient] unparseable reply: ${text.slice(0, 400)}`);
  return parsed;
}

// ---------------------------------------------------------------------------
// observe
// ---------------------------------------------------------------------------

const OBSERVE_SYSTEM = `You are the quiet assistant inside a handwritten notebook. The user writes by hand (or by voice) and you read along, one line at a time.

For each line you are shown:
1. Transcribe it exactly (fix nothing but obvious recognition noise). Empty string if it is a drawing, a doodle, crossed out, or illegible.
2. Classify the INTENT:
   - "none": the user is just writing — notes, thoughts, journaling, headings, a to-do they will clearly do themselves ("gym", "pick up kids", "finish slides"), feelings, lists of facts. THIS IS THE DEFAULT. Most lines are "none".
   - "info": the line asks for knowledge you could look up or work out without touching anything — a question, "look up…", "what time does…", "find the best…", "how do I…".
   - "action": the line asks for something to be DONE in the world that software could prepare on their behalf — send/reply to an email or message, book/schedule/invite, order, file, create a doc, remind someone, pay.
3. Confidence 0..1 that stepping in would be WELCOME. Be conservative: a person writing a to-do list does not want help with every item. Only exceed 0.7 when the line clearly names a concrete thing a capable assistant could prepare (who/what is clear), or is phrased as a request/question.
4. title: for info/action, a short imperative label (max 7 words) for a little card, e.g. "Email Sam about Friday's invoice". Omit for none.
5. kind: email | message | calendar | research | reminder | purchase | document | other.

Use the surrounding page text only as context (e.g. it is a to-do list, a journal, meeting notes). Never invent content that is not written.`;

export async function observeLines(opts: {
  lines: ObserveLine[];
  context: string[];
  cwd: string;
}): Promise<ObservedLine[]> {
  if (opts.lines.length === 0) return [];
  const content: ContentBlock[] = [];

  const context = opts.context.filter((t) => t.trim()).slice(-30);
  content.push({
    type: "text",
    text:
      (context.length
        ? `The page so far (for context only):\n${context.map((t) => `  ${t}`).join("\n")}\n\n`
        : "The page is otherwise empty.\n\n") +
      `Lines to read now (${opts.lines.length}):`,
  });

  for (const line of opts.lines) {
    if (line.image) {
      content.push({ type: "text", text: `Line id=${line.id} (handwritten):` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: line.image },
      });
    } else {
      content.push({
        type: "text",
        text: `Line id=${line.id} (spoken, already transcribed): "${line.text ?? ""}"`,
      });
    }
  }

  const learned = learningPrompt();
  content.push({
    type: "text",
    text:
      (learned ? `${learned}\n\n` : "") +
      "Reply with ONLY a JSON object, no prose: {\"lines\": [{\"id\", \"text\", \"intent\", \"confidence\", \"title\"?, \"kind\"?}]} — one entry per line id above, same order.",
  });

  const result = (await runStructured(singleMessage(content), {
    cwd: opts.cwd,
    model: "haiku",
    systemPrompt: OBSERVE_SYSTEM,
    tools: [],
    // No MCP servers: the observer only reads ink. Keeps it fast and immune
    // to any broken tool schema in the user's own MCP config.
    mcpServers: {},
    strictMcpConfig: true,
    maxTurns: 3,
    persistSession: false,
    // Plain JSON in text: structured-output mode costs an extra tool turn.
    thinking: { type: "disabled" },
  })) as { lines?: ObservedLine[] } | null;

  const byId = new Map((result?.lines ?? []).map((l) => [String(l.id), l]));
  console.log(
    `[ambient] observed ${opts.lines.length} line(s): ` +
      (result?.lines ?? []).map((l) => `${l.id}="${l.text}" ${l.intent} ${l.confidence}`).join(" | ")
  );
  return opts.lines.map((line) => {
    const observed = byId.get(line.id);
    const intent: IntentClass =
      observed?.intent === "info" || observed?.intent === "action"
        ? observed.intent
        : "none";
    return {
      id: line.id,
      text: (observed?.text ?? line.text ?? "").trim(),
      intent,
      confidence: Math.max(0, Math.min(1, Number(observed?.confidence) || 0)),
      title: intent === "none" ? undefined : observed?.title,
      kind: intent === "none" ? undefined : observed?.kind,
    };
  });
}

// ---------------------------------------------------------------------------
// draft — read-only by construction
// ---------------------------------------------------------------------------

const DRAFT_READ_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "TodoWrite",
  "ListMcpResources",
  "ReadMcpResource",
]);

/** MCP tools are allowed in draft mode only if their name reads as a read. */
const READ_VERBS =
  /(^|_)(get|list|search|read|find|fetch|query|lookup|describe|show|view|suggest|check)(_|$)/i;
const WRITE_VERBS =
  /(^|_)(send|create|delete|update|post|write|reply|forward|trash|label|move|archive|remove|add|set|share|book|pay|publish|respond|invite|draft)(_|$)/i;

function draftModeCanUseTool(onBlocked: (name: string) => void) {
  return async (toolName: string, input: Record<string, unknown>) => {
    if (DRAFT_READ_TOOLS.has(toolName)) {
      return { behavior: "allow" as const, updatedInput: input };
    }
    if (toolName.startsWith("mcp__")) {
      const verb = toolName.split("__").pop() ?? "";
      if (READ_VERBS.test(verb) && !WRITE_VERBS.test(verb)) {
        return { behavior: "allow" as const, updatedInput: input };
      }
    }
    onBlocked(toolName);
    return {
      behavior: "deny" as const,
      message:
        "Draft mode: nothing with side effects may run until the user approves. Prepare the action instead and describe exactly what will happen.",
    };
  };
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    body: { type: "string" },
    needsApproval: { type: "boolean" },
  },
  required: ["summary", "body", "needsApproval"],
};

export async function draftLine(opts: {
  text: string;
  intent: IntentClass;
  kindHint?: string;
  context: string[];
  cwd: string;
  /** Live "what I'm doing" lines for the dot, e.g. "searching the web". */
  onProgress?: (label: string) => void;
}): Promise<Draft> {
  const today = new Date().toDateString();
  const context = opts.context.filter((t) => t.trim()).slice(-30);
  const prompt =
    opts.intent === "info"
      ? `Today is ${today}. The user wrote in their notebook: "${opts.text}"

Find out the answer. You may search and read, but you are in DRAFT MODE: you cannot change anything.
Reply as if writing a short note back in the margin of their notebook: plain, warm, under 90 words, no headings. Bullets only if it's a list.

Return JSON: {"summary": <the bare answer as you'd jot it in a margin, max 6 words, e.g. "7pm tonight" or "about 384,000 km">, "body": <the note>, "needsApproval": false}.`
      : `Today is ${today}. The user wrote in their notebook: "${opts.text}"${
          opts.kindHint ? ` (looks like: ${opts.kindHint})` : ""
        }

Prepare this so it's ready to go with a single tick from the user. You are in DRAFT MODE: you may look things up (contacts, threads, calendars, the web, files) but you must NOT send, create, book, or change anything — those tools will be denied.
- Email/message: write the actual message (To:, Subject: if email, then the body) in the user's plain voice. Short.
- Calendar: the exact event (title, when, who).
- Otherwise: the concrete steps you will take once approved.
If you can't tell who/what from what's written, make the best draft and flag the one thing to confirm.

Return JSON: {"summary": <what will happen when they tick, max 12 words>, "body": <the draft, markdown>, "needsApproval": true}.`;

  const fullPrompt = context.length
    ? `${prompt}\n\nThe rest of their page, for context:\n${context.map((t) => `  ${t}`).join("\n")}`
    : prompt;

  const blocked: string[] = [];
  const result = (await runStructured(fullPrompt, {
    cwd: opts.cwd,
    maxTurns: 12,
    persistSession: false,
    // Pick up the user's own MCP servers / settings where present (local mode).
    settingSources: ["user", "project", "local"],
    permissionMode: "default",
    canUseTool: draftModeCanUseTool((name) => blocked.push(name)),
    outputFormat: { type: "json_schema", schema: DRAFT_SCHEMA },
  }, (name, input) => opts.onProgress?.(describeTool(name, input)))) as Partial<Draft> | null;

  if (!result || typeof result.body !== "string") {
    throw new Error("The agent couldn't prepare a draft for that line.");
  }
  if (blocked.length) {
    console.log(`[ambient] draft mode held back: ${blocked.join(", ")}`);
  }
  return {
    summary: String(result.summary ?? opts.text).slice(0, 140),
    body: result.body,
    needsApproval: opts.intent === "action" ? result.needsApproval !== false : false,
  };
}

/** Human, lowercase, present-tense — it renders next to a pulsing dot. */
export function describeTool(name: string, input: Record<string, unknown>): string {
  const q = (k: string) => (typeof input[k] === "string" ? String(input[k]) : "");
  if (name === "WebSearch") return q("query") ? `searching "${q("query").slice(0, 40)}"` : "searching the web";
  if (name === "WebFetch") {
    try {
      return `reading ${new URL(q("url")).hostname.replace(/^www\./, "")}`;
    } catch {
      return "reading a page";
    }
  }
  if (name === "Read" || name === "Glob" || name === "Grep") return "looking through files";
  if (name === "ToolSearch") return "picking the right tools";
  if (name === "TodoWrite") return "planning";
  if (name === "Task" || name === "Agent") return "asking a helper";
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    const server = (parts[1] ?? "").replace(/^claude_ai_/, "").replace(/_/g, " ");
    const verb = (parts[2] ?? "").replace(/_/g, " ");
    return `${verb} · ${server}`.toLowerCase();
  }
  return name.toLowerCase();
}

// ---------------------------------------------------------------------------
// approve — the user ticked it; now it runs for real
// ---------------------------------------------------------------------------

export function approveDraft(opts: {
  text: string;
  draft: Draft;
  cwd: string;
  yolo: boolean;
  signal: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const prompt = `The user wrote "${opts.text}" in their notebook. You prepared this draft and they have now APPROVED it with a tick:

${opts.draft.summary}

${opts.draft.body}

Carry it out exactly as drafted — no scope creep. When finished, reply with one short line confirming what was done (e.g. "Sent to sam@acme.com"). If something blocks you, say plainly what and stop.`;
  return runClaudeCode({
    prompt,
    cwd: opts.cwd,
    yolo: opts.yolo,
    signal: opts.signal,
    settingSources: ["user", "project", "local"],
  });
}
