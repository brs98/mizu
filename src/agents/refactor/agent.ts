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

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { loadAndRenderPrompt } from "../../core/prompts";
import {
  runMultiSessionAgent,
  printAgentHeader,
  printCompletionSummary,
} from "../../core/session";

const PROMPTS_DIR = resolve(dirname(import.meta.path), "prompts");

export interface RefactorOptions {
  projectDir: string;
  target?: string;
  focus?: "performance" | "readability" | "patterns" | "all";
  model?: string;
  maxIterations?: number;
}

const SYSTEM_PROMPT = `You are an expert software architect focused on improving code quality.
You make safe, incremental refactoring changes.
You ALWAYS verify tests pass before AND after changes.
You preserve all existing behavior - refactoring must be invisible to users.
You prioritize maintainability and readability.

When refactoring is complete and all tests pass, you MUST say "Refactoring complete - all tests passing" to indicate completion.`;

function getRefactorPrompt(
  target: string,
  focus: string
): string {
  const context = {
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

  return `# Code Refactoring

## Instructions

1. Run full test suite to establish baseline
2. Analyze the target area and its dependencies
3. Plan refactoring approach
4. Make incremental changes, testing after each
5. Ensure all tests pass before completion

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

function getContinuationPrompt(target: string, focus: string): string {
  return `# Continue Refactoring

You are continuing work on refactoring code. This is a fresh context window.

## Target
${target || "Continue improving the codebase."}

## Focus
${focus}

## Instructions

1. Run tests to check current state
2. Review what refactoring has been done (check git log)
3. Continue with the next improvement
4. Verify tests pass after each change
5. Make incremental, safe changes

## Critical Rules

- Tests must pass before AND after every change
- No behavior changes - refactoring is invisible to users
- Incremental changes only

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
    model = "claude-sonnet-4-5",
    maxIterations,
  } = options;

  const resolvedProjectDir = resolve(projectDir);

  // Print header
  printAgentHeader("Refactor Agent", resolvedProjectDir, model, maxIterations);

  console.log(`Focus: ${focus}`);
  if (target) {
    console.log(`Target: ${target}`);
  }
  console.log();

  // Completion markers for refactor
  const isComplete = (response: string): boolean => {
    const lower = response.toLowerCase();
    return (
      lower.includes("refactoring complete") ||
      lower.includes("all tests passing") ||
      lower.includes("refactor complete") ||
      lower.includes("successfully refactored")
    );
  };

  // Run multi-session agent
  const result = await runMultiSessionAgent(
    {
      projectDir: resolvedProjectDir,
      model,
      agentType: "refactor",
      systemPrompt: SYSTEM_PROMPT,
      maxIterations,
    },
    {
      getPrompt: (iteration) => {
        if (iteration === 1) {
          return getRefactorPrompt(target, focus);
        }
        return getContinuationPrompt(target, focus);
      },
      isComplete,
      onComplete: () => {
        console.log("Refactoring complete!");
      },
    }
  );

  // Print summary
  printCompletionSummary("Refactor Agent", result.completed, result.iterations);
}
