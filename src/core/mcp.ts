/**
 * MCP Server Integration
 *
 * Configuration and management for Model Context Protocol (MCP) servers.
 * Enables browser automation, database access, and other external tools.
 */

// =============================================================================
// Types
// =============================================================================

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPServersConfig {
  [serverName: string]: MCPServerConfig;
}

// =============================================================================
// Puppeteer MCP Server
// =============================================================================

/**
 * Puppeteer MCP server for browser automation.
 * Enables testing web applications via screenshots, clicks, form fills, etc.
 */
export const PUPPETEER_SERVER: MCPServerConfig = {
  command: "npx",
  args: ["puppeteer-mcp-server"],
};

/**
 * Tools available from the Puppeteer MCP server
 */
export const PUPPETEER_TOOLS = [
  "mcp__puppeteer__puppeteer_navigate",
  "mcp__puppeteer__puppeteer_screenshot",
  "mcp__puppeteer__puppeteer_click",
  "mcp__puppeteer__puppeteer_fill",
  "mcp__puppeteer__puppeteer_select",
  "mcp__puppeteer__puppeteer_hover",
  "mcp__puppeteer__puppeteer_evaluate",
] as const;

export type PuppeteerTool = (typeof PUPPETEER_TOOLS)[number];

// =============================================================================
// Built-in Tools
// =============================================================================

/**
 * Built-in Claude Code tools
 */
export const BUILTIN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "Task",
  "TodoWrite",
] as const;

export type BuiltinTool = (typeof BUILTIN_TOOLS)[number];

// =============================================================================
// Server Presets
// =============================================================================

/**
 * Available MCP server presets
 */
export type MCPServerPreset = "puppeteer" | "filesystem" | "database";

/**
 * Get MCP server configuration by preset name
 */
export function getMCPServerConfig(preset: MCPServerPreset): MCPServerConfig {
  switch (preset) {
    case "puppeteer":
      return PUPPETEER_SERVER;
    case "filesystem":
      // Placeholder for future filesystem MCP server
      return {
        command: "npx",
        args: ["@anthropic/mcp-server-filesystem"],
      };
    case "database":
      // Placeholder for future database MCP server
      return {
        command: "npx",
        args: ["@anthropic/mcp-server-sqlite"],
      };
    default:
      throw new Error(`Unknown MCP server preset: ${preset}`);
  }
}

/**
 * Get tools available from an MCP server preset
 */
export function getMCPServerTools(preset: MCPServerPreset): readonly string[] {
  switch (preset) {
    case "puppeteer":
      return PUPPETEER_TOOLS;
    case "filesystem":
      // Placeholder
      return [];
    case "database":
      // Placeholder
      return [];
    default:
      return [];
  }
}

// =============================================================================
// Configuration Builders
// =============================================================================

export interface MCPConfigOptions {
  enablePuppeteer?: boolean;
  enableFilesystem?: boolean;
  enableDatabase?: boolean;
  customServers?: MCPServersConfig;
}

/**
 * Build MCP servers configuration from options
 */
export function buildMCPServersConfig(options: MCPConfigOptions): MCPServersConfig {
  const servers: MCPServersConfig = {};

  if (options.enablePuppeteer) {
    servers.puppeteer = PUPPETEER_SERVER;
  }

  if (options.enableFilesystem) {
    servers.filesystem = getMCPServerConfig("filesystem");
  }

  if (options.enableDatabase) {
    servers.database = getMCPServerConfig("database");
  }

  // Add any custom servers
  if (options.customServers) {
    Object.assign(servers, options.customServers);
  }

  return servers;
}

/**
 * Get all allowed tools based on MCP configuration
 */
export function getAllAllowedTools(options: MCPConfigOptions): string[] {
  const tools: string[] = [...BUILTIN_TOOLS];

  if (options.enablePuppeteer) {
    tools.push(...PUPPETEER_TOOLS);
  }

  // Add tools from custom servers if specified
  // (would need a registry of server -> tools mapping)

  return tools;
}

// =============================================================================
// Permission Strings for Settings File
// =============================================================================

/**
 * Generate permission strings for MCP tools
 */
export function getMCPToolPermissions(options: MCPConfigOptions): string[] {
  const permissions: string[] = [];

  if (options.enablePuppeteer) {
    // Allow all Puppeteer tools
    permissions.push(...PUPPETEER_TOOLS.map((tool) => `${tool}(*)`));
  }

  return permissions;
}

// =============================================================================
// Tool Descriptions (for prompts)
// =============================================================================

export interface ToolDescription {
  name: string;
  description: string;
  example?: string;
}

/**
 * Get descriptions of Puppeteer tools for use in prompts
 */
export function getPuppeteerToolDescriptions(): ToolDescription[] {
  return [
    {
      name: "mcp__puppeteer__puppeteer_navigate",
      description: "Navigate to a URL in the browser",
      example: 'puppeteer_navigate({ url: "http://localhost:3000" })',
    },
    {
      name: "mcp__puppeteer__puppeteer_screenshot",
      description: "Take a screenshot of the current page",
      example: "puppeteer_screenshot()",
    },
    {
      name: "mcp__puppeteer__puppeteer_click",
      description: "Click an element on the page by CSS selector",
      example: 'puppeteer_click({ selector: "button#submit" })',
    },
    {
      name: "mcp__puppeteer__puppeteer_fill",
      description: "Fill a form input with text",
      example: 'puppeteer_fill({ selector: "input#email", value: "test@example.com" })',
    },
    {
      name: "mcp__puppeteer__puppeteer_select",
      description: "Select an option from a dropdown",
      example: 'puppeteer_select({ selector: "select#country", value: "US" })',
    },
    {
      name: "mcp__puppeteer__puppeteer_hover",
      description: "Hover over an element",
      example: 'puppeteer_hover({ selector: "button.menu" })',
    },
    {
      name: "mcp__puppeteer__puppeteer_evaluate",
      description: "Execute JavaScript in the browser context",
      example: 'puppeteer_evaluate({ script: "document.title" })',
    },
  ];
}

/**
 * Format Puppeteer tools as a prompt section
 */
export function formatPuppeteerToolsForPrompt(): string {
  const tools = getPuppeteerToolDescriptions();

  let prompt = "## Available Browser Automation Tools\n\n";
  prompt += "You have access to Puppeteer MCP tools for browser testing:\n\n";

  for (const tool of tools) {
    prompt += `- **${tool.name}**: ${tool.description}\n`;
    if (tool.example) {
      prompt += `  Example: \`${tool.example}\`\n`;
    }
  }

  prompt += "\nUse these tools to verify features work end-to-end in the browser.\n";

  return prompt;
}
