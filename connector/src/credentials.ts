/**
 * Claude credentials for a headless (cloud) agent.
 *
 * On a laptop the Agent SDK finds the user's normal Claude Code login. A
 * cloud box has none, so the canvas sends one over the E2E channel: either a
 * long-lived subscription token from `claude setup-token` or an Anthropic API
 * key. It is stored 0600 in ~/.woodpecker/ and exported into this process's
 * env, where every Agent SDK child process inherits it.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentAuth } from "@woodpeckeros/protocol";
import { WOODPECKER_HOME } from "./storage";

const CREDENTIALS_PATH = join(WOODPECKER_HOME, "credentials.json");

type StoredCredential = { type: "oauth-token" | "api-key"; value: string };

function applyToEnv(cred: StoredCredential): void {
  if (cred.type === "oauth-token") {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = cred.value;
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = cred.value;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }
}

/** Call once at startup. */
export function loadStoredCredential(): void {
  if (!existsSync(CREDENTIALS_PATH)) return;
  try {
    const cred = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8")) as StoredCredential;
    if (cred?.value) applyToEnv({ ...cred, value: cred.value.trim() });
  } catch {
    // Corrupt file — behave as if absent; the canvas will ask again.
  }
}

export function storeCredential(input: StoredCredential): void {
  const cred = { ...input, value: input.value.trim() };
  mkdirSync(WOODPECKER_HOME, { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(cred) + "\n", { mode: 0o600 });
  applyToEnv(cred);
}

export function credentialShape(
  type: StoredCredential["type"],
  value: string
): string | null {
  const v = value.trim();
  if (type === "oauth-token" && !v.startsWith("sk-ant-oat")) {
    return "That doesn't look like a token from `claude setup-token` (expected sk-ant-oat…).";
  }
  if (type === "api-key" && !v.startsWith("sk-ant-api")) {
    return "That doesn't look like an Anthropic API key (expected sk-ant-api…).";
  }
  return null;
}

/**
 * Best-effort: does this process have *some* way to reach Claude? On macOS
 * the login lives in the keychain where we can't cheaply see it, so a local
 * connector is assumed fine — its first request will say otherwise.
 */
export function authState(mode: "local" | "cloud"): AgentAuth {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) {
    return "ok";
  }
  if (existsSync(join(homedir(), ".claude", ".credentials.json"))) return "ok";
  return mode === "local" ? "ok" : "missing";
}

/**
 * Prove a credential works before keeping it: one tiny Haiku turn with the
 * credential injected into the child's env only.
 */
function friendly(message: string): string {
  const m = message.replace(/^Claude Code returned an error result:\s*/i, "");
  if (/401|invalid|authenticate/i.test(m)) {
    return "Claude didn't accept that — it may be mistyped or expired. Run `claude setup-token` again and paste the new one.";
  }
  if (/credit|billing|quota/i.test(m)) return `Claude says: ${m}`;
  return m;
}

export async function verifyCredential(
  cred: StoredCredential,
  cwd: string
): Promise<{ ok: boolean; message?: string }> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  delete env.ANTHROPIC_API_KEY;
  if (cred.type === "oauth-token") env.CLAUDE_CODE_OAUTH_TOKEN = cred.value.trim();
  else env.ANTHROPIC_API_KEY = cred.value.trim();
  try {
    let ok = false;
    let error = "";
    for await (const message of query({
      prompt: "Reply with the single word: ready",
      options: { cwd, env, model: "haiku", tools: [], maxTurns: 1, persistSession: false },
    })) {
      const msg = message as any;
      if (message.type === "result") {
        ok = msg.subtype === "success" && !msg.is_error;
        if (!ok) error = typeof msg.result === "string" ? msg.result : msg.subtype;
      }
    }
    return ok ? { ok } : { ok, message: friendly(error || "Claude rejected that credential.") };
  } catch (e) {
    return { ok: false, message: friendly(e instanceof Error ? e.message : "Claude rejected that credential.") };
  }
}
