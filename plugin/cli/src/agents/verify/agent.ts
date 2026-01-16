/**
 * Verification Subagent (GREEN + REFACTOR Phase)
 *
 * Runs AFTER the main agent to verify work quality.
 * Can reject work and trigger retry loop.
 *
 * Checks:
 * 1. Tests pass (GREEN)
 * 2. Lint/type checks pass (REFACTOR)
 * 3. Code quality review
 *
 * Flow:
 * 1. Run test command
 * 2. Run quality checks (lint, type, build)
 * 3. Review implementation
 * 4. Return pass/fail with guidance
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import type { AgentTask, ExecuteState } from "../../core/state";
import { loadAndRenderPrompt, type PromptContext } from "../../core/prompts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

// =============================================================================
// Types
// =============================================================================

export interface VerifyFailure {
  type: "test" | "lint" | "type" | "build" | "review";
  message: string;
  output?: string;
}

export interface VerifyResult {
  passed: boolean;
  greenPassed: boolean; // Tests pass
  refactorPassed: boolean; // Lint/types clean
  failures: VerifyFailure[];
  retryGuidance?: string;
}

export interface VerificationInfo {
  taskId: string;
  passed: boolean;
  greenPassed: boolean;
  refactorPassed: boolean;
  failures: VerifyFailure[];
  retryGuidance?: string;
  verifiedAt: string;
  attemptNumber: number;
}

// =============================================================================
// Constants
// =============================================================================

export const MAX_RETRY_ATTEMPTS = 3;

// =============================================================================
// Directory Management
// =============================================================================

export function getVerificationDir(projectDir: string, planName: string): string {
  return resolve(projectDir, ".mizu", planName, "verification");
}

export function ensureVerificationDir(projectDir: string, planName: string): void {
  const dir = getVerificationDir(projectDir, planName);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function saveVerificationInfo(
  projectDir: string,
  planName: string,
  taskId: string,
  info: VerificationInfo
): void {
  ensureVerificationDir(projectDir, planName);
  const filePath = resolve(getVerificationDir(projectDir, planName), `${taskId}.json`);
  writeFileSync(filePath, JSON.stringify(info, null, 2));
}

export function loadVerificationInfo(
  projectDir: string,
  planName: string,
  taskId: string
): VerificationInfo | null {
  const filePath = resolve(getVerificationDir(projectDir, planName), `${taskId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as VerificationInfo;
  } catch {
    return null;
  }
}

// =============================================================================
// Command Detection
// =============================================================================

export interface QualityCommands {
  testCommand: string;
  typeCommand?: string;
  lintCommand?: string;
  buildCommand?: string;
}

export function detectQualityCommands(projectDir: string): QualityCommands {
  const commands: QualityCommands = {
    testCommand: "npm test",
  };

  const packageJsonPath = resolve(projectDir, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const scripts = pkg.scripts || {};

      if (scripts.test) commands.testCommand = "npm test";
      if (scripts.typecheck) commands.typeCommand = "npm run typecheck";
      if (scripts["type-check"]) commands.typeCommand = "npm run type-check";
      if (scripts.lint) commands.lintCommand = "npm run lint";
      if (scripts.build) commands.buildCommand = "npm run build";
    } catch {
      // Ignore parse errors
    }
  }

  // Check for bun
  const bunLockPath = resolve(projectDir, "bun.lockb");
  if (existsSync(bunLockPath)) {
    commands.testCommand = "bun test";
  }

  // Check for TypeScript config (adds type check if not already set)
  const tsconfigPath = resolve(projectDir, "tsconfig.json");
  if (existsSync(tsconfigPath) && !commands.typeCommand) {
    commands.typeCommand = "npx tsc --noEmit";
  }

  return commands;
}

// =============================================================================
// Command Execution
// =============================================================================

async function runCommand(
  command: string,
  projectDir: string,
  timeoutMs: number = 120000
): Promise<{ passed: boolean; output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd: projectDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode) => {
      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");
      resolve({
        passed: exitCode === 0,
        output: output.slice(-4000),
        exitCode: exitCode ?? 1,
      });
    });

    child.on("error", (err) => {
      resolve({
        passed: false,
        output: `Failed to run: ${err.message}`,
        exitCode: 1,
      });
    });

    setTimeout(() => {
      child.kill();
      resolve({
        passed: false,
        output: `Command timed out after ${timeoutMs / 1000} seconds`,
        exitCode: 124,
      });
    }, timeoutMs);
  });
}

// =============================================================================
// Verification Logic
// =============================================================================

export async function runVerification(
  task: AgentTask,
  state: ExecuteState,
  attemptNumber: number = 1
): Promise<VerifyResult> {
  const projectDir = state.projectDir;
  const commands = detectQualityCommands(projectDir);
  const failures: VerifyFailure[] = [];

  console.log(`\n=== Verification Subagent: Task ${task.id} (Attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS}) ===\n`);

  // Use task's verification command if specified
  const testCommand = task.verificationCommand || commands.testCommand;

  // Step 1: GREEN - Run tests
  console.log(`Running tests: ${testCommand}`);
  const testResult = await runCommand(testCommand, projectDir);
  const greenPassed = testResult.passed;

  if (!greenPassed) {
    console.log(`✗ Tests failed (exit code ${testResult.exitCode})`);
    failures.push({
      type: "test",
      message: "Tests failed",
      output: testResult.output,
    });
  } else {
    console.log("✓ Tests passed");
  }

  // Step 2: REFACTOR - Run quality checks
  let refactorPassed = true;

  // Type check
  if (commands.typeCommand) {
    console.log(`Running type check: ${commands.typeCommand}`);
    const typeResult = await runCommand(commands.typeCommand, projectDir);
    if (!typeResult.passed) {
      console.log(`✗ Type check failed`);
      refactorPassed = false;
      failures.push({
        type: "type",
        message: "Type check failed",
        output: typeResult.output,
      });
    } else {
      console.log("✓ Type check passed");
    }
  }

  // Lint check
  if (commands.lintCommand) {
    console.log(`Running lint: ${commands.lintCommand}`);
    const lintResult = await runCommand(commands.lintCommand, projectDir);
    if (!lintResult.passed) {
      console.log(`✗ Lint failed`);
      refactorPassed = false;
      failures.push({
        type: "lint",
        message: "Lint check failed",
        output: lintResult.output,
      });
    } else {
      console.log("✓ Lint passed");
    }
  }

  // Build check (optional, only if build script exists)
  if (commands.buildCommand) {
    console.log(`Running build: ${commands.buildCommand}`);
    const buildResult = await runCommand(commands.buildCommand, projectDir, 180000); // 3 min for builds
    if (!buildResult.passed) {
      console.log(`✗ Build failed`);
      refactorPassed = false;
      failures.push({
        type: "build",
        message: "Build failed",
        output: buildResult.output,
      });
    } else {
      console.log("✓ Build passed");
    }
  }

  // Generate retry guidance if there are failures
  let retryGuidance: string | undefined;
  if (failures.length > 0) {
    retryGuidance = generateRetryGuidance(failures);
  }

  const passed = greenPassed && refactorPassed;

  // Save verification info
  const info: VerificationInfo = {
    taskId: task.id,
    passed,
    greenPassed,
    refactorPassed,
    failures,
    retryGuidance,
    verifiedAt: new Date().toISOString(),
    attemptNumber,
  };
  saveVerificationInfo(projectDir, state.planName, task.id, info);

  // Print summary
  console.log(`\n--- Verification ${passed ? "PASSED" : "FAILED"} ---`);
  if (!passed && retryGuidance) {
    console.log(`\nGuidance for retry:\n${retryGuidance}\n`);
  }

  return {
    passed,
    greenPassed,
    refactorPassed,
    failures,
    retryGuidance,
  };
}

// =============================================================================
// Retry Guidance Generation
// =============================================================================

function generateRetryGuidance(failures: VerifyFailure[]): string {
  const lines: string[] = ["Fix the following issues:"];

  for (const failure of failures) {
    switch (failure.type) {
      case "test":
        lines.push(`\n**Tests Failed:**`);
        lines.push("- Review the test output below and fix the failing tests");
        if (failure.output) {
          // Extract key error lines
          const errorLines = failure.output
            .split("\n")
            .filter(line =>
              line.includes("FAIL") ||
              line.includes("Error") ||
              line.includes("expected") ||
              line.includes("AssertionError")
            )
            .slice(0, 10);
          if (errorLines.length > 0) {
            lines.push("- Key errors: " + errorLines.join("; "));
          }
        }
        break;

      case "type":
        lines.push(`\n**Type Errors:**`);
        lines.push("- Fix TypeScript type errors");
        if (failure.output) {
          // Extract type error locations
          const typeErrors = failure.output
            .split("\n")
            .filter(line => line.includes("error TS"))
            .slice(0, 5);
          if (typeErrors.length > 0) {
            lines.push("- Errors: " + typeErrors.join("; "));
          }
        }
        break;

      case "lint":
        lines.push(`\n**Lint Errors:**`);
        lines.push("- Fix linting issues");
        break;

      case "build":
        lines.push(`\n**Build Failed:**`);
        lines.push("- Fix build errors before continuing");
        break;

      case "review":
        lines.push(`\n**Code Review Issues:**`);
        lines.push(`- ${failure.message}`);
        break;
    }
  }

  return lines.join("\n");
}

// =============================================================================
// Exports
// =============================================================================

export { generateRetryGuidance };
