/**
 * Security Module
 *
 * Defense-in-depth security for agent tool usage.
 * Uses proper shell parsing (not regex) for command validation.
 *
 * Security Layers:
 * 1. OS-level sandbox (configured via sandbox.ts)
 * 2. Filesystem restrictions (relative paths in settings)
 * 3. Command allowlist with sophisticated parsing (this module)
 */

import type { PermissionResult, CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { AgentType } from "./permissions";

// =============================================================================
// Command Allowlists
// =============================================================================

/**
 * Base commands safe for all agents (read-only operations)
 */
const BASE_ALLOWED_COMMANDS = new Set([
  // File inspection (read-only)
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "find",
  "tree",
  // Directory navigation
  "pwd",
  "cd",
  // Utilities (read-only)
  "echo",
  "date",
  "which",
  "env",
  "true",
  "false",
  "test",
  "[",
]);

/**
 * Development commands for agents that modify code
 */
const DEV_COMMANDS = new Set([
  // File operations
  "cp",
  "mv",
  "mkdir",
  "chmod",
  "touch",
  "rm", // Validated separately
  // Node.js ecosystem
  "npm",
  "npx",
  "node",
  "yarn",
  "pnpm",
  "bun",
  "tsc",
  "tsx",
  // Python ecosystem
  "python",
  "python3",
  "pip",
  "pip3",
  "poetry",
  "pytest",
  "mypy",
  "ruff",
  "black",
  // General dev
  "make",
  "cargo",
  "go",
  "ruby",
  "bundle",
  // Version control
  "git",
  // Process management
  "ps",
  "lsof",
  "sleep",
  "pkill",
  "kill", // Validated separately
  // Network (for testing)
  "curl",
  "wget",
  // Text processing
  "jq",
  "sed",
  "awk",
  "sort",
  "uniq",
  "diff",
  "cut",
  "tr",
  "xargs",
  // Script execution
  "bash",
  "sh",
  // Init scripts (validated separately)
  "init.sh",
  "./init.sh",
]);

/**
 * Commands that require additional validation
 */
const COMMANDS_REQUIRING_VALIDATION = new Set([
  "rm",
  "pkill",
  "kill",
  "chmod",
  "init.sh",
  "./init.sh",
]);

/**
 * Dangerous patterns to always block (defense in depth)
 */
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\s+--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+[\/~]/, // rm -rf / or ~
  />\s*\/dev\/sd/, // Writing to disk devices
  /dd\s+if=/, // dd commands
  /mkfs/, // Format filesystems
  /:()\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/, // Fork bomb variants
  /\/etc\/passwd/, // Password file access
  /\/etc\/shadow/, // Shadow file access
  /curl[^|]*\|\s*(ba)?sh/, // Curl pipe to shell
  /wget[^|]*\|\s*(ba)?sh/, // Wget pipe to shell
];

/**
 * Allowed process names for pkill/kill
 */
const ALLOWED_KILL_TARGETS = new Set([
  "node",
  "npm",
  "npx",
  "yarn",
  "pnpm",
  "vite",
  "next",
  "webpack",
  "flask",
  "uvicorn",
  "gunicorn",
  "python",
  "python3",
  "pytest",
  "cargo",
  "go",
  "bun",
  "tsc",
]);

// =============================================================================
// Shell Parsing (shlex-like)
// =============================================================================

/**
 * Shell token types
 */
type ShellTokenType = "word" | "operator" | "redirect";

interface ShellToken {
  type: ShellTokenType;
  value: string;
}

/**
 * Parse a shell command string into tokens.
 * This is a simplified shlex-like parser for TypeScript.
 */
function tokenizeShellCommand(command: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let i = 0;
  const len = command.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(command[i])) {
      i++;
    }
    if (i >= len) break;

    const char = command[i];

    // Handle operators
    if (char === "|" || char === "&" || char === ";") {
      if (command[i + 1] === char && (char === "|" || char === "&")) {
        tokens.push({ type: "operator", value: char + char });
        i += 2;
      } else {
        tokens.push({ type: "operator", value: char });
        i++;
      }
      continue;
    }

    // Handle redirects
    if (char === ">" || char === "<") {
      if (command[i + 1] === char || command[i + 1] === "&") {
        tokens.push({ type: "redirect", value: char + command[i + 1] });
        i += 2;
      } else {
        tokens.push({ type: "redirect", value: char });
        i++;
      }
      continue;
    }

    // Handle quoted strings
    if (char === '"' || char === "'") {
      const quote = char;
      let word = "";
      i++; // Skip opening quote

      while (i < len && command[i] !== quote) {
        if (command[i] === "\\" && quote === '"' && i + 1 < len) {
          // Handle escape sequences in double quotes
          i++;
          word += command[i];
        } else {
          word += command[i];
        }
        i++;
      }
      i++; // Skip closing quote
      tokens.push({ type: "word", value: word });
      continue;
    }

    // Handle regular words
    let word = "";
    while (i < len && !/[\s|&;<>]/.test(command[i])) {
      if (command[i] === "\\" && i + 1 < len) {
        // Handle escape sequences
        i++;
        word += command[i];
      } else if (command[i] === '"' || command[i] === "'") {
        // Handle inline quotes
        const quote = command[i];
        i++;
        while (i < len && command[i] !== quote) {
          word += command[i];
          i++;
        }
      } else {
        word += command[i];
      }
      i++;
    }
    if (word) {
      tokens.push({ type: "word", value: word });
    }
  }

  return tokens;
}

