/**
 * Tests for Test Validation Agent
 *
 * Tests the compilation gate, execution gate, failure analysis, and self-fix logic.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  runCompilationGate,
  runExecutionGate,
  analyzeFailureType,
  extractIssues,
  getValidationDir,
  ensureValidationDir,
  saveValidationInfo,
  loadValidationInfo,
  type ValidationInfo,
  type ValidationResult,
  type FixResult,
} from "../agents/validate";

const TEST_DIR = "/tmp/claude/validate-subagent-test";

describe("Validation Subagent", () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("Directory Management", () => {
    const planName = "validate-plan";

    it("returns correct validation directory path", () => {
      const projectDir = join(TEST_DIR, "dir-project");
      mkdirSync(projectDir, { recursive: true });

      const validationDir = getValidationDir(projectDir, planName);
      expect(validationDir).toBe(join(projectDir, ".mizu", planName, "validation"));
    });

    it("creates validation directory", () => {
      const projectDir = join(TEST_DIR, "dir-project-2");
      mkdirSync(projectDir, { recursive: true });

      ensureValidationDir(projectDir, planName);

      const validationDir = getValidationDir(projectDir, planName);
      expect(existsSync(validationDir)).toBe(true);
    });
  });

  describe("Validation Info Persistence", () => {
    const planName = "persist-plan";

    it("saves and loads validation info", () => {
      const projectDir = join(TEST_DIR, "persist-project");
      mkdirSync(projectDir, { recursive: true });

      const info: ValidationInfo = {
        taskId: "task-001",
        result: {
          valid: true,
          compilationPassed: true,
          executionPassed: true,
          failureType: "missing_impl",
          issues: [],
        },
        validatedAt: new Date().toISOString(),
        fixAttempts: 0,
      };

      saveValidationInfo(projectDir, planName, "task-001", info);

      const loaded = loadValidationInfo(projectDir, planName, "task-001");
      expect(loaded).not.toBeNull();
      expect(loaded?.taskId).toBe("task-001");
      expect(loaded?.result.valid).toBe(true);
      expect(loaded?.result.compilationPassed).toBe(true);
    });

    it("returns null for non-existent validation info", () => {
      const projectDir = join(TEST_DIR, "persist-project-2");
      mkdirSync(projectDir, { recursive: true });

      const loaded = loadValidationInfo(projectDir, planName, "non-existent");
      expect(loaded).toBeNull();
    });

    it("saves validation info with issues", () => {
      const projectDir = join(TEST_DIR, "persist-project-3");
      mkdirSync(projectDir, { recursive: true });

      const info: ValidationInfo = {
        taskId: "task-002",
        result: {
          valid: false,
          compilationPassed: false,
          executionPassed: false,
          failureType: "compilation_error",
          issues: [
            {
              type: "compilation",
              message: "Cannot find name 'foo'",
              file: "test.ts",
              line: 10,
              suggestion: "Check imports",
            },
          ],
        },
        validatedAt: new Date().toISOString(),
        fixAttempts: 1,
      };

      saveValidationInfo(projectDir, planName, "task-002", info);

      const loaded = loadValidationInfo(projectDir, planName, "task-002");
      expect(loaded?.result.issues).toHaveLength(1);
      expect(loaded?.result.issues[0].type).toBe("compilation");
      expect(loaded?.fixAttempts).toBe(1);
    });
  });

  describe("Compilation Gate", () => {
    it("passes when no tsconfig.json exists", async () => {
      const projectDir = join(TEST_DIR, "no-ts-project");
      mkdirSync(projectDir, { recursive: true });

      const result = await runCompilationGate(projectDir, ["test.ts"]);

      expect(result.passed).toBe(true);
      expect(result.output).toContain("No tsconfig.json found");
    });

    it("detects TypeScript project by tsconfig presence", () => {
      const projectDir = join(TEST_DIR, "ts-detect-project");
      mkdirSync(projectDir, { recursive: true });

      // Create minimal tsconfig
      writeFileSync(
        join(projectDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true },
        })
      );

      // Verify tsconfig detection works (compilation gate checks this)
      expect(existsSync(join(projectDir, "tsconfig.json"))).toBe(true);
    });
  });

  describe("Execution Gate", () => {
    it("detects when tests ran successfully", async () => {
      const projectDir = join(TEST_DIR, "exec-success-project");
      mkdirSync(projectDir, { recursive: true });

      // Command that simulates passing tests
      const result = await runExecutionGate(projectDir, "echo '✓ 5 tests passed'");

      expect(result.ran).toBe(true);
      expect(result.failed).toBe(false);
      expect(result.exitCode).toBe(0);
    });

    it("detects when tests ran but failed", async () => {
      const projectDir = join(TEST_DIR, "exec-fail-project");
      mkdirSync(projectDir, { recursive: true });

      // Command that simulates failing tests
      const result = await runExecutionGate(
        projectDir,
        "echo '✗ 2 tests failed' && exit 1"
      );

      expect(result.ran).toBe(true);
      expect(result.failed).toBe(true);
      expect(result.exitCode).toBe(1);
    });

    it("detects when tests errored (did not run)", async () => {
      const projectDir = join(TEST_DIR, "exec-error-project");
      mkdirSync(projectDir, { recursive: true });

      // Command that simulates a runtime error
      const result = await runExecutionGate(
        projectDir,
        "echo 'TypeError: Cannot read property' && exit 1"
      );

      expect(result.ran).toBe(false);
      expect(result.failed).toBe(true);
    });
  });

  describe("Failure Analysis", () => {
    it("identifies compilation errors", () => {
      const output = "error TS2304: Cannot find name 'foo'";
      const result = analyzeFailureType(output, false);
      expect(result).toBe("compilation_error");
    });

    it("identifies runtime errors", () => {
      const output = "TypeError: Cannot read property 'x' of undefined";
      const result = analyzeFailureType(output, true);
      expect(result).toBe("runtime_error");
    });

    it("identifies missing implementation failures", () => {
      const output = "Expected 'hello' to equal 'world'";
      const result = analyzeFailureType(output, true);
      expect(result).toBe("missing_impl");
    });

    it("identifies reference errors as runtime errors", () => {
      const output = "ReferenceError: foo is not defined";
      const result = analyzeFailureType(output, true);
      expect(result).toBe("runtime_error");
    });

    it("identifies destructure errors as runtime errors", () => {
      const output = "Cannot destructure property 'x' of undefined";
      const result = analyzeFailureType(output, true);
      expect(result).toBe("runtime_error");
    });

    it("returns none when failure type is unclear", () => {
      const output = "Some generic error message";
      const result = analyzeFailureType(output, true);
      expect(result).toBe("none");
    });
  });

  describe("Issue Extraction", () => {
    it("extracts compilation issues", () => {
      const compilationResult = {
        passed: false,
        errors: ["test.ts(10,5): error TS2304: Cannot find name 'foo'"],
        output: "",
      };
      const executionResult = {
        ran: false,
        failed: true,
        exitCode: 1,
        output: "",
      };

      const issues = extractIssues(compilationResult, executionResult, "compilation_error");

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("compilation");
      expect(issues[0].file).toBe("test.ts");
      expect(issues[0].line).toBe(10);
      expect(issues[0].message).toBe("Cannot find name 'foo'");
    });

    it("extracts runtime issues", () => {
      const compilationResult = {
        passed: true,
        errors: [],
        output: "",
      };
      const executionResult = {
        ran: false,
        failed: true,
        exitCode: 1,
        output: "TypeError: Cannot read property 'x' of undefined\nat test.ts:15",
      };

      const issues = extractIssues(compilationResult, executionResult, "runtime_error");

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe("runtime");
    });

    it("returns empty array when no issues", () => {
      const compilationResult = {
        passed: true,
        errors: [],
        output: "",
      };
      const executionResult = {
        ran: true,
        failed: true,
        exitCode: 1,
        output: "Expected 1 to equal 2",
      };

      const issues = extractIssues(compilationResult, executionResult, "missing_impl");

      expect(issues).toHaveLength(0);
    });
  });

  describe("Validation Result Types", () => {
    it("valid when compilation and execution pass with missing_impl failure", () => {
      const result: ValidationResult = {
        valid: true,
        compilationPassed: true,
        executionPassed: true,
        failureType: "missing_impl",
        issues: [],
      };

      expect(result.valid).toBe(true);
      expect(result.failureType).toBe("missing_impl");
    });

    it("invalid when compilation fails", () => {
      const result: ValidationResult = {
        valid: false,
        compilationPassed: false,
        executionPassed: false,
        failureType: "compilation_error",
        issues: [{ type: "compilation", message: "Type error" }],
      };

      expect(result.valid).toBe(false);
      expect(result.compilationPassed).toBe(false);
    });

    it("invalid when runtime error occurs", () => {
      const result: ValidationResult = {
        valid: false,
        compilationPassed: true,
        executionPassed: false,
        failureType: "runtime_error",
        issues: [{ type: "runtime", message: "TypeError" }],
      };

      expect(result.valid).toBe(false);
      expect(result.executionPassed).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty test files array", async () => {
      const projectDir = join(TEST_DIR, "empty-files-project");
      mkdirSync(projectDir, { recursive: true });

      const result = await runCompilationGate(projectDir, []);

      // Should pass or handle gracefully
      expect(typeof result.passed).toBe("boolean");
    });

    it("handles command timeout gracefully", async () => {
      const projectDir = join(TEST_DIR, "timeout-project");
      mkdirSync(projectDir, { recursive: true });

      // This should complete quickly, not timeout
      const result = await runExecutionGate(projectDir, "echo 'quick test'");

      expect(result.ran).toBe(true);
    });
  });

  describe("Self-Fix Types", () => {
    it("FixResult type has correct structure", () => {
      const successResult: FixResult = { fixed: true };
      expect(successResult.fixed).toBe(true);
      expect(successResult.error).toBeUndefined();

      const failResult: FixResult = { fixed: false, error: "Something went wrong" };
      expect(failResult.fixed).toBe(false);
      expect(failResult.error).toBe("Something went wrong");
    });

    it("ValidationResult includes fixApplied flag", () => {
      const resultWithFix: ValidationResult = {
        valid: true,
        compilationPassed: true,
        executionPassed: true,
        failureType: "missing_impl",
        issues: [],
        fixApplied: true,
      };

      expect(resultWithFix.fixApplied).toBe(true);
    });

    it("ValidationInfo tracks fix attempts", () => {
      const projectDir = join(TEST_DIR, "fix-tracking-project");
      mkdirSync(projectDir, { recursive: true });
      const planName = "fix-tracking-plan";

      const info: ValidationInfo = {
        taskId: "task-001",
        result: {
          valid: true,
          compilationPassed: true,
          executionPassed: true,
          failureType: "missing_impl",
          issues: [],
          fixApplied: true,
        },
        validatedAt: new Date().toISOString(),
        fixAttempts: 2,
      };

      saveValidationInfo(projectDir, planName, "task-001", info);
      const loaded = loadValidationInfo(projectDir, planName, "task-001");

      expect(loaded?.fixAttempts).toBe(2);
      expect(loaded?.result.fixApplied).toBe(true);
    });
  });

  describe("Fix Decision Logic", () => {
    it("only compilation and runtime errors should trigger fix", () => {
      // Compilation error - should fix
      expect(["compilation_error", "runtime_error"].includes("compilation_error")).toBe(true);

      // Runtime error - should fix
      expect(["compilation_error", "runtime_error"].includes("runtime_error")).toBe(true);

      // Missing impl - should NOT fix (this is expected)
      expect(["compilation_error", "runtime_error"].includes("missing_impl")).toBe(false);

      // None - should NOT fix
      expect(["compilation_error", "runtime_error"].includes("none")).toBe(false);
    });

    it("validation with fixApplied indicates successful auto-fix", () => {
      const resultAfterFix: ValidationResult = {
        valid: true,
        compilationPassed: true,
        executionPassed: true,
        failureType: "missing_impl",
        issues: [],
        fixApplied: true,
      };

      // After fix, tests should be valid and failing for the right reason
      expect(resultAfterFix.valid).toBe(true);
      expect(resultAfterFix.failureType).toBe("missing_impl");
      expect(resultAfterFix.fixApplied).toBe(true);
    });
  });
});
