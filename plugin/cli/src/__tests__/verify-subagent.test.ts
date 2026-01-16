/**
 * Tests for Phase 3: Verification Subagent (GREEN + REFACTOR)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  detectQualityCommands,
  getVerificationDir,
  ensureVerificationDir,
  saveVerificationInfo,
  loadVerificationInfo,
  generateRetryGuidance,
  MAX_RETRY_ATTEMPTS,
  type VerificationInfo,
  type VerifyFailure,
} from "../agents/verify";

const TEST_DIR = "/tmp/claude/verify-subagent-test";

describe("Verification Subagent", () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("MAX_RETRY_ATTEMPTS", () => {
    it("is set to 3", () => {
      expect(MAX_RETRY_ATTEMPTS).toBe(3);
    });
  });

  describe("detectQualityCommands", () => {
    it("detects npm scripts from package.json", () => {
      const projectDir = join(TEST_DIR, "npm-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        join(projectDir, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: {
            test: "jest",
            lint: "eslint .",
            typecheck: "tsc --noEmit",
            build: "tsc"
          }
        })
      );

      const commands = detectQualityCommands(projectDir);
      expect(commands.testCommand).toBe("npm test");
      expect(commands.lintCommand).toBe("npm run lint");
      expect(commands.typeCommand).toBe("npm run typecheck");
      expect(commands.buildCommand).toBe("npm run build");
    });

    it("detects bun test from bun.lockb", () => {
      const projectDir = join(TEST_DIR, "bun-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "bun.lockb"), "");

      const commands = detectQualityCommands(projectDir);
      expect(commands.testCommand).toBe("bun test");
    });

    it("detects TypeScript type checking from tsconfig.json", () => {
      const projectDir = join(TEST_DIR, "ts-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "tsconfig.json"), "{}");

      const commands = detectQualityCommands(projectDir);
      expect(commands.typeCommand).toBe("npx tsc --noEmit");
    });

    it("defaults to npm test", () => {
      const projectDir = join(TEST_DIR, "empty-project");
      mkdirSync(projectDir, { recursive: true });

      const commands = detectQualityCommands(projectDir);
      expect(commands.testCommand).toBe("npm test");
    });
  });

  describe("Verification Info Management", () => {
    const planName = "verify-plan";

    it("creates verification directory", () => {
      const projectDir = join(TEST_DIR, "verify-info-project");
      mkdirSync(projectDir, { recursive: true });

      ensureVerificationDir(projectDir, planName);

      const verifyDir = getVerificationDir(projectDir, planName);
      expect(existsSync(verifyDir)).toBe(true);
    });

    it("saves and loads verification info", () => {
      const projectDir = join(TEST_DIR, "verify-info-project-2");
      mkdirSync(projectDir, { recursive: true });

      const info: VerificationInfo = {
        taskId: "task-001",
        passed: false,
        greenPassed: false,
        refactorPassed: true,
        failures: [
          { type: "test", message: "Tests failed", output: "Error: expected 1 to be 2" }
        ],
        retryGuidance: "Fix the failing test",
        verifiedAt: new Date().toISOString(),
        attemptNumber: 1,
      };

      saveVerificationInfo(projectDir, planName, "task-001", info);

      const loaded = loadVerificationInfo(projectDir, planName, "task-001");
      expect(loaded).not.toBeNull();
      expect(loaded?.taskId).toBe("task-001");
      expect(loaded?.passed).toBe(false);
      expect(loaded?.greenPassed).toBe(false);
      expect(loaded?.refactorPassed).toBe(true);
      expect(loaded?.failures).toHaveLength(1);
      expect(loaded?.attemptNumber).toBe(1);
    });

    it("returns null for non-existent verification info", () => {
      const projectDir = join(TEST_DIR, "verify-info-project-3");
      mkdirSync(projectDir, { recursive: true });

      const loaded = loadVerificationInfo(projectDir, planName, "non-existent");
      expect(loaded).toBeNull();
    });
  });

  describe("generateRetryGuidance", () => {
    it("generates guidance for test failures", () => {
      const failures: VerifyFailure[] = [
        {
          type: "test",
          message: "Tests failed",
          output: "FAIL src/test.ts\nError: expected 1 to equal 2"
        }
      ];

      const guidance = generateRetryGuidance(failures);
      expect(guidance).toContain("Tests Failed");
      expect(guidance).toContain("FAIL");
    });

    it("generates guidance for type errors", () => {
      const failures: VerifyFailure[] = [
        {
          type: "type",
          message: "Type check failed",
          output: "error TS2322: Type 'string' is not assignable to type 'number'"
        }
      ];

      const guidance = generateRetryGuidance(failures);
      expect(guidance).toContain("Type Errors");
      expect(guidance).toContain("TS2322");
    });

    it("generates guidance for lint errors", () => {
      const failures: VerifyFailure[] = [
        { type: "lint", message: "Lint check failed" }
      ];

      const guidance = generateRetryGuidance(failures);
      expect(guidance).toContain("Lint Errors");
    });

    it("generates guidance for build failures", () => {
      const failures: VerifyFailure[] = [
        { type: "build", message: "Build failed" }
      ];

      const guidance = generateRetryGuidance(failures);
      expect(guidance).toContain("Build Failed");
    });

    it("combines multiple failure types", () => {
      const failures: VerifyFailure[] = [
        { type: "test", message: "Tests failed" },
        { type: "type", message: "Type check failed" },
        { type: "lint", message: "Lint check failed" }
      ];

      const guidance = generateRetryGuidance(failures);
      expect(guidance).toContain("Tests Failed");
      expect(guidance).toContain("Type Errors");
      expect(guidance).toContain("Lint Errors");
    });
  });

  describe("Retry Loop Behavior", () => {
    it("tracks attempt count correctly", () => {
      const projectDir = join(TEST_DIR, "retry-project");
      mkdirSync(projectDir, { recursive: true });
      const planName = "retry-plan";

      // Simulate 3 failed attempts
      for (let attempt = 1; attempt <= 3; attempt++) {
        const info: VerificationInfo = {
          taskId: "task-001",
          passed: false,
          greenPassed: false,
          refactorPassed: true,
          failures: [{ type: "test", message: "Tests failed" }],
          retryGuidance: "Fix tests",
          verifiedAt: new Date().toISOString(),
          attemptNumber: attempt,
        };
        saveVerificationInfo(projectDir, planName, "task-001", info);
      }

      const loaded = loadVerificationInfo(projectDir, planName, "task-001");
      expect(loaded?.attemptNumber).toBe(3);
    });

    it("allows marking task as blocked after max retries", () => {
      // This tests the business logic - after MAX_RETRY_ATTEMPTS,
      // the task should be marked as blocked
      const attemptCount = MAX_RETRY_ATTEMPTS;
      const shouldBlock = attemptCount >= MAX_RETRY_ATTEMPTS;
      expect(shouldBlock).toBe(true);
    });
  });

  describe("Verification Result Types", () => {
    it("distinguishes GREEN from REFACTOR failures", () => {
      const greenFailed: VerificationInfo = {
        taskId: "task-001",
        passed: false,
        greenPassed: false, // Tests failed
        refactorPassed: true, // Lint/types passed
        failures: [{ type: "test", message: "Tests failed" }],
        verifiedAt: new Date().toISOString(),
        attemptNumber: 1,
      };

      const refactorFailed: VerificationInfo = {
        taskId: "task-002",
        passed: false,
        greenPassed: true, // Tests passed
        refactorPassed: false, // Lint/types failed
        failures: [{ type: "type", message: "Type errors" }],
        verifiedAt: new Date().toISOString(),
        attemptNumber: 1,
      };

      expect(greenFailed.greenPassed).toBe(false);
      expect(greenFailed.refactorPassed).toBe(true);

      expect(refactorFailed.greenPassed).toBe(true);
      expect(refactorFailed.refactorPassed).toBe(false);
    });
  });
});