/**
 * Split a command string into individual command segments.
 * Handles command chaining (&&, ||, ;) and pipes (|).
 */
function splitCommandSegments(command: string): string[] {
  const segments: string[] = [];
  const tokens = tokenizeShellCommand(command);

  let currentSegment: string[] = [];

  for (const token of tokens) {
    if (token.type === "operator" && ["&&", "||", ";", "|"].includes(token.value)) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(" "));
        currentSegment = [];
      }
    } else {
      currentSegment.push(token.value);
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(" "));
  }

  return segments;
}

/**
 * Extract command names from a shell command string.
 * Returns the base command names (without paths).
 */
function extractCommands(command: string): string[] {
  const commands: string[] = [];
  const segments = splitCommandSegments(command);

  for (const segment of segments) {
    const tokens = tokenizeShellCommand(segment);

    // Find the first word token that isn't a variable assignment
    for (const token of tokens) {
      if (token.type === "word") {
        // Skip variable assignments (VAR=value)
        if (token.value.includes("=") && !token.value.startsWith("=")) {
          continue;
        }
        // Skip flags
        if (token.value.startsWith("-")) {
          continue;
        }
        // Extract base command name (handle paths like /usr/bin/python)
        const cmd = token.value.split("/").pop() || token.value;
        commands.push(cmd);
        break;
      }
    }
  }

  return commands;
}

// =============================================================================
// Command Validation
// =============================================================================

interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate pkill/kill commands - only allow killing dev-related processes
 */
function validateKillCommand(command: string): ValidationResult {
  const tokens = tokenizeShellCommand(command);
  const args: string[] = [];

  // Skip command name and flags, collect arguments
  let foundCommand = false;
  for (const token of tokens) {
    if (token.type !== "word") continue;
    if (!foundCommand) {
      foundCommand = true;
      continue;
    }
    if (!token.value.startsWith("-")) {
      args.push(token.value);
    }
  }

  if (args.length === 0) {
    return { allowed: false, reason: "pkill/kill requires a process name or PID" };
  }

  const target = args[args.length - 1];

  // Allow numeric PIDs
  if (/^\d+$/.test(target)) {
    return { allowed: true };
  }

  // For -f flag, extract the first word as process name
  const processName = target.includes(" ") ? target.split(/\s+/)[0] : target;

  if (ALLOWED_KILL_TARGETS.has(processName)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `pkill/kill only allowed for dev processes: ${[...ALLOWED_KILL_TARGETS].slice(0, 5).join(", ")}...`,
  };
}

/**
 * Validate chmod commands - only allow making files executable with +x
 */
