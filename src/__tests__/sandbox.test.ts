/**
 * Tests for Sandbox Configuration
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildFilesystemPermissions,
  buildToolPermissions,
  generateSettings,
  writeSettingsFile,
  createSettingsFile,
  getSettingsPreset,
  validateSettings,
  type ClaudeSettingsFile,
} from "../core/sandbox";

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

function createTestDir(): string {
  const dir = join(tmpdir(), `ai-agents-sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// =============================================================================
// Permission Builder Tests
// =============================================================================

describe("buildFilesystemPermissions", () => {
  test("includes all default permissions", () => {
    const permissions = buildFilesystemPermissions({});
    expect(permissions).toContain("Read(./**)");
    expect(permissions).toContain("Write(./**)");
    expect(permissions).toContain("Edit(./**)");
    expect(permissions).toContain("Glob(./**)");
    expect(permissions).toContain("Grep(./**)");
  });

  test("respects allowRead option", () => {
    const permissions = buildFilesystemPermissions({ allowRead: false });
    expect(permissions).not.toContain("Read(./**)");
    expect(permissions).toContain("Write(./**)");
  });

  test("respects allowWrite option", () => {
    const permissions = buildFilesystemPermissions({ allowWrite: false });
    expect(permissions).toContain("Read(./**)");
    expect(permissions).not.toContain("Write(./**)");
  });

  test("respects allowEdit option", () => {
    const permissions = buildFilesystemPermissions({ allowEdit: false });
    expect(permissions).not.toContain("Edit(./**)");
  });

  test("respects allowGlob option", () => {
    const permissions = buildFilesystemPermissions({ allowGlob: false });
    expect(permissions).not.toContain("Glob(./**)");
  });

  test("respects allowGrep option", () => {
    const permissions = buildFilesystemPermissions({ allowGrep: false });
    expect(permissions).not.toContain("Grep(./**)");
  });

  test("adds additional read paths", () => {
    const permissions = buildFilesystemPermissions({
      additionalPaths: ["/backend", "/shared"],
    });
    expect(permissions).toContain("Read(/backend/**)");
    expect(permissions).toContain("Read(/shared/**)");
  });
});

describe("buildToolPermissions", () => {
  test("always includes Bash permission", () => {
    const permissions = buildToolPermissions({});
    expect(permissions).toContain("Bash(*)");
  });

  test("includes Puppeteer tools when enabled", () => {
    const permissions = buildToolPermissions({ enablePuppeteer: true });
    expect(permissions).toContain("Bash(*)");
    expect(permissions).toContain("mcp__puppeteer__puppeteer_navigate(*)");
    expect(permissions).toContain("mcp__puppeteer__puppeteer_screenshot(*)");
    expect(permissions).toContain("mcp__puppeteer__puppeteer_click(*)");
  });

  test("excludes Puppeteer tools when disabled", () => {
    const permissions = buildToolPermissions({ enablePuppeteer: false });
    expect(permissions).toContain("Bash(*)");
    expect(permissions).not.toContain("mcp__puppeteer__puppeteer_navigate(*)");
  });
});

// =============================================================================
// Settings Generation Tests
// =============================================================================

describe("generateSettings", () => {
  test("generates valid settings with defaults", () => {
    const settings = generateSettings({ projectDir: "/test" });

    expect(settings.sandbox.enabled).toBe(true);
    expect(settings.sandbox.autoAllowBashIfSandboxed).toBe(true);
    expect(settings.permissions.defaultMode).toBe("acceptEdits");
    expect(settings.permissions.allow).toBeDefined();
    expect(Array.isArray(settings.permissions.allow)).toBe(true);
  });

  test("respects sandboxEnabled option", () => {
    const settingsEnabled = generateSettings({
      projectDir: "/test",
      sandboxEnabled: true,
    });
    expect(settingsEnabled.sandbox.enabled).toBe(true);

    const settingsDisabled = generateSettings({
      projectDir: "/test",
      sandboxEnabled: false,
    });
    expect(settingsDisabled.sandbox.enabled).toBe(false);
  });

  test("respects permissionMode option", () => {
    const settingsDefault = generateSettings({
      projectDir: "/test",
      permissionMode: "default",
    });
    expect(settingsDefault.permissions.defaultMode).toBe("default");

    const settingsAccept = generateSettings({
      projectDir: "/test",
      permissionMode: "acceptEdits",
    });
    expect(settingsAccept.permissions.defaultMode).toBe("acceptEdits");

    const settingsBypass = generateSettings({
      projectDir: "/test",
      permissionMode: "bypassPermissions",
    });
    expect(settingsBypass.permissions.defaultMode).toBe("bypassPermissions");
  });

  test("includes Puppeteer tools when enabled", () => {
    const settings = generateSettings({
      projectDir: "/test",
      enablePuppeteer: true,
    });

    const hasPuppeteer = settings.permissions.allow.some((p) =>
      p.includes("puppeteer")
    );
    expect(hasPuppeteer).toBe(true);
  });

  test("excludes Puppeteer tools when disabled", () => {
    const settings = generateSettings({
      projectDir: "/test",
      enablePuppeteer: false,
    });

    const hasPuppeteer = settings.permissions.allow.some((p) =>
      p.includes("puppeteer")
    );
    expect(hasPuppeteer).toBe(false);
  });

  test("includes additional read paths", () => {
    const settings = generateSettings({
      projectDir: "/test",
      additionalReadPaths: ["/backend"],
    });

    expect(settings.permissions.allow).toContain("Read(/backend/**)");
  });
});

// =============================================================================
// Settings File Tests
// =============================================================================

describe("writeSettingsFile", () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test("writes settings file to project directory", () => {
    const settings = generateSettings({ projectDir: testDir });
    const path = writeSettingsFile(testDir, settings);

    expect(existsSync(path)).toBe(true);
    expect(path).toBe(join(testDir, ".claude_settings.json"));
  });

  test("writes valid JSON", () => {
    const settings = generateSettings({ projectDir: testDir });
    writeSettingsFile(testDir, settings);

    const content = readFileSync(join(testDir, ".claude_settings.json"), "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.sandbox).toBeDefined();
    expect(parsed.permissions).toBeDefined();
  });

  test("creates project directory if it doesn't exist", () => {
    const newDir = join(testDir, "subdir", "project");
    expect(existsSync(newDir)).toBe(false);

    const settings = generateSettings({ projectDir: newDir });
    writeSettingsFile(newDir, settings);

    expect(existsSync(newDir)).toBe(true);
    expect(existsSync(join(newDir, ".claude_settings.json"))).toBe(true);
  });
});

describe("createSettingsFile", () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test("creates settings file and returns path", () => {
    const path = createSettingsFile({ projectDir: testDir });
    expect(existsSync(path)).toBe(true);
  });

  test("uses provided options", () => {
    createSettingsFile({
      projectDir: testDir,
      enablePuppeteer: true,
    });

    const content = readFileSync(join(testDir, ".claude_settings.json"), "utf-8");
    const settings = JSON.parse(content);

    const hasPuppeteer = settings.permissions.allow.some((p: string) =>
      p.includes("puppeteer")
    );
    expect(hasPuppeteer).toBe(true);
  });
});

// =============================================================================
// Settings Presets Tests
// =============================================================================

describe("getSettingsPreset", () => {
  test("quick preset has sandbox enabled and acceptEdits mode", () => {
    const settings = getSettingsPreset("quick", "/test");
    expect(settings.sandbox.enabled).toBe(true);
    expect(settings.permissions.defaultMode).toBe("acceptEdits");
  });

  test("quick preset does not have Puppeteer", () => {
    const settings = getSettingsPreset("quick", "/test");
    const hasPuppeteer = settings.permissions.allow.some((p) =>
      p.includes("puppeteer")
    );
    expect(hasPuppeteer).toBe(false);
  });

  test("standard preset has sandbox enabled and default mode", () => {
    const settings = getSettingsPreset("standard", "/test");
    expect(settings.sandbox.enabled).toBe(true);
    expect(settings.permissions.defaultMode).toBe("default");
  });

  test("thorough preset has Puppeteer enabled", () => {
    const settings = getSettingsPreset("thorough", "/test");
    const hasPuppeteer = settings.permissions.allow.some((p) =>
      p.includes("puppeteer")
    );
    expect(hasPuppeteer).toBe(true);
  });

  test("builder preset has Puppeteer and acceptEdits", () => {
    const settings = getSettingsPreset("builder", "/test");
    expect(settings.permissions.defaultMode).toBe("acceptEdits");
    const hasPuppeteer = settings.permissions.allow.some((p) =>
      p.includes("puppeteer")
    );
    expect(hasPuppeteer).toBe(true);
  });

  test("migrator preset does not have Puppeteer", () => {
    const settings = getSettingsPreset("migrator", "/test");
    expect(settings.permissions.defaultMode).toBe("acceptEdits");
    const hasPuppeteer = settings.permissions.allow.some((p) =>
      p.includes("puppeteer")
    );
    expect(hasPuppeteer).toBe(false);
  });

  test("presets merge additional options", () => {
    const settings = getSettingsPreset("quick", "/test", {
      additionalReadPaths: ["/extra"],
    });
    expect(settings.permissions.allow).toContain("Read(/extra/**)");
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe("validateSettings", () => {
  test("validates secure default settings", () => {
    const settings = generateSettings({ projectDir: "/test" });
    const result = validateSettings(settings);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("warns when sandbox is disabled", () => {
    const settings = generateSettings({
      projectDir: "/test",
      sandboxEnabled: false,
    });
    const result = validateSettings(settings);
    expect(result.warnings).toContain(
      "Sandbox is disabled - bash commands will not be isolated"
    );
  });

  test("warns when permission bypass is enabled", () => {
    const settings = generateSettings({
      projectDir: "/test",
      permissionMode: "bypassPermissions",
    });
    const result = validateSettings(settings);
    expect(result.warnings).toContain(
      "Permission bypass enabled - all tools will be auto-approved"
    );
  });

  test("warnings do not affect validity", () => {
    const settings = generateSettings({
      projectDir: "/test",
      sandboxEnabled: false,
      permissionMode: "bypassPermissions",
    });
    const result = validateSettings(settings);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("validates settings with custom permissions", () => {
    const settings: ClaudeSettingsFile = {
      sandbox: { enabled: true },
      permissions: {
        defaultMode: "default",
        allow: ["Read(./**)", "Bash(*)"],
      },
    };
    const result = validateSettings(settings);
    expect(result.valid).toBe(true);
  });
});
