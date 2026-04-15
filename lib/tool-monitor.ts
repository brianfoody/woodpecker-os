import path from "path";

const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Bash", "Edit", "Write"];

// Directories Claude is allowed to read/write within
const APPROVED_DIRECTORIES = [
  process.env.CLAUDE_CODE_WORKING_DIR,
].filter(Boolean) as string[];

// Bash commands that are never allowed
const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+\//, // rm -rf /
  /\bcurl\b.*\|.*\bsh\b/, // curl | sh
  /\bsudo\b/, // any sudo
  /\bchmod\b/, // permission changes
  /\bchown\b/, // ownership changes
  /\bnc\b.*-[le]/, // netcat listeners
];

export function validateToolUse(
  toolName: string,
  args: Record<string, unknown>
): {
  allowed: boolean;
  reason?: string;
} {
  if (!ALLOWED_TOOLS.includes(toolName)) {
    return { allowed: false, reason: `Tool "${toolName}" not in allowlist` };
  }

  // Path validation for file operations
  if (["Read", "Edit", "Write"].includes(toolName) && args.path) {
    const resolvedPath = path.resolve(String(args.path));
    const inApproved = APPROVED_DIRECTORIES.some((dir) =>
      resolvedPath.startsWith(dir)
    );
    if (!inApproved) {
      return {
        allowed: false,
        reason: `Path "${args.path}" outside approved directories`,
      };
    }
  }

  // Bash command validation
  if (toolName === "Bash" && args.command) {
    const cmd = String(args.command);
    for (const pattern of BLOCKED_COMMANDS) {
      if (pattern.test(cmd)) {
        return { allowed: false, reason: `Blocked command pattern: ${pattern}` };
      }
    }
  }

  return { allowed: true };
}
