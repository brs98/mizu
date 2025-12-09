/**
 * Builder Agent
 *
 * A long-running agent for building complete applications from specifications.
 * Uses the two-agent pattern from Anthropic's research:
 * - Initializer: Sets up feature_list.json, init.sh, and project structure
 * - Coder: Implements one feature per session with browser verification
 *
 * Key features:
 * - Persistent state via feature_list.json
 * - Browser automation for end-to-end testing
 * - Git-based progress tracking
 * - Crash recovery via file-based state
 */

import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  type BuilderState,
  createBuilderState,
  loadBuilderState,
  saveState,
  syncFeaturesFromFile,
  getFeatureProgress,
  isComplete,
  printBuilderProgress,
  appendProgress,
  markInitialized,
  incrementSession,
} from "../../core/state";
import { loadAndRenderPrompt, type PromptContext } from "../../core/prompts";
import {
  runLongRunningAgent,
  printLongRunningHeader,
  printLongRunningCompletion,
} from "../../core/longrunning";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

// =============================================================================
// Types
// =============================================================================

export interface BuilderOptions {
  projectDir: string;
  specFile?: string;
  specText?: string;
  model?: string;
  maxSessions?: number;
  minFeatures?: number;
  maxFeatures?: number;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are an expert full-stack developer building a production-quality application.

You work methodically, one feature at a time, ensuring each feature is fully tested before moving on.

You understand that:
- Quality matters more than speed
- Each session is independent - you have no memory of previous sessions
- feature_list.json is the source of truth
- Git history shows what was done before
- Browser automation proves features actually work

You always:
- Read feature_list.json to understand what needs to be built
- Check git log to see recent progress
- Verify the app works before adding new features
- Test features end-to-end with browser automation
- Commit progress with descriptive messages
- Update feature_list.json and claude-progress.txt before ending

You never:
- Try to implement multiple features at once
- Mark features as passing without browser testing
- Remove or edit feature descriptions
- Leave the environment in a broken state`;

// =============================================================================
// Prompt Generation
// =============================================================================

interface BuilderPromptContext extends PromptContext {
  project_dir: string;
  model: string;
  session_number: number;
  browser_testing_enabled: string;
  spec_file?: string;
  spec_text?: string;
  min_features: number;
  max_features: number;
  total_features: number;
  passing_features: number;
  remaining_features: number;
}

function getInitializerPrompt(state: BuilderState, options: BuilderOptions): string {
  // Load spec text from file if provided
  let specText = options.specText;
  if (options.specFile && existsSync(options.specFile)) {
    specText = readFileSync(options.specFile, "utf-8");
  }

  const context: PromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    browser_testing_enabled: "true", // Builder always has browser testing
    spec_file: options.specFile,
    spec_text: specText,
    min_features: options.minFeatures ?? 100,
    max_features: options.maxFeatures ?? 200,
    total_features: 0,
    passing_features: 0,
    remaining_features: 0,
  };

  const promptFile = resolve(PROMPTS_DIR, "initializer.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return getFallbackInitializerPrompt(context);
}

function getCodingPrompt(state: BuilderState): string {
  const progress = getFeatureProgress(state.features);

  const context: PromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    browser_testing_enabled: "true",
    min_features: 100,
    max_features: 200,
    total_features: progress.total,
    passing_features: progress.passing,
    remaining_features: progress.failing,
  };

  const promptFile = resolve(PROMPTS_DIR, "coding.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return getFallbackCodingPrompt(context);
}

// =============================================================================
// Fallback Prompts
// =============================================================================

function getFallbackInitializerPrompt(context: PromptContext): string {
  return `# Initializer Agent - Session 1

You are setting up a new project in ${context.project_dir}.

## Your Tasks

1. **Create feature_list.json** with ${context.min_features}-${context.max_features} test cases
2. **Create init.sh** to set up the development environment
3. **Initialize git** and make first commit
4. **Create project structure** based on the spec

${context.spec_text ? `## Specification\n\n${context.spec_text}` : ""}

## Feature List Format

\`\`\`json
[
  {
    "id": "feat-001",
    "category": "functional",
    "description": "Description of feature",
    "steps": ["Step 1", "Step 2", "Step 3"],
    "passes": false
  }
]
\`\`\`

When done, commit everything and create claude-progress.txt with a summary.`;
}

