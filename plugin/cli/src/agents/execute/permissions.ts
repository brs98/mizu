/**
 * Execute Agent Permissions
 *
 * Permission system for the execute agent that supports:
 * - Presets (readonly, dev, full)
 * - Inference from plan content
 * - Explicit allow/deny overrides
 */

import type { PermissionResult, CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { ExecutionPermissions } from "../../core/state";
import {
  extractCommands,
  BASE_ALLOWED_COMMANDS,
  DEV_COMMANDS,
  FULL_COMMANDS,
  ALLOWED_KILL_TARGETS,
} from "../../core/security";

// =============================================================================
// Keyword to Commands Mapping (for inference)
// =============================================================================

const KEYWORD_COMMANDS: Record<string, string[]> = {
  // Docker
  "docker": ["docker", "docker-compose"],
  "container": ["docker", "docker-compose"],
  "dockerfile": ["docker", "docker-compose"],

  // Database
  "database": ["psql", "mysql", "sqlite3"],
  "postgres": ["psql"],
  "postgresql": ["psql"],
  "mysql": ["mysql"],
  "sqlite": ["sqlite3"],
  "redis": ["redis-cli"],
  "mongo": ["mongosh"],
  "mongodb": ["mongosh"],

  // Cloud
  "aws": ["aws"],
  "s3": ["aws"],
  "lambda": ["aws"],
  "gcloud": ["gcloud"],
  "gcp": ["gcloud"],
  "azure": ["az"],

  // Kubernetes
  "kubernetes": ["kubectl", "helm"],
  "k8s": ["kubectl", "helm"],
  "kubectl": ["kubectl"],
  "helm": ["helm"],
};

// =============================================================================
// Dangerous Patterns
// =============================================================================

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,      // rm -rf / or ~
  /rm\s+-fr\s+[\/~]/,
  />\s*\/dev\/sd/,          // Writing to disk devices
  /dd\s+if=/,               // dd commands
  /mkfs/,                   // Format filesystems
  /:(){ :|:& };:/,          // Fork bomb
];

// =============================================================================
// Permission Resolution
// =============================================================================

function getPresetCommands(preset: ExecutionPermissions["preset"]): Set<string> {
  switch (preset) {
    case "readonly":
      return new Set(BASE_ALLOWED_COMMANDS);
    case "dev":
      return new Set([...BASE_ALLOWED_COMMANDS, ...DEV_COMMANDS]);
    case "full":
      return new Set(FULL_COMMANDS);
    default:
      return new Set([...BASE_ALLOWED_COMMANDS, ...DEV_COMMANDS]);
  }
}

/**
 * Infer additional commands from plan content keywords
 */
export function inferCommandsFromContent(content: string): string[] {
  const lowerContent = content.toLowerCase();
  const inferred = new Set<string>();

  for (const [keyword, commands] of Object.entries(KEYWORD_COMMANDS)) {
    if (lowerContent.includes(keyword)) {
      commands.forEach(cmd => inferred.add(cmd));
    }
  }

  return [...inferred];
}

/**
 * Merge permissions: preset → inferred → allow → deny
 */
export function mergePermissions(permissions: ExecutionPermissions): Set<string> {
  // Start with preset
  const commands = getPresetCommands(permissions.preset);

  // Add inferred commands
  for (const cmd of permissions.inferred) {
    commands.add(cmd);
  }

  // Add explicitly allowed commands
  for (const cmd of permissions.allow) {
    commands.add(cmd);
  }

  // Remove explicitly denied commands
  for (const cmd of permissions.deny) {
    commands.delete(cmd);
  }

  return commands;
}

// =============================================================================
// Kill Command Validation
// =============================================================================

function validateKillCommand(command: string): { allowed: boolean; message?: string } {
  const parts = command.split(/\s+/);
  const args = parts.slice(1).filter(p => !p.startsWith("-"));

  if (args.length === 0) {
    return { allowed: false, message: "pkill/kill requires a process name or PID" };
  }

  const target = args[args.length - 1];

  // Allow numeric PIDs
  if (/^\d+$/.test(target)) {
    return { allowed: true };
  }

  if (ALLOWED_KILL_TARGETS.has(target)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: `pkill/kill only allowed for dev processes: ${[...ALLOWED_KILL_TARGETS].join(", ")}`,
  };
}

// =============================================================================
// Permission Callback
// =============================================================================

/**
 * Create a permission callback for the execute agent using config permissions
 */
export function createExecutePermissionCallback(permissions: ExecutionPermissions): CanUseTool {
  const allowedCommands = mergePermissions(permissions);

  return async (
    toolName: string,
    input: Record<string, unknown>
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

      // Check for dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          return deny(`Dangerous command pattern blocked: ${pattern}`);
        }
      }

      // Check explicit deny patterns
      for (const denyPattern of permissions.deny) {
        if (command.includes(denyPattern)) {
          return deny(`Command matches deny pattern: ${denyPattern}`);
        }
      }

      // Extract and validate each command
      const commands = extractCommands(command);

      for (const cmd of commands) {
        // Special handling for rm
        if (cmd === "rm") {
          if (command.includes("-rf") || command.includes("-fr")) {
            // Check if rm -rf is in the deny list (it's dangerous by default)
            if (!permissions.allow.includes("rm -rf")) {
              return deny("rm -rf not allowed for safety");
            }
          }
          continue;
        }

        // Special handling for pkill/kill
        if (cmd === "pkill" || cmd === "kill") {
          const result = validateKillCommand(command);
          if (!result.allowed) {
            return deny(result.message || "Kill command not allowed");
          }
          continue;
        }

        // Check allowlist
        if (!allowedCommands.has(cmd)) {
          return deny(`Command '${cmd}' is not allowed by the execution config. Allowed: ${permissions.preset} preset + [${permissions.inferred.join(", ")}]`);
        }
      }
    }

    return allow();
  };
}
