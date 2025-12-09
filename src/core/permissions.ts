/**
 * Permission Controls
 *
 * Security controls for agent tool usage.
 * Replaces the Python security.py with the SDK's canUseTool callback pattern.
 */

import type { PermissionResult, CanUseTool } from "@anthropic-ai/claude-agent-sdk";

export type AgentType = "bugfix" | "feature" | "refactor" | "greenfield";

// Base allowed commands (safe for all agents)
const BASE_ALLOWED_COMMANDS = new Set([
  // File inspection (read-only)
  "ls", "cat", "head", "tail", "wc", "grep", "find", "tree",
  // Directory navigation
  "pwd", "cd",
  // Utilities (read-only)
  "echo", "date", "which", "env",
]);

// Development commands (for agents that modify code)
const DEV_COMMANDS = new Set([
  // File operations
  "cp", "mv", "mkdir", "chmod", "touch",
  // Node.js
  "npm", "npx", "node", "yarn", "pnpm", "bun",
  // Python
  "python", "python3", "pip", "pip3", "poetry", "pytest", "mypy", "ruff", "black",
  // General dev
  "make", "cargo", "go", "ruby", "bundle",
  // Version control
  "git",
  // Process management
  "ps", "lsof", "sleep", "pkill", "kill",
  // Network (for testing)
  "curl", "jq",
  // Script execution
  "bash", "sh",
]);

// Dangerous patterns to always block
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,      // rm -rf / or ~
  /rm\s+-fr\s+[\/~]/,
  />\s*\/dev\/sd/,          // Writing to disk devices
  /dd\s+if=/,               // dd commands
  /mkfs/,                   // Format filesystems
  /:(){ :|:& };:/,          // Fork bomb
];

// Allowed process names for pkill/kill
const ALLOWED_KILL_TARGETS = new Set([
  "node", "npm", "npx", "yarn", "pnpm",
  "python", "python3", "pytest",
  "vite", "next", "webpack",
  "flask", "uvicorn", "gunicorn",
  "cargo", "go",
]);

function getAllowedCommands(agentType: AgentType): Set<string> {
  const commands = new Set(BASE_ALLOWED_COMMANDS);

  if (["bugfix", "feature", "refactor"].includes(agentType)) {
    DEV_COMMANDS.forEach(cmd => commands.add(cmd));
  } else if (agentType === "greenfield") {
    DEV_COMMANDS.forEach(cmd => commands.add(cmd));
  }

  return commands;
}

function extractCommands(command: string): string[] {
  // Simple command extraction - split on pipes, &&, ||, ;
  const segments = command.split(/\s*(?:\||\|\||&&|;)\s*/);
  const commands: string[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    // Get the first word (the command)
    const parts = trimmed.split(/\s+/);
    if (parts[0]) {
      // Remove path prefix
      const cmd = parts[0].split("/").pop() || parts[0];
      commands.push(cmd);
    }
  }

  return commands;
}

type InternalDecision =
  | { behavior: "allow" }
  | { behavior: "deny"; message: string };

function validateKillCommand(command: string): InternalDecision {
  const parts = command.split(/\s+/);
  const args = parts.slice(1).filter(p => !p.startsWith("-"));

  if (args.length === 0) {
    return { behavior: "deny", message: "pkill/kill requires a process name or PID" };
  }

  const target = args[args.length - 1];

  // Allow numeric PIDs
  if (/^\d+$/.test(target)) {
    return { behavior: "allow" };
  }

  if (ALLOWED_KILL_TARGETS.has(target)) {
    return { behavior: "allow" };
  }

  return {
    behavior: "deny",
    message: `pkill/kill only allowed for dev processes: ${[...ALLOWED_KILL_TARGETS].join(", ")}`,
  };
}

/**
 * Create a permission callback for the SDK's canUseTool option
 */
export function createPermissionCallback(agentType: AgentType): CanUseTool {
  const allowedCommands = getAllowedCommands(agentType);

  return async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> => {
    // Helper to create allow result
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

      // Check for dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          return deny(`Dangerous command pattern blocked: ${pattern}`);
        }
      }

      // Extract and validate each command
      const commands = extractCommands(command);

      for (const cmd of commands) {
        // Special handling for rm
        if (cmd === "rm") {
          if (command.includes("-rf") || command.includes("-fr")) {
            return deny("rm -rf not allowed for safety");
          }
          continue;
        }

        // Special handling for pkill/kill
        if (cmd === "pkill" || cmd === "kill") {
          const result = validateKillCommand(command);
          if (result.behavior !== "allow") {
            return deny(result.message);
          }
          continue;
        }

        // Check allowlist
        if (!allowedCommands.has(cmd)) {
          return deny(`Command '${cmd}' is not in the allowed commands list for ${agentType} agent`);
        }
      }
    }

    return allow();
  };
}

