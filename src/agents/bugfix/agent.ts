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

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

export interface BugFixOptions {
  projectDir: string;
  errorInput?: string;
  errorFile?: string;
  depth: DepthLevel;
  model?: string;
}

const SYSTEM_PROMPT = `You are an expert debugger focused on finding and fixing bugs efficiently.
You make minimal, targeted changes to fix issues without unnecessary refactoring.
You understand that the user's time is valuable and aim to fix bugs quickly.
You always verify your fixes work before declaring completion.`;

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

  // Fallback to inline prompts
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
 * Run the bug fix agent
 */
export async function runBugFix(options: BugFixOptions): Promise<void> {
  const {
    projectDir,
    errorInput,
    errorFile,
    depth,
    model = "claude-sonnet-4-5",
  } = options;

  // Load error input
  let error = errorInput ?? "";
  if (errorFile && existsSync(errorFile)) {
    error = readFileSync(errorFile, "utf-8");
  }

  if (!error) {
    console.error("Warning: No error input provided. Agent will look for obvious issues.");
  }

  const config = getDepthConfig(depth);

  console.log("\n" + "=".repeat(70));
  console.log("  BUG FIX AGENT");
  console.log("=".repeat(70));
  console.log(`\nProject: ${resolve(projectDir)}`);
  console.log(`Model: ${model}`);
  console.log(`Depth: ${depth}`);
  console.log(`Budget: $${config.maxBudgetUsd.toFixed(2)}`);

  if (error) {
    const preview = error.length > 200 ? error.slice(0, 200) + "..." : error;
    console.log(`\nError input (${error.length} chars):`);
    console.log(`  ${preview}`);
  }
  console.log();

  const prompt = getBugFixPrompt(error, depth);

  try {
    const response = query({
      prompt,
      options: {
        model,
        workingDirectory: resolve(projectDir),
        systemPrompt: SYSTEM_PROMPT,
        maxBudgetUsd: config.maxBudgetUsd,
        permissionMode: getPermissionMode(depth),
        canUseTool: createPermissionCallback("bugfix"),
      },
    });

    let sessionId: string | undefined;
    let isComplete = false;

    for await (const message of response) {
      switch (message.type) {
        case "system":
          if (message.subtype === "init") {
            sessionId = message.session_id;
            console.log(`Session: ${sessionId}\n`);
            console.log("-".repeat(70) + "\n");
          }
          break;

        case "assistant":
          if (typeof message.content === "string") {
            process.stdout.write(message.content);

            // Check for completion markers
            const lowerContent = message.content.toLowerCase();
            if (
              lowerContent.includes("fix verified") ||
              lowerContent.includes("bug fixed") ||
              lowerContent.includes("bug is resolved") ||
              lowerContent.includes("successfully fixed")
            ) {
              isComplete = true;
            }
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
    if (isComplete) {
      console.log("  FIX COMPLETED");
    } else {
      console.log("  SESSION ENDED");
      if (depth === "quick") {
        console.log("\n  Tip: Use --depth standard for more thorough analysis");
      }
    }
    console.log("=".repeat(70) + "\n");

  } catch (err) {
    const error = err as Error;
    if (error.message?.includes("budget")) {
      console.error(`\nBudget limit reached ($${config.maxBudgetUsd})`);
      console.log("Consider using --depth thorough for more budget");
    } else {
      throw error;
    }
  }
}
