/**
 * Test Validation Agent
 *
 * Validates tests written by the test subagent before the main agent runs.
 * Uses a compilation gate approach:
 * 1. Compilation Gate - Do tests compile?
 * 2. Execution Gate - Do tests run and fail (not error)?
 * 3. Failure Analysis - Are they failing for the right reason?
 *
 * If validation fails, attempts to self-fix using Claude SDK.
 */

import { query, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTemplate } from "../../core/templates";
import { createSecurePermissionCallback } from "../../core/security";
import { BUILTIN_TOOLS } from "../../core/mcp";
import type { AgentTask, ExecuteState } from "../../core/state";
import type { TestInfo } from "../test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

// Maximum number of fix attempts before giving up
const MAX_FIX_ATTEMPTS = 2;

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  compilationPassed: boolean;
  executionPassed: boolean; // tests ran (even if failed)
  failureType: "missing_impl" | "runtime_error" | "compilation_error" | "none";
  issues: ValidationIssue[];
  fixApplied?: boolean;
}

export interface ValidationIssue {
  type: "compilation" | "runtime" | "semantic";
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface ValidationInfo {
  taskId: string;
  result: ValidationResult;
  validatedAt: string;
  fixAttempts: number;
}

// ============================================================================
// Directory Management
// ============================================================================

export function getValidationDir(projectDir: string, planName: string): string {
  return resolve(projectDir, ".mizu", planName, "validation");
}

export function ensureValidationDir(projectDir: string, planName: string): void {
  const dir = getValidationDir(projectDir, planName);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// Persistence
// ============================================================================

export function saveValidationInfo(
  projectDir: string,
  planName: string,
  taskId: string,
  info: ValidationInfo
): void {
  ensureValidationDir(projectDir, planName);
  const filePath = join(getValidationDir(projectDir, planName), `${taskId}.json`);
  writeFileSync(filePath, JSON.stringify(info, null, 2));
}

export function loadValidationInfo(
  projectDir: string,
  planName: string,
  taskId: string
): ValidationInfo | null {
  const filePath = join(getValidationDir(projectDir, planName), `${taskId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ============================================================================
// Compilation Gate
// ============================================================================

interface CompilationResult {
  passed: boolean;
  errors: string[];
  output: string;
}

export async function runCompilationGate(
  projectDir: string,
  testFiles: string[]
): Promise<CompilationResult> {
  // Check if tsconfig exists (TypeScript project)
  const hasTsConfig = existsSync(join(projectDir, "tsconfig.json"));
  if (!hasTsConfig) {
    // Not a TypeScript project, skip compilation gate
    return { passed: true, errors: [], output: "No tsconfig.json found - skipping TypeScript check" };
  }

  // Run tsc --noEmit on the test files
  const command = `npx tsc --noEmit ${testFiles.join(" ")}`;

  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd: projectDir,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const output = stdout + stderr;
      const errors = extractTypeScriptErrors(output);

      resolve({
        passed: code === 0,
        errors,
        output: output.slice(-4000), // Limit output size
      });
    });

    child.on("error", (err) => {
      resolve({
        passed: false,
        errors: [`Failed to run TypeScript compiler: ${err.message}`],
        output: err.message,
      });
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      child.kill();
      resolve({
        passed: false,
        errors: ["TypeScript compilation timed out"],
        output: "Compilation timed out after 60 seconds",
      });
    }, 60000);
  });
}

function extractTypeScriptErrors(output: string): string[] {
  const errors: string[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Match TypeScript error format: file.ts(line,col): error TS1234: message
    if (line.includes("error TS") || line.includes("Error:")) {
      errors.push(line.trim());
    }
  }

  return errors;
}

// ============================================================================
// Execution Gate
// ============================================================================

interface ExecutionResult {
  ran: boolean; // Tests actually ran (vs errored during setup)
  failed: boolean; // Tests failed (expected in RED phase)
  exitCode: number;
  output: string;
}

export async function runExecutionGate(
  projectDir: string,
  testCommand: string
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", testCommand], {
      cwd: projectDir,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const output = stdout + stderr;
      const exitCode = code ?? 1;

      // Determine if tests ran vs errored
      const ran = didTestsRun(output, exitCode);
      const failed = exitCode !== 0;

      resolve({
        ran,
        failed,
        exitCode,
        output: output.slice(-4000),
      });
    });

    child.on("error", (err) => {
      resolve({
        ran: false,
        failed: true,
        exitCode: 1,
        output: err.message,
      });
    });

    // Timeout after 120 seconds
    setTimeout(() => {
      child.kill();
      resolve({
        ran: false,
        failed: true,
        exitCode: 1,
        output: "Test execution timed out after 120 seconds",
      });
    }, 120000);
  });
}

/**
 * Determine if tests actually ran vs errored during setup/compilation
 */
function didTestsRun(output: string, exitCode: number): boolean {
  const lowerOutput = output.toLowerCase();

  // Indicators that tests actually ran
  const testRanIndicators = [
    "pass",
    "fail",
    "tests",
    "test suites",
    "expect",
    "assertion",
    "✓",
    "✗",
    "●",
    "bun test",
    "jest",
    "vitest",
    "mocha",
  ];

  // Indicators of setup/compilation errors (tests didn't run)
  const errorIndicators = [
    "syntaxerror",
    "cannot find module",
    "module not found",
    "error ts",
    "typeerror: cannot",
    "referenceerror",
    "is not defined",
    "is not a function",
    "cannot read propert",
    "unexpected token",
  ];

  // Check for error indicators first
  for (const indicator of errorIndicators) {
    if (lowerOutput.includes(indicator)) {
      return false;
    }
  }

  // Check for test ran indicators
  for (const indicator of testRanIndicators) {
    if (lowerOutput.includes(indicator)) {
      return true;
    }
  }

  // If exit code is 0, tests passed (they ran)
  if (exitCode === 0) {
    return true;
  }

  // Default: assume tests didn't run properly
  return false;
}

// ============================================================================
// Failure Analysis
// ============================================================================

export type FailureType = "missing_impl" | "runtime_error" | "compilation_error" | "none";

export function analyzeFailureType(output: string, compilationPassed: boolean): FailureType {
  if (!compilationPassed) {
    return "compilation_error";
  }

  const lowerOutput = output.toLowerCase();

  // Runtime error patterns - indicate bugs in tests
  const runtimeErrorPatterns = [
    "typeerror:",
    "referenceerror:",
    "syntaxerror:",
    "cannot read propert",
    "is not a function",
    "is not defined",
    "cannot destructure",
    "undefined is not",
    "null is not",
    "cannot find module",
    "module not found",
  ];

  for (const pattern of runtimeErrorPatterns) {
    if (lowerOutput.includes(pattern)) {
      return "runtime_error";
    }
  }

  // Missing implementation patterns - expected in RED phase
  const missingImplPatterns = [
    "expected",
    "tobe",
    "toequal",
    "tohave",
    "tomatch",
    "assertion failed",
    "assert.",
    "expect(",
  ];

  for (const pattern of missingImplPatterns) {
    if (lowerOutput.includes(pattern)) {
      return "missing_impl";
    }
  }

  return "none";
}

// ============================================================================
// Issue Extraction
// ============================================================================

export function extractIssues(
  compilationResult: CompilationResult,
  executionResult: ExecutionResult,
  failureType: FailureType
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Add compilation errors
  for (const error of compilationResult.errors) {
    const parsed = parseTypeScriptError(error);
    issues.push({
      type: "compilation",
      message: parsed.message,
      file: parsed.file,
      line: parsed.line,
      suggestion: getCompilationSuggestion(error),
    });
  }

  // Add runtime errors if tests didn't run
  if (!executionResult.ran && failureType === "runtime_error") {
    const runtimeErrors = extractRuntimeErrors(executionResult.output);
    for (const error of runtimeErrors) {
      issues.push({
        type: "runtime",
        message: error,
        suggestion: getRuntimeSuggestion(error),
      });
    }
  }

  return issues;
}

function parseTypeScriptError(error: string): { message: string; file?: string; line?: number } {
  // Parse: file.ts(line,col): error TS1234: message
  const match = error.match(/^(.+?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+)$/);
  if (match) {
    return {
      file: match[1],
      line: parseInt(match[2], 10),
      message: match[3],
    };
  }
  return { message: error };
}

function extractRuntimeErrors(output: string): string[] {
  const errors: string[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("typeerror") ||
      lower.includes("referenceerror") ||
      lower.includes("syntaxerror") ||
      lower.includes("cannot read") ||
      lower.includes("is not a function") ||
      lower.includes("is not defined")
    ) {
      errors.push(line.trim());
    }
  }

  return errors.slice(0, 5); // Limit to first 5 errors
}

function getCompilationSuggestion(error: string): string | undefined {
  const lower = error.toLowerCase();

  if (lower.includes("cannot find name") || lower.includes("is not defined")) {
    return "Check imports - the referenced identifier may need to be imported";
  }
  if (lower.includes("type") && lower.includes("is not assignable")) {
    return "Type mismatch - check that the types are compatible";
  }
  if (lower.includes("cannot use import statement")) {
    return "Module system issue - check tsconfig.json module settings";
  }

  return undefined;
}

function getRuntimeSuggestion(error: string): string | undefined {
  const lower = error.toLowerCase();

  if (lower.includes("cannot destructure") || lower.includes("undefined is not")) {
    return "Trying to destructure from undefined - check that the import/value exists at runtime";
  }
  if (lower.includes("is not a function")) {
    return "Calling something that isn't a function - check the import is correct";
  }
  if (lower.includes("cannot find module")) {
    return "Module not found - check the import path and that dependencies are installed";
  }

  return undefined;
}

// ============================================================================
// Main Validation Function
// ============================================================================

export async function runValidation(
  task: AgentTask,
  state: ExecuteState,
  testInfo: TestInfo
): Promise<ValidationResult> {
  const { projectDir, planName } = state;

  console.log("Running validation gates...\n");

  // Gate 1: Compilation
  console.log("1. Compilation Gate");
  const compilationResult = await runCompilationGate(projectDir, testInfo.testFiles);
  if (compilationResult.passed) {
    console.log("   ✓ Tests compile successfully\n");
  } else {
    console.log("   ✗ Compilation errors found:\n");
    for (const error of compilationResult.errors.slice(0, 3)) {
      console.log(`     ${error}`);
    }
    console.log();
  }

  // Gate 2: Execution
  console.log("2. Execution Gate");
  const executionResult = await runExecutionGate(projectDir, testInfo.testCommand);
  if (executionResult.ran) {
    if (executionResult.failed) {
      console.log("   ✓ Tests ran and failed (expected in RED phase)\n");
    } else {
      console.log("   ⚠ Tests passed (unexpected - feature may exist)\n");
    }
  } else {
    console.log("   ✗ Tests errored - did not run properly\n");
  }

  // Gate 3: Failure Analysis
  console.log("3. Failure Analysis");
  const failureType = analyzeFailureType(executionResult.output, compilationResult.passed);
  switch (failureType) {
    case "missing_impl":
      console.log("   ✓ Failing due to missing implementation (correct)\n");
      break;
    case "runtime_error":
      console.log("   ✗ Failing due to runtime error (test bug)\n");
      break;
    case "compilation_error":
      console.log("   ✗ Failing due to compilation error (test bug)\n");
      break;
    case "none":
      console.log("   ? Unable to determine failure type\n");
      break;
  }

  // Extract issues
  const issues = extractIssues(compilationResult, executionResult, failureType);

  // Determine if valid
  const valid =
    compilationResult.passed &&
    executionResult.ran &&
    (failureType === "missing_impl" || failureType === "none");

  const result: ValidationResult = {
    valid,
    compilationPassed: compilationResult.passed,
    executionPassed: executionResult.ran,
    failureType,
    issues,
  };

  // Save validation info
  const info: ValidationInfo = {
    taskId: task.id,
    result,
    validatedAt: new Date().toISOString(),
    fixAttempts: 0,
  };
  saveValidationInfo(projectDir, planName, task.id, info);

  return result;
}

// ============================================================================
// Self-Fix Capability
// ============================================================================

const FIX_SYSTEM_PROMPT = `You are a Test Fix Agent. Your job is to fix bugs in test files.

You fix tests that have:
- TypeScript compilation errors
- Runtime errors (TypeError, ReferenceError, etc.)
- Import issues

You do NOT:
- Change test assertions or expected values
- Add new tests
- Implement the actual feature being tested

After your fixes, tests should still FAIL (because the feature isn't implemented), but they should fail for the RIGHT reason (missing implementation), not because of bugs in the test code.

Common fix patterns:
1. TypeScript type imports: Use 'import type { X }' for types, not dynamic destructuring
2. Missing imports: Add the required import statements
3. Undefined access: Add null checks or ensure values exist before accessing`;

function getFixPrompt(
  task: AgentTask,
  testInfo: TestInfo,
  issues: ValidationIssue[],
  projectDir: string
): string {
  const issueText = issues
    .map((issue, i) => {
      let text = `${i + 1}. [${issue.type.toUpperCase()}] ${issue.message}`;
      if (issue.file) text += `\n   File: ${issue.file}`;
      if (issue.line) text += `, Line: ${issue.line}`;
      if (issue.suggestion) text += `\n   Suggestion: ${issue.suggestion}`;
      return text;
    })
    .join("\n\n");

  const testFilesText = testInfo.testFiles.length > 0
    ? testInfo.testFiles.join(", ")
    : "Check the project for recently created test files";

  return `# Test Fix Task

## Task Being Tested
ID: ${task.id}
Description: ${task.description}

## Issues Found
${issueText || "No specific issues extracted, but validation failed."}

## Test Files
${testFilesText}

## Instructions
1. Read the test file(s) mentioned above
2. Identify the specific bugs causing compilation or runtime errors
3. Fix the bugs while preserving the test logic
4. After fixing, tests should still fail (feature not implemented), but they should RUN without errors

Project directory: ${projectDir}`;
}

export interface FixResult {
  fixed: boolean;
  error?: string;
}

export async function attemptFix(
  task: AgentTask,
  state: ExecuteState,
  testInfo: TestInfo,
  issues: ValidationIssue[],
  model: string = "claude-sonnet-4-5"
): Promise<FixResult> {
  const { projectDir } = state;

  console.log("\n--- Fix Agent: Attempting to fix test issues ---\n");

  const prompt = getFixPrompt(task, testInfo, issues, projectDir);

  try {
    const response = query({
      prompt,
      options: {
        model,
        cwd: projectDir,
        systemPrompt: FIX_SYSTEM_PROMPT,
        permissionMode: "acceptEdits",
        canUseTool: createSecurePermissionCallback("execute"),
        allowedTools: [...BUILTIN_TOOLS],
        maxTurns: 20, // Limited turns for fixing
        settingSources: ["user", "project"] as SettingSource[],
      },
    });

    for await (const message of response) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      } else if (message.type === "stream_event") {
        if (message.event.type === "content_block_start") {
          const block = message.event.content_block;
          if (block.type === "tool_use") {
            console.log(`\n[Tool: ${block.name}]`);
          }
        }
      }
    }

    console.log("\n");
    return { fixed: true };
  } catch (error) {
    const err = error as Error;
    console.error(`Fix agent error: ${err.message}`);
    return { fixed: false, error: err.message };
  }
}

// ============================================================================
// Validation with Self-Fix
// ============================================================================

export async function runValidationWithFix(
  task: AgentTask,
  state: ExecuteState,
  testInfo: TestInfo,
  model: string = "claude-sonnet-4-5"
): Promise<ValidationResult> {
  const { projectDir, planName } = state;

  // Initial validation
  let result = await runValidation(task, state, testInfo);
  let fixAttempts = 0;

  // If validation failed and we have fixable issues, attempt to fix
  while (!result.valid && fixAttempts < MAX_FIX_ATTEMPTS) {
    // Only attempt fix for compilation or runtime errors (not for "tests passed unexpectedly")
    if (result.failureType !== "compilation_error" && result.failureType !== "runtime_error") {
      break;
    }

    fixAttempts++;
    console.log(`\n=== Fix Attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS} ===\n`);

    const fixResult = await attemptFix(task, state, testInfo, result.issues, model);

    if (!fixResult.fixed) {
      console.log(`Fix attempt failed: ${fixResult.error}`);
      break;
    }

    // Re-validate after fix
    console.log("\n--- Re-validating after fix ---\n");
    result = await runValidation(task, state, testInfo);

    if (result.valid) {
      result.fixApplied = true;
      console.log("✓ Fix successful - tests now valid\n");
    }
  }

  // Update validation info with fix attempts
  const info: ValidationInfo = {
    taskId: task.id,
    result,
    validatedAt: new Date().toISOString(),
    fixAttempts,
  };
  saveValidationInfo(projectDir, planName, task.id, info);

  return result;
}
