/**
 * Bug Fix Agent
 *
 * A focused agent for diagnosing and fixing bugs from error logs and stack traces.
 *
 * Unlike general-purpose agents, the bug fix agent:
 * 1. Makes minimal, targeted changes
 * 2. Verifies the fix without extensive refactoring
 * 3. Focuses on the specific bug without scope creep
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAndRenderPrompt } from "../../core/prompts";
import {
  runMultiSessionAgent,
  printAgentHeader,
  printCompletionSummary,
} from "../../core/session";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

export interface BugFixOptions {
  projectDir: string;
  errorInput?: string;
  errorFile?: string;
  model?: string;
  maxIterations?: number;
}

const SYSTEM_PROMPT = `You are an expert debugger focused on finding and fixing bugs efficiently.
You make minimal, targeted changes to fix issues without unnecessary refactoring.
You understand that the user's time is valuable and aim to fix bugs quickly.
You always verify your fixes work before declaring completion.

When the fix is verified and working, you MUST say "Fix verified - bug is resolved" to indicate completion.`;

/**
 * Get the bug fix prompt
 */
function getBugFixPrompt(errorInput: string): string {
  const context = {
    error_input: errorInput,
  };

  // Try to load from prompt file
  const promptFile = resolve(PROMPTS_DIR, "diagnose.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback to inline prompt
  return getFallbackPrompt(errorInput);
}

function getFallbackPrompt(errorInput: string): string {
  return `# Bug Fix

## Instructions

1. Read the files mentioned in the error
2. Check related files for context
3. Understand WHY the bug exists
4. Apply a fix that addresses the root cause
5. Run related tests to verify

Be thorough but focused. Fix the bug without scope creep.

## Error Input

\`\`\`
${errorInput}
\`\`\`

## Your Task

Diagnose this error and fix it. Report your findings, then apply the fix and verify it works.

When the fix is verified, say "Fix verified - bug is resolved" to indicate completion.`;
}

/**
 * Continuation prompt for subsequent sessions
 */
function getContinuationPrompt(errorInput: string): string {
  return `# Continue Bug Fix

You are continuing work on fixing a bug. This is a fresh context window.

## Original Error
\`\`\`
${errorInput}
\`\`\`

## Instructions

1. Check the current state of the codebase
2. Review any changes already made
3. Continue diagnosing and fixing the bug
4. Verify the fix works

When the fix is verified, say "Fix verified - bug is resolved" to indicate completion.`;
}

/**
 * Run the bug fix agent
 */
export async function runBugFix(options: BugFixOptions): Promise<void> {
  const {
    projectDir,
    errorInput,
    errorFile,
    model = "claude-sonnet-4-5",
    maxIterations,
  } = options;

  // Load error input
  let error = errorInput ?? "";
  if (errorFile && existsSync(errorFile)) {
    error = readFileSync(errorFile, "utf-8");
  }

  if (!error) {
    console.error("Warning: No error input provided. Agent will look for obvious issues.");
  }

  const resolvedProjectDir = resolve(projectDir);

  // Print header
  printAgentHeader("Bug Fix Agent", resolvedProjectDir, model, maxIterations);

  if (error) {
    const preview = error.length > 200 ? error.slice(0, 200) + "..." : error;
    console.log(`Error input (${error.length} chars):`);
    console.log(`  ${preview}\n`);
  }

  // Completion markers for bug fix
  const isComplete = (response: string): boolean => {
    const lower = response.toLowerCase();
    return (
      lower.includes("fix verified") ||
      lower.includes("bug fixed") ||
      lower.includes("bug is resolved") ||
      lower.includes("successfully fixed")
    );
  };

  // Run multi-session agent
  const result = await runMultiSessionAgent(
    {
      projectDir: resolvedProjectDir,
      model,
      agentType: "bugfix",
      systemPrompt: SYSTEM_PROMPT,
      maxIterations,
    },
    {
      getPrompt: (iteration) => {
        if (iteration === 1) {
          return getBugFixPrompt(error);
        }
        return getContinuationPrompt(error);
      },
      isComplete,
      onComplete: () => {
        console.log("Bug fix verified!");
      },
    }
  );

  // Print summary
  printCompletionSummary("Bug Fix Agent", result.completed, result.iterations);
}
