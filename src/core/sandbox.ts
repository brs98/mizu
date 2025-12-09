/**
 * Sandbox Configuration
 *
 * OS-level security sandbox configuration for the Claude Agent SDK.
 * Creates .claude_settings.json with defense-in-depth security.
 *
 * Security Layers:
 * 1. OS Sandbox - Isolates bash commands at the OS level
 * 2. Filesystem Permissions - Restricts file access to project directory
 * 3. Tool Permissions - Controls which tools can be used
 */

import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { PUPPETEER_TOOLS, type MCPConfigOptions } from "./mcp";

// =============================================================================
// Types
// =============================================================================

export interface SandboxConfig {
  enabled: boolean;
  autoAllowBashIfSandboxed?: boolean;
}

export interface PermissionsConfig {
  defaultMode: "default" | "acceptEdits" | "bypassPermissions";
  allow: string[];
  deny?: string[];
}

export interface ClaudeSettingsFile {
  sandbox: SandboxConfig;
  permissions: PermissionsConfig;
}

// =============================================================================
// Permission Builders
// =============================================================================

/**
 * Build filesystem permissions for a project directory.
 * Uses relative paths to restrict access to only the project.
 */
export function buildFilesystemPermissions(options: {
  allowRead?: boolean;
  allowWrite?: boolean;
  allowEdit?: boolean;
  allowGlob?: boolean;
  allowGrep?: boolean;
  additionalPaths?: string[];
}): string[] {
  const {
    allowRead = true,
    allowWrite = true,
    allowEdit = true,
    allowGlob = true,
    allowGrep = true,
    additionalPaths = [],
  } = options;

  const permissions: string[] = [];

  // Use relative paths (./**) to restrict to project directory
  // The SDK resolves these relative to cwd
  if (allowRead) permissions.push("Read(./**)");
  if (allowWrite) permissions.push("Write(./**)");
  if (allowEdit) permissions.push("Edit(./**)");
  if (allowGlob) permissions.push("Glob(./**)");
  if (allowGrep) permissions.push("Grep(./**)");

  // Add any additional read-only paths (e.g., backend directory for migration)
  for (const path of additionalPaths) {
    permissions.push(`Read(${path}/**)`);
  }

  return permissions;
}

/**
 * Build tool permissions including MCP tools
 */
export function buildToolPermissions(options: MCPConfigOptions): string[] {
  const permissions: string[] = [];

  // Bash is always allowed (but validated by security hooks)
  permissions.push("Bash(*)");

  // Add Puppeteer tools if enabled
  if (options.enablePuppeteer) {
    for (const tool of PUPPETEER_TOOLS) {
      permissions.push(`${tool}(*)`);
    }
  }

  return permissions;
}

// =============================================================================
// Settings File Generation
// =============================================================================

export interface GenerateSettingsOptions {
  projectDir: string;
  sandboxEnabled?: boolean;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  enablePuppeteer?: boolean;
  additionalReadPaths?: string[];
}

/**
 * Generate the complete settings configuration
 */
export function generateSettings(options: GenerateSettingsOptions): ClaudeSettingsFile {
  const {
    sandboxEnabled = true,
    permissionMode = "acceptEdits",
    enablePuppeteer = false,
    additionalReadPaths = [],
  } = options;

  // Build permissions
  const filesystemPermissions = buildFilesystemPermissions({
    additionalPaths: additionalReadPaths,
  });

  const toolPermissions = buildToolPermissions({
    enablePuppeteer,
  });

  return {
    sandbox: {
      enabled: sandboxEnabled,
      autoAllowBashIfSandboxed: true,
    },
    permissions: {
      defaultMode: permissionMode,
      allow: [...filesystemPermissions, ...toolPermissions],
    },
  };
}

/**
 * Write settings to .claude_settings.json in the project directory
 */
export function writeSettingsFile(
  projectDir: string,
  settings: ClaudeSettingsFile
): string {
  // Ensure project directory exists
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }

  const settingsPath = join(projectDir, ".claude_settings.json");
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  return settingsPath;
}

/**
 * Create and write settings file, returning the path
 */
export function createSettingsFile(options: GenerateSettingsOptions): string {
  const settings = generateSettings(options);
  return writeSettingsFile(options.projectDir, settings);
}

// =============================================================================
// Settings Presets
// =============================================================================

export type SettingsPreset = "quick" | "standard" | "thorough" | "builder" | "migrator";

/**
 * Get settings for a preset configuration
 */
export function getSettingsPreset(
  preset: SettingsPreset,
  projectDir: string,
  additionalOptions?: Partial<GenerateSettingsOptions>
): ClaudeSettingsFile {
  const baseOptions: GenerateSettingsOptions = {
    projectDir,
    ...additionalOptions,
  };

  switch (preset) {
    case "quick":
      return generateSettings({
        ...baseOptions,
        sandboxEnabled: true,
        permissionMode: "acceptEdits",
        enablePuppeteer: false,
      });

    case "standard":
      return generateSettings({
        ...baseOptions,
        sandboxEnabled: true,
        permissionMode: "default",
        enablePuppeteer: false,
      });

    case "thorough":
      return generateSettings({
        ...baseOptions,
        sandboxEnabled: true,
        permissionMode: "default",
        enablePuppeteer: true, // Enable browser testing for thorough mode
      });

    case "builder":
      return generateSettings({
        ...baseOptions,
        sandboxEnabled: true,
        permissionMode: "acceptEdits", // Fast edits for long-running tasks
        enablePuppeteer: true, // Browser testing required for builders
      });

    case "migrator":
      return generateSettings({
        ...baseOptions,
        sandboxEnabled: true,
        permissionMode: "acceptEdits",
        enablePuppeteer: false, // Migrators don't need browser testing
      });

    default:
      return generateSettings(baseOptions);
  }
}

// =============================================================================
// Logging
// =============================================================================

/**
 * Print security configuration summary
 */
export function printSecuritySummary(
  settingsPath: string,
  settings: ClaudeSettingsFile,
  projectDir: string
): void {
  console.log("\n" + "-".repeat(50));
  console.log("  SECURITY CONFIGURATION");
  console.log("-".repeat(50));
  console.log(`  Settings file: ${settingsPath}`);
  console.log(`  Sandbox: ${settings.sandbox.enabled ? "ENABLED" : "disabled"}`);
  console.log(`  Permission mode: ${settings.permissions.defaultMode}`);
  console.log(`  Filesystem restricted to: ${projectDir}`);

  const puppeteerEnabled = settings.permissions.allow.some((p) =>
    p.includes("puppeteer")
  );
  console.log(`  Browser automation: ${puppeteerEnabled ? "ENABLED" : "disabled"}`);

  console.log("-".repeat(50) + "\n");
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that settings are secure
 */
export function validateSettings(settings: ClaudeSettingsFile): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check sandbox
  if (!settings.sandbox.enabled) {
    warnings.push("Sandbox is disabled - bash commands will not be isolated");
  }

  // Check permission mode
  if (settings.permissions.defaultMode === "bypassPermissions") {
    warnings.push("Permission bypass enabled - all tools will be auto-approved");
  }

  // Check for overly permissive paths
  const allowedPaths = settings.permissions.allow.filter(
    (p) => p.startsWith("Read(") || p.startsWith("Write(") || p.startsWith("Edit(")
  );

  for (const path of allowedPaths) {
    if (path.includes("/**") && !path.includes("./")) {
      // Absolute path with wildcard
      if (path.includes("/") && !path.startsWith("Read(.") && !path.startsWith("Write(.") && !path.startsWith("Edit(.")) {
        warnings.push(`Permission uses absolute path: ${path}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
