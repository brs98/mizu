/**
 * Feature Agent
 *
 * Add new functionality to existing codebases.
 *
 * The feature agent:
 * 1. Analyzes existing codebase patterns
 * 2. Plans implementation following existing conventions
 * 3. Implements features incrementally
 * 4. Writes tests matching existing test patterns
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, existsSync } from "node:fs";
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

export interface FeatureOptions {
  projectDir: string;
  specFile?: string;
  specText?: string;
  depth: DepthLevel;
  model?: string;
}

const SYSTEM_PROMPT = `You are an expert software developer focused on adding features to existing codebases.
You analyze existing patterns and conventions before implementing.
You write code that looks like it belongs in the codebase.
You write tests that match the existing test style.
You make incremental, reviewable changes.`;

function getFeaturePrompt(spec: string, depth: DepthLevel): string {
  const config = getDepthConfig(depth);
  const context = {
    ...getDepthPromptContext(config),
    spec,
  };

  // Try to load from prompt file
  const promptFile = resolve(PROMPTS_DIR, "implement.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback to inline prompt
  const depthInstructions = {
    quick: `**QUICK MODE** - Fast implementation.

1. Read the spec and identify key files to modify
2. Implement the feature directly
3. Add minimal tests
4. Skip extensive codebase exploration`,

    standard: `**STANDARD MODE** - Balanced implementation.

1. Analyze existing code patterns in related areas
2. Plan the implementation approach
3. Implement following existing conventions
4. Write tests matching existing test patterns
5. Verify integration with existing features`,

    thorough: `**THOROUGH MODE** - Comprehensive implementation.

1. Full codebase analysis for patterns and conventions
2. Design document with architectural considerations
3. Implement with comprehensive error handling
4. Full test coverage including edge cases
5. Documentation updates
6. Integration testing`,
  };

  return `# Feature Implementation

## Depth: ${depth}

${depthInstructions[depth]}

## Feature Specification

${spec}

## Your Task

Implement this feature following the codebase's existing patterns and conventions.

When implementation is complete and verified, say "Feature implementation complete" to indicate completion.`;
}

/**
 * Run the feature agent
 */
export async function runFeature(options: FeatureOptions): Promise<void> {
  const {
    projectDir,
    specFile,
    specText,
    depth,
    model = "claude-sonnet-4-5",
  } = options;

  // Load spec
  let spec = specText ?? "";
  if (specFile && existsSync(specFile)) {
    spec = readFileSync(specFile, "utf-8");
  }

  if (!spec) {
    console.error("Error: Must provide feature specification via --spec or --spec-file");
    process.exit(1);
  }

  const config = getDepthConfig(depth);

  console.log("\n" + "=".repeat(70));
  console.log("  FEATURE AGENT");
  console.log("=".repeat(70));
  console.log(`\nProject: ${resolve(projectDir)}`);
  console.log(`Model: ${model}`);
  console.log(`Depth: ${depth}`);
  console.log(`Budget: $${config.maxBudgetUsd.toFixed(2)}`);
  console.log();

  const prompt = getFeaturePrompt(spec, depth);

  try {
    const response = query({
      prompt,
      options: {
        model,
        workingDirectory: resolve(projectDir),
        systemPrompt: SYSTEM_PROMPT,
        maxBudgetUsd: config.maxBudgetUsd,
        permissionMode: getPermissionMode(depth),
        canUseTool: createPermissionCallback("feature"),
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
