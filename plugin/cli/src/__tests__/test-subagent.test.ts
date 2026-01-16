/**
 * Tests for Phase 2: Test Subagent (RED Phase)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  detectTestCommand,
  getTestsDir,
  ensureTestsDir,
  saveTestInfo,
  loadTestInfo,
  type TestInfo,
} from "../agents/test";

const TEST_DIR = "/tmp/claude/test-subagent-test";

describe("Test Subagent", () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("detectTestCommand", () => {
    it("detects npm test from package.json", () => {
      const projectDir = join(TEST_DIR, "npm-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { test: "jest" }
        })
      );

      const command = detectTestCommand(projectDir);
      expect(command).toBe("npm test");
    });

    it("detects bun test from bun.lockb", () => {
      const projectDir = join(TEST_DIR, "bun-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "bun.lockb"), "");

      const command = detectTestCommand(projectDir);
      expect(command).toBe("bun test");
    });

    it("detects pytest from pytest.ini", () => {
      const projectDir = join(TEST_DIR, "python-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "pytest.ini"), "[pytest]");

      const command = detectTestCommand(projectDir);
      expect(command).toBe("pytest");
    });

    it("detects go test from go.mod", () => {
      const projectDir = join(TEST_DIR, "go-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "go.mod"), "module example.com/test");

      const command = detectTestCommand(projectDir);
      expect(command).toBe("go test ./...");
    });

    it("defaults to npm test", () => {
      const projectDir = join(TEST_DIR, "empty-project");
      mkdirSync(projectDir, { recursive: true });

      const command = detectTestCommand(projectDir);
      expect(command).toBe("npm test");
    });
  });

  describe("Test Info Management", () => {
    const planName = "test-plan";

    it("creates tests directory", () => {
      const projectDir = join(TEST_DIR, "info-project");
      mkdirSync(projectDir, { recursive: true });

      ensureTestsDir(projectDir, planName);

      const testsDir = getTestsDir(projectDir, planName);
      expect(existsSync(testsDir)).toBe(true);
    });

    it("saves and loads test info", () => {
      const projectDir = join(TEST_DIR, "info-project-2");
      mkdirSync(projectDir, { recursive: true });

      const testInfo: TestInfo = {
        taskId: "task-001",
        testFiles: ["src/__tests__/feature.test.ts"],
        testCommand: "bun test",
        status: "red",
        failureOutput: "Test failed: expected 1 to equal 2",
        createdAt: new Date().toISOString(),
      };

      saveTestInfo(projectDir, planName, "task-001", testInfo);

      const loaded = loadTestInfo(projectDir, planName, "task-001");
      expect(loaded).not.toBeNull();
      expect(loaded?.taskId).toBe("task-001");
      expect(loaded?.status).toBe("red");
      expect(loaded?.failureOutput).toContain("expected 1 to equal 2");
    });

    it("returns null for non-existent test info", () => {
      const projectDir = join(TEST_DIR, "info-project-3");
      mkdirSync(projectDir, { recursive: true });

      const loaded = loadTestInfo(projectDir, planName, "non-existent");
      expect(loaded).toBeNull();
    });
  });

  describe("Test Info Lifecycle", () => {
    it("supports the RED-GREEN workflow", () => {
      const projectDir = join(TEST_DIR, "lifecycle-project");
      mkdirSync(projectDir, { recursive: true });
      const planName = "feature-plan";

      // Step 1: Test subagent writes failing tests (RED)
      const redInfo: TestInfo = {
        taskId: "task-001",
        testFiles: ["tests/feature.test.ts"],
        testCommand: "npm test",
        status: "red",
        failureOutput: "FAIL: feature not implemented",
        createdAt: new Date().toISOString(),
      };
      saveTestInfo(projectDir, planName, "task-001", redInfo);

      // Verify RED state
      let loaded = loadTestInfo(projectDir, planName, "task-001");
      expect(loaded?.status).toBe("red");

      // Step 2: Main agent implements, verification passes (GREEN)
      // In practice, this would be handled by the verify subagent
      const greenInfo: TestInfo = {
        ...redInfo,
        status: "green" as const,
        failureOutput: undefined,
      };
      saveTestInfo(projectDir, planName, "task-001", greenInfo);

      // Verify GREEN state
      loaded = loadTestInfo(projectDir, planName, "task-001");
      expect(loaded?.status).toBe("green");
    });
  });
});
