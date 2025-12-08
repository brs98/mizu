/**
 * Refactor Agent
 *
 * Improve code quality without changing behavior.
 *
 * The refactor agent:
 * 1. Ensures tests pass before making changes
 * 2. Makes incremental, safe transformations
 * 3. Verifies tests still pass after each change
 * 4. Preserves all existing behavior
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

import {
  type DepthLevel,
  getDepthConfig,
  getDepthPromptContext,
} from "../../core/depth";
import {
  createPermissionCallback,
  getPermissionMode,
} from "../../core/permissions";
import { loadAndRenderPrompt } from "../../core/prompts";

const PROMPTS_DIR = resolve(dirname(import.meta.path), "prompts");

export interface RefactorOptions {
  projectDir: string;
  target?: string;
  focus?: "performance" | "readability" | "patterns" | "all";
  depth: DepthLevel;
  model?: string;
}

const SYSTEM_PROMPT = `You are an expert software architect focused on improving code quality.
You make safe, incremental refactoring changes.
You ALWAYS verify tests pass before AND after changes.
You preserve all existing behavior - refactoring must be invisible to users.
You prioritize maintainability and readability.`;

function getRefactorPrompt(
  target: string,
  focus: string,
  depth: DepthLevel
): string {
  const config = getDepthConfig(depth);
  const context = {
    ...getDepthPromptContext(config),
    target: target || "Analyze the codebase and identify areas that would benefit from refactoring.",
    focus,
  };

  // Try to load from prompt file
  const promptFile = resolve(PROMPTS_DIR, "improve.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback to inline prompt
  const focusInstructions: Record<string, string> = {
    performance: "Focus on performance optimizations: algorithm efficiency, caching, lazy loading, reducing allocations.",
    readability: "Focus on readability: clear naming, reduced complexity, better organization, documentation.",
    patterns: "Focus on design patterns: proper abstractions, SOLID principles, reducing coupling, DRY.",
    all: "Consider all aspects: performance, readability, and design patterns.",
  };

  const depthInstructions = {
    quick: `**QUICK MODE** - Targeted improvements.

1. Run existing tests to establish baseline
2. Make focused improvements to the target area
3. Verify tests still pass
4. Skip exploration of unrelated code`,

    standard: `**STANDARD MODE** - Thorough refactoring.

1. Run full test suite to establish baseline
2. Analyze the target area and its dependencies
3. Plan refactoring approach
4. Make incremental changes, testing after each
5. Ensure all tests pass before completion`,

    thorough: `**THOROUGH MODE** - Comprehensive improvement.

1. Full test suite verification
2. Complete analysis of target area architecture
3. Identify all improvement opportunities
4. Create refactoring plan with priorities
5. Implement changes incrementally with tests
6. Code review quality verification
7. Performance benchmarking if applicable`,
  };

  return `# Code Refactoring

## Depth: ${depth}

${depthInstructions[depth]}

## Focus Area

${focusInstructions[focus]}

## Target

${target || "Analyze the codebase and identify areas that would benefit from refactoring."}

## Critical Rules

1. **Tests must pass before you start** - Run the test suite first
2. **Tests must pass after every change** - Verify continuously
3. **No behavior changes** - Refactoring must be invisible to users
4. **Incremental changes** - Small, reviewable commits

## Your Task

Refactor the target code to improve quality while preserving behavior.

When refactoring is complete and all tests pass, say "Refactoring complete - all tests passing" to indicate completion.`;
}

/**
 * Run the refactor agent
 */
export async function runRefactor(options: RefactorOptions): Promise<void> {
  const {
    projectDir,
    target = "",
    focus = "all",
    depth,
    model = "claude-sonnet-4-5",
  } = options;

  const config = getDepthConfig(depth);

  console.log("\n" + "=".repeat(70));
  console.log("  REFACTOR AGENT");
  console.log("=".repeat(70));
  console.log(`\nProject: ${resolve(projectDir)}`);
  console.log(`Model: ${model}`);
  console.log(`Depth: ${depth}`);
  console.log(`Focus: ${focus}`);
  console.log(`Budget: $${config.maxBudgetUsd.toFixed(2)}`);
  if (target) {
    console.log(`Target: ${target}`);
  }
  console.log();

  const prompt = getRefactorPrompt(target, focus, depth);

  try {
    const response = query({
      prompt,
      options: {
        model,
        workingDirectory: resolve(projectDir),
        systemPrompt: SYSTEM_PROMPT,
        maxBudgetUsd: config.maxBudgetUsd,
        permissionMode: getPermissionMode(depth),
        canUseTool: createPermissionCallback("refactor"),
      },
    });

    for await (const message of response) {
      switch (message.type) {
        case "system":
          if (message.subtype === "init") {
            console.log(`Session: ${message.session_id}\n`);
            console.log("-".repeat(70) + "\n");
          }
          break;

        case "assistant":
          if (typeof message.content === "string") {
            process.stdout.write(message.content);
          }
          break;

        case "tool_call":
          console.log(`\n[Tool: ${message.tool_name}]`);
          break;

        case "tool_result":
          console.log(`[Done]`);
          break;

        case "error":
          console.error(`\n[Error: ${message.error}]`);
          break;
      }
    }

    console.log("\n\n" + "=".repeat(70));
    console.log("  SESSION ENDED");
    console.log("=".repeat(70) + "\n");

  } catch (err) {
    const error = err as Error;
    if (error.message?.includes("budget")) {
      console.error(`\nBudget limit reached ($${config.maxBudgetUsd})`);
    } else {
      throw error;
    }
  }
}
