/**
 * Single permission arbiter for the local agent. Everything Claude Code
 * wants to do routes through canUseTool:
 *  - read-only tools and the user's own MCP tools are auto-allowed
 *  - Edit/Write are scoped to the chosen working directory
 *  - Bash is checked against a hard denylist of destructive patterns
 *
 * `--yolo` bypasses this entirely (permissionMode: bypassPermissions).
 */

import path from "node:path";

const READ_ONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "Task",
  "NotebookRead",
  "ListMcpResources",
  "ReadMcpResource",
]);

const WRITE_TOOLS_WITH_PATH: Record<string, string[]> = {
  Edit: ["file_path"],
  Write: ["file_path"],
  NotebookEdit: ["notebook_path"],
};

const BLOCKED_COMMANDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*(\/|~)(\s|$)/, label: "rm on / or ~" },
  { pattern: /\brm\s+-rf\s+\//, label: "rm -rf /" },
  { pattern: /\bcurl\b[^|]*\|\s*(ba|z|fi)?sh\b/, label: "curl | sh" },
  { pattern: /\bwget\b[^|]*\|\s*(ba|z|fi)?sh\b/, label: "wget | sh" },
  { pattern: /\bsudo\b/, label: "sudo" },
  { pattern: /\bchmod\b/, label: "chmod" },
  { pattern: /\bchown\b/, label: "chown" },
  { pattern: /\bnc\b.*-[le]/, label: "netcat listener" },
  { pattern: /\bmkfs\b/, label: "mkfs" },
  { pattern: /\bdd\s+.*of=\/dev\//, label: "dd to device" },
];

export type ToolDecision =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export function createCanUseTool(opts: {
  cwd: string;
  onBlocked?: (toolName: string, reason: string) => void;
}) {
  const root = path.resolve(opts.cwd);

  const deny = (toolName: string, reason: string): ToolDecision => {
    opts.onBlocked?.(toolName, reason);
    return { behavior: "deny", message: reason };
  };

  return async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<ToolDecision> => {
    const allow: ToolDecision = { behavior: "allow", updatedInput: input };

    // The user's own MCP servers came from their own Claude Code config —
    // trust them the same way their terminal Claude Code session would.
    if (toolName.startsWith("mcp__")) return allow;
    if (READ_ONLY_TOOLS.has(toolName)) return allow;

    if (toolName === "Bash") {
      const cmd = String(input.command ?? "");
      for (const { pattern, label } of BLOCKED_COMMANDS) {
        if (pattern.test(cmd)) {
          return deny(toolName, `blocked command (${label})`);
        }
      }
      return allow;
    }

    const pathKeys = WRITE_TOOLS_WITH_PATH[toolName];
    if (pathKeys) {
      for (const key of pathKeys) {
        const raw = input[key];
        if (typeof raw !== "string" || raw.length === 0) continue;
        const resolved = path.resolve(root, raw);
        if (resolved !== root && !resolved.startsWith(root + path.sep)) {
          return deny(
            toolName,
            `write outside working directory (${raw})`
          );
        }
      }
      return allow;
    }

    return allow;
  };
}
