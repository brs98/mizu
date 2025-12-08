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

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

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

const PROMPTS_DIR = resolve(dirname(import.meta.path), "prompts");

export interface FeatureOptions {
  projectDir: string;
  specFile?: string;
  specText?: string;
  depth: DepthLevel;
  model?: string;
  maxIterations?: number;
}

const SYSTEM_PROMPT = `You are an expert software developer focused on adding features to existing codebases.
You analyze existing patterns and conventions before implementing.
You write code that looks like it belongs in the codebase.
You write tests that match the existing test style.
You make incremental, reviewable changes.

When implementation is complete and verified, you MUST say "Feature implementation complete" to indicate completion.`;

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

function getContinuationPrompt(spec: string): string {
  return `# Continue Feature Implementation

You are continuing work on implementing a feature. This is a fresh context window.

## Feature Specification
${spec}

## Instructions

1. Check the current state of the implementation
2. Review what has been done so far (check git log, modified files)
3. Continue implementing the remaining functionality
4. Write tests for new code
5. Verify everything works together

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
    maxIterations,
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

  const depthConfig = getDepthConfig(depth);
  const resolvedProjectDir = resolve(projectDir);

  // Print header
  printAgentHeader("Feature Agent", resolvedProjectDir, model, depthConfig, maxIterations);

  console.log(`Spec (${spec.length} chars):`);
  const preview = spec.length > 300 ? spec.slice(0, 300) + "..." : spec;
  console.log(`  ${preview}\n`);

  // Completion markers for feature
  const isComplete = (response: string): boolean => {
    const lower = response.toLowerCase();
    return (
      lower.includes("feature implementation complete") ||
      lower.includes("implementation complete") ||
      lower.includes("feature complete") ||
      lower.includes("successfully implemented")
    );
  };

  // Run multi-session agent
  const result = await runMultiSessionAgent(
    {
      projectDir: resolvedProjectDir,
      model,
      depthConfig,
      agentType: "feature",
      systemPrompt: SYSTEM_PROMPT,
      maxIterations,
    },
    {
      getPrompt: (iteration) => {
        if (iteration === 1) {
          return getFeaturePrompt(spec, depth);
        }
        return getContinuationPrompt(spec);
      },
      isComplete,
      onComplete: () => {
        console.log("Feature implementation complete!");
      },
    }
  );

  // Print summary
  printCompletionSummary("Feature Agent", result.completed, result.iterations);
}