function getFallbackCodingPrompt(context: PromptContext): string {
  return `# Coding Agent - Session ${context.session_number}

Continue working on the project in ${context.project_dir}.

## Progress
- Total features: ${context.total_features}
- Passing: ${context.passing_features}
- Remaining: ${context.remaining_features}

## Your Tasks

1. Run \`pwd\` and \`git log --oneline -10\`
2. Read \`claude-progress.txt\` and \`feature_list.json\`
3. Run \`./init.sh\` to start the dev server
4. Verify existing features still work
5. Pick ONE failing feature and implement it
6. Test with browser automation
7. Update feature_list.json (set passes: true)
8. Commit and update claude-progress.txt

Work on ONE feature only. Leave the environment clean.`;
}

// =============================================================================
// State Management
// =============================================================================

function loadOrCreateState(options: BuilderOptions): BuilderState {
  const projectDir = resolve(options.projectDir);

  // Try to load existing state
  const existing = loadBuilderState(projectDir);
  if (existing) {
    // Sync features from file (agent may have modified it)
    return syncFeaturesFromFile(existing);
  }

  // Create new state
  return createBuilderState({
    projectDir,
    model: options.model ?? "claude-sonnet-4-5",
    specFile: options.specFile,
    specText: options.specText,
  });
}

// =============================================================================
// Completion Detection
// =============================================================================

function checkBuilderCompletion(response: string, state: BuilderState): boolean {
  // Re-sync features from file after each session
  const updated = syncFeaturesFromFile(state);

  // Check if all features pass
  if (isComplete(updated)) {
    return true;
  }

  // Also check for explicit completion phrases
  const lower = response.toLowerCase();
  const completionPhrases = [
    "all features passing",
    "all tests passing",
    "project complete",
    "implementation complete",
    "100% complete",
  ];

  return completionPhrases.some((phrase) => lower.includes(phrase));
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runBuilder(options: BuilderOptions): Promise<void> {
  const {
    projectDir,
    model = "claude-sonnet-4-5",
    maxSessions,
  } = options;

  const resolvedProjectDir = resolve(projectDir);

  // Ensure project directory exists
  if (!existsSync(resolvedProjectDir)) {
    mkdirSync(resolvedProjectDir, { recursive: true });
  }

  // Load or create state
  let state = loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model });

  // Print header
  printLongRunningHeader({
    agentName: "Builder Agent",
    projectDir: resolvedProjectDir,
    model,
    stateType: "builder",
    initialized: state.initialized,
    sessionCount: state.sessionCount,
    maxSessions,
  });

  // Print spec info
  if (options.specFile) {
    console.log(`Spec file: ${options.specFile}`);
  } else if (options.specText) {
    const preview = options.specText.slice(0, 100) + "...";
    console.log(`Spec: ${preview}`);
  }

  if (state.initialized) {
    printBuilderProgress(state);
  }

  // Run the long-running agent loop
  const result = await runLongRunningAgent({
    projectDir: resolvedProjectDir,
    model,
    agentType: "builder",
    systemPrompt: SYSTEM_PROMPT,
    maxSessions: maxSessions ?? Infinity,
    enablePuppeteer: true,
    sandboxEnabled: true,

    getPrompt: (sessionNumber, currentState) => {
      const builderState = currentState as BuilderState;
      if (!builderState.initialized) {
        return getInitializerPrompt(builderState, options);
      }
      return getCodingPrompt(builderState);
    },

    loadState: () => loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model }),

    saveState: (updatedState) => {
      state = updatedState as BuilderState;
      saveState(state);
    },

    onSessionStart: (sessionNumber) => {
      console.log(`\n--- Builder Session ${sessionNumber} ---\n`);
    },

    onSessionEnd: (sessionNumber, response) => {
      // Sync state from files
      state = syncFeaturesFromFile(state);
      state = incrementSession(state) as BuilderState;

      if (!state.initialized) {
        state = markInitialized(state) as BuilderState;
      }

      saveState(state);

      // Append to progress
      const progress = getFeatureProgress(state.features);
      appendProgress(
        resolvedProjectDir,
        `Session ${sessionNumber} completed. Features: ${progress.passing}/${progress.total} passing.`
      );
    },

    isComplete: (response) => checkBuilderCompletion(response, state),
  });

  // Print completion summary
  printLongRunningCompletion({
    agentName: "Builder Agent",
    completed: result.completed,
    sessions: result.sessions,
    state,
  });
}

// =============================================================================
// Exports
// =============================================================================

export { getInitializerPrompt, getCodingPrompt };