function validateChmodCommand(command: string): ValidationResult {
  const tokens = tokenizeShellCommand(command);
  const args: string[] = [];

  // Skip command name, collect arguments
  let foundCommand = false;
  for (const token of tokens) {
    if (token.type !== "word") continue;
    if (!foundCommand) {
      foundCommand = true;
      continue;
    }
    args.push(token.value);
  }

  // Check for flags like -R (we don't allow recursive chmod)
  const hasRecursive = args.some((arg) => arg.startsWith("-") && arg.includes("R"));
  if (hasRecursive) {
    return { allowed: false, reason: "chmod -R (recursive) is not allowed" };
  }

  // Find mode (first non-flag argument)
  const mode = args.find((arg) => !arg.startsWith("-"));
  if (!mode) {
    return { allowed: false, reason: "chmod requires a mode" };
  }

  // Only allow +x variants (making files executable)
  if (/^[ugoa]*\+x$/.test(mode)) {
    return { allowed: true };
  }

  // Also allow numeric modes that include execute (but not 777)
  if (/^[0-7]{3,4}$/.test(mode)) {
    if (mode === "777" || mode === "0777") {
      return { allowed: false, reason: "chmod 777 is not allowed" };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: `chmod only allowed with +x mode or safe numeric modes, got: ${mode}` };
}

/**
 * Validate rm commands - block dangerous patterns
 */
function validateRmCommand(command: string): ValidationResult {
  const tokens = tokenizeShellCommand(command);
  const args: string[] = [];
  const flags: string[] = [];

  // Separate flags and arguments
  let foundCommand = false;
  for (const token of tokens) {
    if (token.type !== "word") continue;
    if (!foundCommand) {
      foundCommand = true;
      continue;
    }
    if (token.value.startsWith("-")) {
      flags.push(token.value);
    } else {
      args.push(token.value);
    }
  }

  // Check for recursive + force combination
  const hasRecursive = flags.some((f) => f.includes("r") || f.includes("R") || f === "--recursive");
  const hasForce = flags.some((f) => f.includes("f") || f === "--force");

  if (hasRecursive && hasForce) {
    // Block rm -rf on root or home
    for (const arg of args) {
      if (arg === "/" || arg === "~" || arg.startsWith("/") && arg.split("/").length <= 2) {
        return { allowed: false, reason: "rm -rf on root or top-level directories is not allowed" };
      }
    }
  }

  // Block rm on system directories
  const systemDirs = ["/etc", "/usr", "/bin", "/sbin", "/var", "/boot", "/lib", "/lib64"];
  for (const arg of args) {
    if (systemDirs.some((dir) => arg === dir || arg.startsWith(dir + "/"))) {
      return { allowed: false, reason: `rm on system directory ${arg} is not allowed` };
    }
  }

  return { allowed: true };
}

/**
 * Validate init.sh script execution
 */
function validateInitScript(command: string): ValidationResult {
  const tokens = tokenizeShellCommand(command);
  if (tokens.length === 0) {
    return { allowed: false, reason: "Empty command" };
  }

  const script = tokens[0].value;

  // Allow ./init.sh or paths ending in /init.sh
  if (script === "./init.sh" || script === "init.sh" || script.endsWith("/init.sh")) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Only init.sh is allowed, got: ${script}` };
}

// =============================================================================
// Main Security Functions
// =============================================================================

/**
 * Get allowed commands for an agent type
 */
function getAllowedCommands(agentType: AgentType): Set<string> {
  const commands = new Set(BASE_ALLOWED_COMMANDS);

  // All agent types get dev commands
  DEV_COMMANDS.forEach((cmd) => commands.add(cmd));

  return commands;
}

/**
 * Validate a bash command against the security policy
 */
export function validateBashCommand(
  command: string,
  agentType: AgentType
): ValidationResult {
  // Check for dangerous patterns first (defense in depth)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Dangerous command pattern blocked` };
    }
  }

  // Extract all commands from the command string
  const commands = extractCommands(command);

  if (commands.length === 0) {
    // Could not parse - allow empty commands
    return { allowed: true };
  }

  const allowedCommands = getAllowedCommands(agentType);

  // Check each command against the allowlist
  for (const cmd of commands) {
    if (!allowedCommands.has(cmd)) {
      return {
        allowed: false,
        reason: `Command '${cmd}' is not in the allowed commands list for ${agentType} agent`,
      };
    }

    // Additional validation for sensitive commands
    if (COMMANDS_REQUIRING_VALIDATION.has(cmd)) {
      let result: ValidationResult;

      if (cmd === "pkill" || cmd === "kill") {
        result = validateKillCommand(command);
      } else if (cmd === "chmod") {
        result = validateChmodCommand(command);
      } else if (cmd === "rm") {
        result = validateRmCommand(command);
      } else if (cmd === "init.sh" || cmd === "./init.sh") {
        result = validateInitScript(command);
      } else {
        result = { allowed: true };
      }

      if (!result.allowed) {
        return result;
      }
    }
  }

  return { allowed: true };
}

/**
 * Options passed to CanUseTool callback by the SDK
 */
interface CanUseToolOptions {
  signal: AbortSignal;
  suggestions?: unknown[];
  blockedPath?: string;
  decisionReason?: string;
  toolUseID: string;
  agentID?: string;
}

/**
 * Create a permission callback for the SDK's canUseTool option
 * This is an enhanced version that uses proper shell parsing
 */
export function createSecurePermissionCallback(
  agentType: AgentType
): CanUseTool {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    _options: CanUseToolOptions
  ): Promise<PermissionResult> => {
    const allow = (): PermissionResult => ({ behavior: "allow", updatedInput: input });
    const deny = (message: string): PermissionResult => ({ behavior: "deny", message });

    // Always allow read-only tools
    if (["Read", "Grep", "Glob"].includes(toolName)) {
      return allow();
    }

    // Validate Bash commands
    if (toolName === "Bash") {
      const command = input.command as string;
      if (!command) {
        return allow();
      }

      const result = validateBashCommand(command, agentType);
      if (!result.allowed) {
        return deny(result.reason || "Command blocked by security policy");
      }
    }

    return allow();
  };
}

/**
 * Pre-tool-use hook for the Claude SDK (async version)
 * Compatible with claude-code-sdk HookMatcher
 */
export async function bashSecurityHook(
  inputData: { tool_name?: string; tool_input?: Record<string, unknown> },
  _toolUseId?: string,
  _context?: unknown
): Promise<Record<string, unknown>> {
  if (inputData.tool_name !== "Bash") {
    return {};
  }

  const command = inputData.tool_input?.command as string;
  if (!command) {
    return {};
  }

  // Use "builder" as default agent type for hooks
  const result = validateBashCommand(command, "builder");
  if (!result.allowed) {
    return {
      decision: "block",
      reason: result.reason || "Command blocked by security policy",
    };
  }

  return {};
}

// =============================================================================
// Exports
// =============================================================================

export {
  extractCommands,
  splitCommandSegments,
  tokenizeShellCommand,
  getAllowedCommands,
  ALLOWED_KILL_TARGETS,
  BASE_ALLOWED_COMMANDS,
  DEV_COMMANDS,
};
