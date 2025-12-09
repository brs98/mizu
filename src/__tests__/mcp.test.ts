/**
 * Tests for MCP Server Integration
 */

import { describe, test, expect } from "bun:test";

import {
  PUPPETEER_SERVER,
  PUPPETEER_TOOLS,
  BUILTIN_TOOLS,
  getMCPServerConfig,
  getMCPServerTools,
  buildMCPServersConfig,
  getAllAllowedTools,
  getMCPToolPermissions,
  getPuppeteerToolDescriptions,
  formatPuppeteerToolsForPrompt,
  type MCPServerConfig,
  type MCPConfigOptions,
} from "../core/mcp";

// =============================================================================
// Constants Tests
// =============================================================================

describe("MCP Constants", () => {
  test("PUPPETEER_SERVER has correct structure", () => {
    expect(PUPPETEER_SERVER.command).toBe("npx");
    expect(PUPPETEER_SERVER.args).toContain("puppeteer-mcp-server");
  });

  test("PUPPETEER_TOOLS contains expected tools", () => {
    expect(PUPPETEER_TOOLS).toContain("mcp__puppeteer__puppeteer_navigate");
    expect(PUPPETEER_TOOLS).toContain("mcp__puppeteer__puppeteer_screenshot");
    expect(PUPPETEER_TOOLS).toContain("mcp__puppeteer__puppeteer_click");
    expect(PUPPETEER_TOOLS).toContain("mcp__puppeteer__puppeteer_fill");
    expect(PUPPETEER_TOOLS).toContain("mcp__puppeteer__puppeteer_select");
    expect(PUPPETEER_TOOLS).toContain("mcp__puppeteer__puppeteer_hover");
    expect(PUPPETEER_TOOLS).toContain("mcp__puppeteer__puppeteer_evaluate");
    expect(PUPPETEER_TOOLS.length).toBe(7);
  });

  test("BUILTIN_TOOLS contains core tools", () => {
    expect(BUILTIN_TOOLS).toContain("Read");
    expect(BUILTIN_TOOLS).toContain("Write");
    expect(BUILTIN_TOOLS).toContain("Edit");
    expect(BUILTIN_TOOLS).toContain("Glob");
    expect(BUILTIN_TOOLS).toContain("Grep");
    expect(BUILTIN_TOOLS).toContain("Bash");
    expect(BUILTIN_TOOLS).toContain("Task");
    expect(BUILTIN_TOOLS).toContain("TodoWrite");
  });
});

// =============================================================================
// Server Config Tests
// =============================================================================

describe("getMCPServerConfig", () => {
  test("returns Puppeteer config for puppeteer preset", () => {
    const config = getMCPServerConfig("puppeteer");
    expect(config).toEqual(PUPPETEER_SERVER);
  });

  test("returns filesystem config for filesystem preset", () => {
    const config = getMCPServerConfig("filesystem");
    expect(config.command).toBe("npx");
    expect(config.args).toContain("@anthropic/mcp-server-filesystem");
  });

  test("returns database config for database preset", () => {
    const config = getMCPServerConfig("database");
    expect(config.command).toBe("npx");
    expect(config.args).toContain("@anthropic/mcp-server-sqlite");
  });

  test("throws for unknown preset", () => {
    expect(() => getMCPServerConfig("unknown" as any)).toThrow("Unknown MCP server preset");
  });
});

describe("getMCPServerTools", () => {
  test("returns Puppeteer tools for puppeteer preset", () => {
    const tools = getMCPServerTools("puppeteer");
    expect(tools).toEqual(PUPPETEER_TOOLS);
  });

  test("returns empty array for filesystem preset (placeholder)", () => {
    const tools = getMCPServerTools("filesystem");
    expect(tools).toEqual([]);
  });

  test("returns empty array for database preset (placeholder)", () => {
    const tools = getMCPServerTools("database");
    expect(tools).toEqual([]);
  });

  test("returns empty array for unknown preset", () => {
    const tools = getMCPServerTools("unknown" as any);
    expect(tools).toEqual([]);
  });
});

// =============================================================================
// Config Builder Tests
// =============================================================================

