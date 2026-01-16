/**
 * Tests for Phase 1: Health Check and Verification Commands
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runVerificationCommand } from "../agents/execute/agent";

const TEST_DIR = "/tmp/claude/health-check-test";

describe("Health Check and Verification", () => {
  beforeAll(() => {
    // Create test directory
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("runVerificationCommand", () => {
    it("returns passed=true when command succeeds", async () => {
      const result = await runVerificationCommand("echo 'test passed'", TEST_DIR);
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("test passed");
    });

    it("returns passed=false when command fails", async () => {
      const result = await runVerificationCommand("exit 1", TEST_DIR);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("captures stdout and stderr", async () => {
      const result = await runVerificationCommand(
        "echo 'stdout message' && echo 'stderr message' >&2",
        TEST_DIR
      );
      expect(result.output).toContain("stdout message");
      expect(result.output).toContain("stderr message");
    });

    it("works with npm test commands", async () => {
      // Create a simple package.json and test
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({
          name: "test",
          scripts: { test: "echo 'tests pass'" }
        })
      );

      const result = await runVerificationCommand("npm test", TEST_DIR);
      expect(result.passed).toBe(true);
      expect(result.output).toContain("tests pass");
    });

    it("returns passed=false for non-existent commands", async () => {
      const result = await runVerificationCommand(
        "nonexistent_command_xyz",
        TEST_DIR
      );
      expect(result.passed).toBe(false);
    });

    it("uses correct working directory", async () => {
      const result = await runVerificationCommand("pwd", TEST_DIR);
      expect(result.passed).toBe(true);
      expect(result.output).toContain(TEST_DIR.replace("/tmp/", "/private/tmp/"));
    });
  });

  describe("Verification-based task completion", () => {
    it("can detect task completion via exit code 0", async () => {
      // Simulate the harness checking verification
      const verifyResult = await runVerificationCommand("exit 0", TEST_DIR);

      // This is how the harness determines completion
      const taskCompleted = verifyResult.passed;
      expect(taskCompleted).toBe(true);
    });

    it("can detect task failure via non-zero exit code", async () => {
      const verifyResult = await runVerificationCommand("exit 1", TEST_DIR);

      const taskCompleted = verifyResult.passed;
      expect(taskCompleted).toBe(false);
    });
  });
});
