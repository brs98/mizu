/**
 * Bug Fix Agent
 *
 * A focused agent for diagnosing and fixing bugs from error logs and stack traces.
 *
 * Unlike general-purpose agents, the bug fix agent:
 * 1. Trusts the user's diagnosis (especially at quick depth)
 * 2. Makes minimal, targeted changes
 * 3. Verifies the fix without extensive refactoring
 * 4. Completes quickly for simple bugs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type DepthLevel,
  getDepthConfig,
  getDepthPromptContext,
} from "../../core/depth";
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
  depth: DepthLevel;
  model?: string;
  maxIterations?: number;
}

const SYSTEM_PROMPT = `You are an expert debugger focused on finding and fixing bugs efficiently.
You make minimal, targeted changes to fix issues without unnecessary refactoring.
You understand that the user's time is valuable and aim to fix bugs quickly.
You always verify your fixes work before declaring completion.

When the fix is verified and working, you MUST say "Fix verified - bug is resolved" to indicate completion.`;

/**
 * Get the appropriate prompt based on depth level
 */
function getBugFixPrompt(errorInput: string, depth: DepthLevel): string {
  const config = getDepthConfig(depth);
  const context = {
    ...getDepthPromptContext(config),
    error_input: errorInput,
  };

  // Try to load from prompt file
  const promptFile = resolve(PROMPTS_DIR, "diagnose.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback to inline prompt
  return getFallbackPrompt(errorInput, depth);
}

function getFallbackPrompt(errorInput: string, depth: DepthLevel): string {
  const depthInstructions = {
    quick: `**QUICK MODE** - Trust the error, make a fast fix.

1. Read ONLY the file(s) mentioned in the error
2. Identify the exact line/function causing the issue
3. Apply a minimal fix immediately
4. Skip exploration - don't map the codebase
5. Run a quick verification if a test is mentioned

Do NOT:
- Explore unrelated code
- Refactor anything
- Add extensive error handling
- Write new tests (unless the bug is in a test)

Just fix the bug and verify it works.`,

    standard: `**STANDARD MODE** - Understand context, fix properly.

1. Read the files mentioned in the error
2. Check 1-2 related files for context
3. Understand WHY the bug exists
4. Apply a fix that addresses the root cause
5. Run related tests to verify

Be thorough but focused. Fix the bug without scope creep.`,

    thorough: `**THOROUGH MODE** - Comprehensive analysis.

1. Analyze the full stack trace
2. Map all code paths involved
3. Check for similar patterns elsewhere
4. Understand the broader context
5. Apply a comprehensive fix
6. Run full test suite
7. Add a regression test if appropriate

Take your time to ensure this bug is fully resolved.`,
  };

  return `# Bug Fix

## Depth: ${depth}

${depthInstructions[depth]}

## Error Input

\`\`\`
${errorInput}
\`\`\`

## Your Task

Diagnose this error and fix it.

${depth === "quick" ? "After diagnosis, immediately apply the fix. Don't wait for confirmation." : "Report your findings, then apply the fix and verify it works."}

When the fix is verified, say "Fix verified - bug is resolved" to indicate completion.`;
}

/**
 * Continuation prompt for subsequent sessions
 */
function getContinuationPrompt(errorInput: string, depth: DepthLevel): string {
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
    depth,
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

  const depthConfig = getDepthConfig(depth);
  const resolvedProjectDir = resolve(projectDir);

  // Print header
  printAgentHeader("Bug Fix Agent", resolvedProjectDir, model, depthConfig, maxIterations);

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
      depthConfig,
      agentType: "bugfix",
      systemPrompt: SYSTEM_PROMPT,
      maxIterations,
    },
    {
      getPrompt: (iteration) => {
        if (iteration === 1) {
          return getBugFixPrompt(error, depth);
        }
        return getContinuationPrompt(error, depth);
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