describe("buildMCPServersConfig", () => {
  test("builds empty config when nothing enabled", () => {
    const config = buildMCPServersConfig({});
    expect(Object.keys(config)).toHaveLength(0);
  });

  test("includes Puppeteer when enabled", () => {
    const config = buildMCPServersConfig({ enablePuppeteer: true });
    expect(config.puppeteer).toBeDefined();
    expect(config.puppeteer).toEqual(PUPPETEER_SERVER);
  });

  test("includes filesystem when enabled", () => {
    const config = buildMCPServersConfig({ enableFilesystem: true });
    expect(config.filesystem).toBeDefined();
  });

  test("includes database when enabled", () => {
    const config = buildMCPServersConfig({ enableDatabase: true });
    expect(config.database).toBeDefined();
  });

  test("includes multiple servers when enabled", () => {
    const config = buildMCPServersConfig({
      enablePuppeteer: true,
      enableFilesystem: true,
      enableDatabase: true,
    });
    expect(Object.keys(config)).toHaveLength(3);
    expect(config.puppeteer).toBeDefined();
    expect(config.filesystem).toBeDefined();
    expect(config.database).toBeDefined();
  });

  test("includes custom servers", () => {
    const customServer: MCPServerConfig = {
      command: "node",
      args: ["custom-server.js"],
    };
    const config = buildMCPServersConfig({
      customServers: { custom: customServer },
    });
    expect(config.custom).toEqual(customServer);
  });

  test("merges custom servers with presets", () => {
    const config = buildMCPServersConfig({
      enablePuppeteer: true,
      customServers: {
        custom: { command: "node", args: ["custom.js"] },
      },
    });
    expect(config.puppeteer).toBeDefined();
    expect(config.custom).toBeDefined();
  });
});

describe("getAllAllowedTools", () => {
  test("includes builtin tools when nothing enabled", () => {
    const tools = getAllAllowedTools({});
    expect(tools).toEqual(expect.arrayContaining([...BUILTIN_TOOLS]));
  });

  test("includes Puppeteer tools when enabled", () => {
    const tools = getAllAllowedTools({ enablePuppeteer: true });
    expect(tools).toEqual(expect.arrayContaining([...BUILTIN_TOOLS]));
    expect(tools).toEqual(expect.arrayContaining([...PUPPETEER_TOOLS]));
  });

  test("returns correct total length with Puppeteer", () => {
    const tools = getAllAllowedTools({ enablePuppeteer: true });
    expect(tools.length).toBe(BUILTIN_TOOLS.length + PUPPETEER_TOOLS.length);
  });
});

// =============================================================================
// Permission Strings Tests
// =============================================================================

describe("getMCPToolPermissions", () => {
  test("returns empty array when nothing enabled", () => {
    const permissions = getMCPToolPermissions({});
    expect(permissions).toEqual([]);
  });

  test("returns Puppeteer tool permissions when enabled", () => {
    const permissions = getMCPToolPermissions({ enablePuppeteer: true });
    expect(permissions).toHaveLength(PUPPETEER_TOOLS.length);
    for (const tool of PUPPETEER_TOOLS) {
      expect(permissions).toContain(`${tool}(*)`);
    }
  });
});

// =============================================================================
// Tool Description Tests
// =============================================================================

describe("getPuppeteerToolDescriptions", () => {
  test("returns descriptions for all Puppeteer tools", () => {
    const descriptions = getPuppeteerToolDescriptions();
    expect(descriptions.length).toBe(7);
  });

  test("each description has required fields", () => {
    const descriptions = getPuppeteerToolDescriptions();
    for (const desc of descriptions) {
      expect(desc.name).toBeDefined();
      expect(desc.description).toBeDefined();
      expect(desc.name).toContain("mcp__puppeteer__");
    }
  });

  test("descriptions include examples", () => {
    const descriptions = getPuppeteerToolDescriptions();
    const withExamples = descriptions.filter((d) => d.example);
    expect(withExamples.length).toBeGreaterThan(0);
  });
});

describe("formatPuppeteerToolsForPrompt", () => {
  test("returns markdown formatted string", () => {
    const prompt = formatPuppeteerToolsForPrompt();
    expect(prompt).toContain("## Available Browser Automation Tools");
    expect(prompt).toContain("Puppeteer MCP tools");
  });

  test("includes all tool names", () => {
    const prompt = formatPuppeteerToolsForPrompt();
    for (const tool of PUPPETEER_TOOLS) {
      expect(prompt).toContain(tool);
    }
  });

  test("includes usage guidance", () => {
    const prompt = formatPuppeteerToolsForPrompt();
    expect(prompt).toContain("verify features");
    expect(prompt).toContain("browser");
  });
});
