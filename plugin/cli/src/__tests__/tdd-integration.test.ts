/**
 * Integration tests for TDD workflow with test and verification subagents
 *
 * Tests that:
 * 1. All TDD components are properly exported and accessible
 * 2. The TDD state flow works (test info → main agent → verification info)
 * 3. Directory structure is correct for TDD artifacts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Import from both subagent modules to verify exports work
import {
  runTestSubagent,
  detectTestCommand,
  getTestsDir,
  ensureTestsDir,
  saveTestInfo,
  loadTestInfo,
  type TestInfo,
  type TestSubagentResult,
} from "../agents/test";

import {
  runVerification,
  detectQualityCommands,
  getVerificationDir,
  ensureVerificationDir,
  saveVerificationInfo,
  loadVerificationInfo,
  generateRetryGuidance,
  MAX_RETRY_ATTEMPTS,
  type VerificationInfo,
  type VerifyResult,
} from "../agents/verify";

// Import from execute agent to verify TDD integration
import { runVerificationCommand } from "../agents/execute/agent";

// Import types
import type { AgentTask, ExecuteState } from "../core/state";

const TEST_DIR = "/tmp/claude/tdd-integration-test";

describe("TDD Integration", () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("Module Exports", () => {
    it("exports all test subagent functions", () => {
      expect(typeof runTestSubagent).toBe("function");
      expect(typeof detectTestCommand).toBe("function");
      expect(typeof getTestsDir).toBe("function");
      expect(typeof ensureTestsDir).toBe("function");
      expect(typeof saveTestInfo).toBe("function");
      expect(typeof loadTestInfo).toBe("function");
    });

    it("exports all verification subagent functions", () => {
      expect(typeof runVerification).toBe("function");
      expect(typeof detectQualityCommands).toBe("function");
      expect(typeof getVerificationDir).toBe("function");
      expect(typeof ensureVerificationDir).toBe("function");
      expect(typeof saveVerificationInfo).toBe("function");
      expect(typeof loadVerificationInfo).toBe("function");
      expect(typeof generateRetryGuidance).toBe("function");
    });

    it("exports runVerificationCommand from execute agent", () => {
      expect(typeof runVerificationCommand).toBe("function");
    });

    it("exports MAX_RETRY_ATTEMPTS constant", () => {
      expect(MAX_RETRY_ATTEMPTS).toBe(3);
    });
  });

  describe("TDD Directory Structure", () => {
    const planName = "tdd-plan";
    const projectDir = join(TEST_DIR, "structure-project");

    beforeAll(() => {
      mkdirSync(projectDir, { recursive: true });
    });

    it("creates tests directory under .mizu/<plan>/tests/", () => {
      ensureTestsDir(projectDir, planName);
      const testsDir = getTestsDir(projectDir, planName);

      expect(testsDir).toBe(join(projectDir, ".mizu", planName, "tests"));
      expect(existsSync(testsDir)).toBe(true);
    });

    it("creates verification directory under .mizu/<plan>/verification/", () => {
      ensureVerificationDir(projectDir, planName);
      const verifyDir = getVerificationDir(projectDir, planName);

      expect(verifyDir).toBe(join(projectDir, ".mizu", planName, "verification"));
      expect(existsSync(verifyDir)).toBe(true);
    });

    it("stores test and verification info in separate directories", () => {
      const testsDir = getTestsDir(projectDir, planName);
      const verifyDir = getVerificationDir(projectDir, planName);

      expect(testsDir).not.toBe(verifyDir);
      expect(testsDir.endsWith("tests")).toBe(true);
      expect(verifyDir.endsWith("verification")).toBe(true);
    });
  });

  describe("TDD State Flow", () => {
    const planName = "state-flow-plan";
    const projectDir = join(TEST_DIR, "state-flow-project");
    const taskId = "task-001";

    beforeAll(() => {
      mkdirSync(projectDir, { recursive: true });
    });

    it("follows RED → GREEN flow correctly", () => {
      // Phase 1: RED - Test subagent writes failing tests
      const redTestInfo: TestInfo = {
        taskId,
        testFiles: ["src/__tests__/feature.test.ts"],
        testCommand: "bun test",
        status: "red",
        failureOutput: "FAIL: add function is not defined",
        createdAt: new Date().toISOString(),
      };

      saveTestInfo(projectDir, planName, taskId, redTestInfo);

      // Verify RED state
      let testInfo = loadTestInfo(projectDir, planName, taskId);
      expect(testInfo?.status).toBe("red");

      // Phase 2: Main agent implements (simulated)
      // In real flow, the main agent would implement the feature

      // Phase 3: GREEN - Verification subagent verifies
      const verifyInfo: VerificationInfo = {
        taskId,
        passed: true,
        greenPassed: true, // Tests now pass
        refactorPassed: true, // Lint/types clean
        failures: [],
        verifiedAt: new Date().toISOString(),
        attemptNumber: 1,
      };

      saveVerificationInfo(projectDir, planName, taskId, verifyInfo);

      // Verify GREEN state
      const verification = loadVerificationInfo(projectDir, planName, taskId);
      expect(verification?.passed).toBe(true);
      expect(verification?.greenPassed).toBe(true);

      // Update test info to reflect GREEN
      redTestInfo.status = "green";
      redTestInfo.failureOutput = undefined;
      saveTestInfo(projectDir, planName, taskId, redTestInfo);

      testInfo = loadTestInfo(projectDir, planName, taskId);
      expect(testInfo?.status).toBe("green");
    });

    it("handles retry flow with attempt tracking", () => {
      const retryTaskId = "task-002";

      // First attempt fails
      const attempt1: VerificationInfo = {
        taskId: retryTaskId,
        passed: false,
        greenPassed: false,
        refactorPassed: true,
        failures: [{ type: "test", message: "Test failed", output: "Expected 2, got 1" }],
        retryGuidance: "Fix the calculation",
        verifiedAt: new Date().toISOString(),
        attemptNumber: 1,
      };
      saveVerificationInfo(projectDir, planName, retryTaskId, attempt1);

      // Second attempt fails
      const attempt2: VerificationInfo = {
        ...attempt1,
        attemptNumber: 2,
        verifiedAt: new Date().toISOString(),
      };
      saveVerificationInfo(projectDir, planName, retryTaskId, attempt2);

      // Third attempt (max) - should trigger BLOCKED status
      const attempt3: VerificationInfo = {
        ...attempt1,
        attemptNumber: 3,
        verifiedAt: new Date().toISOString(),
      };
      saveVerificationInfo(projectDir, planName, retryTaskId, attempt3);

      const loaded = loadVerificationInfo(projectDir, planName, retryTaskId);
      expect(loaded?.attemptNumber).toBe(3);
      expect(loaded?.attemptNumber).toBe(MAX_RETRY_ATTEMPTS);
    });
  });

  describe("Command Detection Consistency", () => {
    it("detects consistent test commands across subagents", () => {
      const projectDir = join(TEST_DIR, "cmd-detect-project");
      mkdirSync(projectDir, { recursive: true });

      // Create a bun project
      writeFileSync(join(projectDir, "bun.lockb"), "");

      // Both subagents should detect the same test command
      const testCmd = detectTestCommand(projectDir);
      const qualityCommands = detectQualityCommands(projectDir);

      expect(testCmd).toBe("bun test");
      expect(qualityCommands.testCommand).toBe("bun test");
    });

    it("handles project with all quality scripts", () => {
      const projectDir = join(TEST_DIR, "full-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify({
          name: "full-project",
          scripts: {
            test: "vitest",
            lint: "eslint .",
            typecheck: "tsc --noEmit",
            build: "vite build",
          },
        })
      );

      const commands = detectQualityCommands(projectDir);
      expect(commands.testCommand).toBe("npm test");
      expect(commands.lintCommand).toBe("npm run lint");
      expect(commands.typeCommand).toBe("npm run typecheck");
      expect(commands.buildCommand).toBe("npm run build");
    });
  });

  describe("runVerificationCommand Integration", () => {
    it("runs verification command and returns result", async () => {
      const projectDir = join(TEST_DIR, "verify-cmd-project");
      mkdirSync(projectDir, { recursive: true });

      // Test with a simple passing command
      const result = await runVerificationCommand("echo 'test'", projectDir);
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it("captures output from verification command", async () => {
      const projectDir = join(TEST_DIR, "verify-output-project");
      mkdirSync(projectDir, { recursive: true });

      const result = await runVerificationCommand("echo 'hello world'", projectDir);
      expect(result.output).toContain("hello world");
    });

    it("handles failing verification command", async () => {
      const projectDir = join(TEST_DIR, "verify-fail-project");
      mkdirSync(projectDir, { recursive: true });

      const result = await runVerificationCommand("exit 1", projectDir);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });

  describe("Error Guidance Generation", () => {
    it("generates helpful guidance for different failure types", () => {
      const testFailure = generateRetryGuidance([
        { type: "test", message: "Tests failed", output: "FAIL expected 1 to equal 2" },
      ]);
      expect(testFailure).toContain("Tests Failed");

      const typeFailure = generateRetryGuidance([
        { type: "type", message: "Type errors", output: "error TS2322" },
      ]);
      expect(typeFailure).toContain("Type Errors");

      const multiFailure = generateRetryGuidance([
        { type: "test", message: "Tests failed" },
        { type: "lint", message: "Lint errors" },
        { type: "build", message: "Build failed" },
      ]);
      expect(multiFailure).toContain("Tests Failed");
      expect(multiFailure).toContain("Lint Errors");
      expect(multiFailure).toContain("Build Failed");
    });
  });
});
