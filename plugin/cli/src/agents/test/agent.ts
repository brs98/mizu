/**
 * Test Subagent (RED Phase)
 *
 * Runs BEFORE the main agent to write failing tests for each task.
 * This enforces true TDD: tests are written first, then implementation.
 *
 * Flow:
 * 1. Analyze task description
 * 2. Examine codebase for test patterns
 * 3. Write failing test(s) for the task
 * 4. Verify tests actually fail (RED)
 * 5. Save test info to .mizu/<plan>/tests/<task-id>.json
 */

import { query, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import type { AgentTask, ExecuteState } from "../../core/state";
import { loadAndRenderPrompt, type PromptContext } from "../../core/prompts";
import { createSecurePermissionCallback } from "../../core/security";
import { BUILTIN_TOOLS } from "../../core/mcp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

// =============================================================================
// Types
// =============================================================================

export interface TestSubagentResult {
  status: "red" | "green" | "error";
  testFiles: string[];
  testCommand: string;
  failureOutput?: string;
  error?: string;
}

export interface TestInfo {
  taskId: string;
  testFiles: string[];
  testCommand: string;
  status: "red" | "green" | "error";
  failureOutput?: string;
  createdAt: string;
}

// =============================================================================
// Directory Management
// =============================================================================

export function getTestsDir(projectDir: string, planName: string): string {
  return resolve(projectDir, ".mizu", planName, "tests");
}

export function ensureTestsDir(projectDir: string, planName: string): void {
  const testsDir = getTestsDir(projectDir, planName);
  if (!existsSync(testsDir)) {
    mkdirSync(testsDir, { recursive: true });
  }
}

export function saveTestInfo(
  projectDir: string,
  planName: string,
  taskId: string,
  testInfo: TestInfo
): void {
  ensureTestsDir(projectDir, planName);
  const filePath = resolve(getTestsDir(projectDir, planName), `${taskId}.json`);
  writeFileSync(filePath, JSON.stringify(testInfo, null, 2));
}

export function loadTestInfo(
  projectDir: string,
  planName: string,
  taskId: string
): TestInfo | null {
  const filePath = resolve(getTestsDir(projectDir, planName), `${taskId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as TestInfo;
  } catch {
    return null;
  }
}

// =============================================================================
// Test Command Detection
// =============================================================================

function detectTestCommand(projectDir: string): string {
  // Check for common test runners in order of preference
  const packageJsonPath = resolve(projectDir, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (pkg.scripts?.test) {
        return "npm test";
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for bun
  const bunLockPath = resolve(projectDir, "bun.lockb");
  if (existsSync(bunLockPath)) {
    return "bun test";
  }

  // Check for pytest
  const pytestPath = resolve(projectDir, "pytest.ini");
  const pyprojectPath = resolve(projectDir, "pyproject.toml");
  if (existsSync(pytestPath) || existsSync(pyprojectPath)) {
    return "pytest";
  }

  // Check for go
  const goModPath = resolve(projectDir, "go.mod");
  if (existsSync(goModPath)) {
    return "go test ./...";
  }

  // Default
  return "npm test";
}

// =============================================================================
// Prompt Generation
// =============================================================================

interface TestPromptContext extends PromptContext {
  task_id: string;
  task_description: string;
  project_dir: string;
  plan_name: string;
  test_command: string;
}

function getTestPrompt(
  task: AgentTask,
  state: ExecuteState,
  testCommand: string
): string {
  const context: TestPromptContext = {
    task_id: task.id,
    task_description: task.description,
    project_dir: state.projectDir,
    plan_name: state.planName,
    test_command: testCommand,
  };

  const promptFile = resolve(PROMPTS_DIR, "worker.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return `# Test Writing - Task ${task.id}

Write failing tests for: ${task.description}

Project: ${state.projectDir}

1. Analyze what needs to be tested
2. Write tests that FAIL (feature doesn't exist yet)
3. Run: ${testCommand}
4. Verify tests fail
5. Save test info to .mizu/${state.planName}/tests/${task.id}.json

Say "Tests written and verified RED" when done.`;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are a Test Writing Agent in a TDD workflow.

Your ONLY job is to write failing tests. You do NOT implement features.

Key principles:
1. Tests MUST fail - you're in the RED phase of TDD
2. Follow existing test patterns in the codebase
3. Write specific tests for the exact task description
4. Verify tests fail before finishing

You are methodical and thorough. You examine existing tests to match patterns.
You write clear, focused tests that define expected behavior.`;

// =============================================================================
// Run Verification
// =============================================================================

async function runTestCommand(
  command: string,
  projectDir: string
): Promise<{ passed: boolean; output: string }> {
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
      });
    });

    child.on("error", (err) => {
      resolve({
        passed: false,
        output: `Failed to run: ${err.message}`,
      });
    });

    // Timeout after 120 seconds
    setTimeout(() => {
      child.kill();
      resolve({
        passed: false,
        output: "Test command timed out after 120 seconds",
      });
    }, 120000);
  });
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runTestSubagent(
  task: AgentTask,
  state: ExecuteState,
  model: string = "claude-sonnet-4-5"
): Promise<TestSubagentResult> {
  const projectDir = state.projectDir;
  const testCommand = task.verificationCommand || detectTestCommand(projectDir);

  console.log(`\n--- Test Subagent: Writing tests for ${task.id} ---\n`);
  console.log(`Test command: ${testCommand}`);

  // Check if tests already exist for this task
  const existingTestInfo = loadTestInfo(projectDir, state.planName, task.id);
  if (existingTestInfo && existingTestInfo.status === "red") {
    console.log("Tests already exist and are in RED state. Skipping.");
    return {
      status: "red",
      testFiles: existingTestInfo.testFiles,
      testCommand: existingTestInfo.testCommand,
      failureOutput: existingTestInfo.failureOutput,
    };
  }

  // Generate prompt
  const prompt = getTestPrompt(task, state, testCommand);

  // Run the test subagent
  try {
    let responseText = "";

    const response = query({
      prompt,
      options: {
        model,
        cwd: projectDir,
        systemPrompt: SYSTEM_PROMPT,
        permissionMode: "acceptEdits",
        canUseTool: createSecurePermissionCallback("execute"),
        allowedTools: [...BUILTIN_TOOLS],
        maxTurns: 50, // Limited turns for test writing
        settingSources: ["user", "project"] as SettingSource[],
      },
    });

    for await (const message of response) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            responseText += block.text;
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

    // Verify tests are in RED state
    console.log(`\nVerifying tests are RED...`);
    const testResult = await runTestCommand(testCommand, projectDir);

    if (testResult.passed) {
      // Tests passed - this is wrong! They should fail
      console.log("⚠ WARNING: Tests passed! They should FAIL in RED phase.");
      return {
        status: "green", // Indicates a problem
        testFiles: [],
        testCommand,
        error: "Tests passed when they should fail. Feature may already exist.",
      };
    }

    console.log("✓ Tests are RED (failing as expected)\n");

    // Try to extract test files from response or check for new test files
    // For now, we'll save basic info
    const testInfo: TestInfo = {
      taskId: task.id,
      testFiles: [], // Would be extracted from agent's output
      testCommand,
      status: "red",
      failureOutput: testResult.output,
      createdAt: new Date().toISOString(),
    };

    saveTestInfo(projectDir, state.planName, task.id, testInfo);

    return {
      status: "red",
      testFiles: testInfo.testFiles,
      testCommand,
      failureOutput: testResult.output,
    };
  } catch (error) {
    const err = error as Error;
    console.error(`Test subagent error: ${err.message}`);
    return {
      status: "error",
      testFiles: [],
      testCommand,
      error: err.message,
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

export { detectTestCommand };
