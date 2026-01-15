/**
 * Tests for State Management Module
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureMizuDir, getMizuDir } from "../core/state";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DIR = "/tmp/claude/mizu-state-test";

beforeEach(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// =============================================================================
// ensureMizuDir Tests
// =============================================================================

describe("ensureMizuDir", () => {
  test("creates .mizu directory if it doesn't exist", () => {
    ensureMizuDir(TEST_DIR);
    expect(existsSync(getMizuDir(TEST_DIR))).toBe(true);
  });

  test("creates .gitignore with .mizu/ when no .gitignore exists", () => {
    ensureMizuDir(TEST_DIR);
    const gitignorePath = join(TEST_DIR, ".gitignore");
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, "utf-8");
    expect(content).toContain(".mizu/");
    expect(content).toContain("# Mizu execution state");
  });

  test("appends .mizu/ to existing .gitignore", () => {
    const gitignorePath = join(TEST_DIR, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\n.env\n");

    ensureMizuDir(TEST_DIR);

    const content = readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".env");
    expect(content).toContain(".mizu/");
    expect(content).toContain("# Mizu execution state");
  });

  test("appends .mizu/ to .gitignore without trailing newline", () => {
    const gitignorePath = join(TEST_DIR, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/"); // No trailing newline

    ensureMizuDir(TEST_DIR);

    const content = readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".mizu/");
  });

  test("does not duplicate .mizu/ if already in .gitignore", () => {
    const gitignorePath = join(TEST_DIR, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\n.mizu/\n");

    ensureMizuDir(TEST_DIR);

    const content = readFileSync(gitignorePath, "utf-8");
    const matches = content.match(/\.mizu/g);
    expect(matches?.length).toBe(1); // Only one occurrence
  });

  test("does not duplicate if .mizu (without slash) already in .gitignore", () => {
    const gitignorePath = join(TEST_DIR, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\n.mizu\n");

    ensureMizuDir(TEST_DIR);

    const content = readFileSync(gitignorePath, "utf-8");
    const matches = content.match(/\.mizu/g);
    expect(matches?.length).toBe(1); // Only one occurrence
  });

  test("does not modify .gitignore on subsequent calls", () => {
    // First call - creates .mizu/ and updates .gitignore
    ensureMizuDir(TEST_DIR);
    const gitignorePath = join(TEST_DIR, ".gitignore");
    const firstContent = readFileSync(gitignorePath, "utf-8");

    // Second call - .mizu/ already exists, should not touch .gitignore
    ensureMizuDir(TEST_DIR);
    const secondContent = readFileSync(gitignorePath, "utf-8");

    expect(secondContent).toBe(firstContent);
  });
});

// =============================================================================
// getMizuDir Tests
// =============================================================================

describe("getMizuDir", () => {
  test("returns correct path", () => {
    expect(getMizuDir("/some/project")).toBe("/some/project/.mizu");
  });
});
