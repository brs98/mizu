/**
 * Feature Agent
 *
 * Add new functionality to existing codebases.
 * Now uses the two-phase pattern with task-based state tracking:
 *
 * Session 1 (Initializer): Analyzes spec, creates feature_tasks.json with implementation steps
 * Sessions 2+ (Worker): Executes one task per session until feature is complete
 *
 * Task breakdown typically includes:
 * - Analyze requirements and existing codebase
 * - Design implementation approach
 * - Implement core feature logic
 * - Add tests
 * - Integrate and verify
 */

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type FeatureState,
  createFeatureState,
  loadFeatureState,
  saveState,
  syncFeatureTasksFromFile,
  getFeatureTaskProgress,
  isComplete,
  printFeatureProgress,
  appendProgress,
  markInitialized,
  incrementSession,
  getNextPendingTask,
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

export interface FeatureOptions {
  projectDir: string;
  specFile?: string;
  specText?: string;
  model?: string;
  maxSessions?: number;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are an expert software developer focused on adding features to existing codebases.

You work methodically, one task at a time, ensuring each step is verified before moving on.

You understand that:
- Quality matters more than speed
- Each session is independent - you have no memory of previous sessions
- feature_tasks.json is the source of truth for progress
- Git history shows what was done before
- Verification proves tasks are actually complete

You always:
- Read feature_tasks.json to understand what needs to be done
- Check git log to see recent progress
- Analyze existing patterns before implementing
- Write code that matches existing conventions
- Write tests matching the existing test style
- Verify your work before marking tasks complete
- Commit progress with descriptive messages
- Update feature_tasks.json and claude-progress.txt before ending

You never:
- Try to complete multiple tasks at once without verification
- Mark tasks as completed without running verification
- Implement without understanding existing patterns
- Leave the codebase in a broken state

When the feature is complete:
- All tasks in feature_tasks.json should be marked "completed"
- Tests should pass
- Say "Feature implementation complete" to indicate completion`;

// =============================================================================
// Prompt Context
// =============================================================================

interface FeaturePromptContext extends PromptContext {
  project_dir: string;
  model: string;
  session_number: number;
  spec_text?: string;
  spec_file?: string;
  total_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  percentage: number;
}

// =============================================================================
// Prompt Generation
// =============================================================================

function getInitializerPrompt(state: FeatureState): string {
  // Load spec text from file if provided
  let specText = state.specText;
  if (state.specFile && existsSync(state.specFile)) {
    specText = readFileSync(state.specFile, "utf-8");
  }

  const context: FeaturePromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    spec_text: specText,
    spec_file: state.specFile,
    total_tasks: 0,
    completed_tasks: 0,
    remaining_tasks: 0,
    percentage: 0,
  };

  const promptFile = resolve(PROMPTS_DIR, "initializer.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return getFallbackInitializerPrompt(context);
}

function getWorkerPrompt(state: FeatureState): string {
  const progress = getFeatureTaskProgress(state.tasks);

  // Load spec text from file if provided
  let specText = state.specText;
  if (state.specFile && existsSync(state.specFile)) {
    specText = readFileSync(state.specFile, "utf-8");
  }

  const context: FeaturePromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    spec_text: specText,
    spec_file: state.specFile,
    total_tasks: progress.total,
    completed_tasks: progress.completed,
    remaining_tasks: progress.pending + progress.blocked,
    percentage: progress.percentage,
  };

  const promptFile = resolve(PROMPTS_DIR, "worker.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return getFallbackWorkerPrompt(context);
}

// =============================================================================
// Fallback Prompts
// =============================================================================

function getFallbackInitializerPrompt(context: FeaturePromptContext): string {
  return `# Feature Initializer - Session 1

You are setting up a feature implementation in ${context.project_dir}.

## Feature Specification

${context.spec_text || "No specification provided - analyze the requirements from context"}

${context.spec_file ? `Spec file: ${context.spec_file}` : ""}

## Your Tasks

1. **Analyze the Codebase**
   - Explore the project structure
   - Identify related existing functionality
   - Understand patterns and conventions used

2. **Plan the Implementation**
   - Identify what needs to be built
   - Determine which files need modification
   - Plan the integration points

3. **Create feature_tasks.json**
   Break down the feature into concrete, verifiable tasks:

\`\`\`json
[
  {
    "id": "feature-001",
    "description": "Analyze requirements and existing codebase patterns",
    "status": "pending",
    "dependencies": []
  },
  {
    "id": "feature-002",
    "description": "Design implementation approach following existing conventions",
    "status": "pending",
    "dependencies": ["feature-001"]
  },
  {
    "id": "feature-003",
    "description": "Implement core feature logic",
    "status": "pending",
    "dependencies": ["feature-002"]
  },
  {
    "id": "feature-004",
    "description": "Add unit and integration tests",
    "status": "pending",
    "dependencies": ["feature-003"]
  },
  {
    "id": "feature-005",
    "description": "Integrate with existing code and verify all tests pass",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["feature-004"]
  }
]
\`\`\`

4. **Initialize Git Tracking**
\`\`\`bash
git add feature_tasks.json
git commit -m "Initialize feature implementation tasks"
\`\`\`

5. **Create claude-progress.txt**
   Document your analysis and planned approach.

## Task Guidelines

- Each task should be independently verifiable
- Use verificationCommand when possible
- Order tasks by dependencies
- Include 5-10 tasks depending on feature complexity
- All tasks start with "status": "pending"

When done, the next session will begin executing tasks one by one.`;
}

function getFallbackWorkerPrompt(context: FeaturePromptContext): string {
  return `# Feature Worker - Session ${context.session_number}

Continue implementing the feature in ${context.project_dir}.

## Progress
- Tasks: ${context.completed_tasks}/${context.total_tasks} completed (${context.percentage}%)
- Remaining: ${context.remaining_tasks}

## Feature Specification
${context.spec_text || "See feature_tasks.json for task details"}

## Your Tasks

1. **Get Your Bearings**
\`\`\`bash
pwd
git log --oneline -10
cat claude-progress.txt
\`\`\`

2. **Read feature_tasks.json**
   Find the next pending task whose dependencies are all completed.

3. **Execute the Task**
   - Implement what the task describes
   - Follow existing codebase patterns
   - Write code that matches existing conventions

4. **Verify the Task**
   Run the task's verificationCommand (if provided):
\`\`\`bash
# Example: pnpm test
\`\`\`

5. **Update feature_tasks.json**
   Mark the task as completed:
\`\`\`json
{
  "id": "feature-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
\`\`\`

6. **Commit Progress**
\`\`\`bash
git add -A
git commit -m "feature: complete task-XXX - <description>"
\`\`\`

7. **Update claude-progress.txt**
   Document what you did in this session.

## Completion

When ALL tasks are completed and verified:
- All tests should pass
- Say "Feature implementation complete" to indicate completion

Work on ONE task at a time. Leave the codebase in a working state.`;
}

// =============================================================================
// State Management
// =============================================================================

function loadOrCreateState(options: FeatureOptions): FeatureState {
  const projectDir = resolve(options.projectDir);

  // Try to load existing state
  const existing = loadFeatureState(projectDir);
  if (existing) {
    // Sync tasks from file (agent may have modified it)
    return syncFeatureTasksFromFile(existing);
  }

  // Load spec from file if provided
  let specText = options.specText;
  if (options.specFile && existsSync(options.specFile)) {
    specText = readFileSync(options.specFile, "utf-8");
  }

  // Create new state
  return createFeatureState({
    projectDir,
    model: options.model ?? "claude-sonnet-4-5",
    specFile: options.specFile,
    specText,
  });
}

// =============================================================================
// Completion Detection
// =============================================================================

function checkFeatureCompletion(response: string, state: FeatureState): boolean {
  // Re-sync tasks from file after each session
  const updated = syncFeatureTasksFromFile(state);

  // Check if all tasks are complete
  if (isComplete(updated)) {
    return true;
  }

  // Also check for explicit completion phrases (fallback)
  const lower = response.toLowerCase();
  const completionPhrases = [
    "feature implementation complete",
    "implementation complete",
    "feature complete",
    "successfully implemented",
    "all tasks completed",
  ];

  return completionPhrases.some((phrase) => lower.includes(phrase));
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runFeature(options: FeatureOptions): Promise<void> {
  const {
    projectDir,
    specFile,
    specText,
    model = "claude-sonnet-4-5",
    maxSessions,
  } = options;

  // Validate spec input
  const hasSpec = specText || (specFile && existsSync(specFile));
  if (!hasSpec) {
    console.error("Error: Must provide feature specification via --spec or --spec-file");
    process.exit(1);
  }

  const resolvedProjectDir = resolve(projectDir);

  // Ensure project directory exists
  if (!existsSync(resolvedProjectDir)) {
    mkdirSync(resolvedProjectDir, { recursive: true });
  }

  // Load or create state
  let state = loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model });

  // Print header
  printLongRunningHeader({
    agentName: "Feature Agent",
    projectDir: resolvedProjectDir,
    model,
    stateType: "feature",
    initialized: state.initialized,
    sessionCount: state.sessionCount,
    maxSessions,
  });

  // Print spec preview
  const spec = state.specText || (state.specFile && existsSync(state.specFile)
    ? readFileSync(state.specFile, "utf-8")
    : "");
  if (spec) {
    const preview = spec.length > 300 ? spec.slice(0, 300) + "..." : spec;
    console.log(`Spec (${spec.length} chars):`);
    console.log(`  ${preview}\n`);
  }

  if (state.initialized) {
    printFeatureProgress(state);
  }

  // Run the long-running agent loop
  const result = await runLongRunningAgent({
    projectDir: resolvedProjectDir,
    model,
    agentType: "feature",
    systemPrompt: SYSTEM_PROMPT,
    maxSessions: maxSessions ?? Infinity,
    enablePuppeteer: false,
    sandboxEnabled: true,

    getPrompt: (sessionNumber, currentState) => {
      const featureState = currentState as FeatureState;
      if (!featureState.initialized) {
        return getInitializerPrompt(featureState);
      }
      return getWorkerPrompt(featureState);
    },

    loadState: () => loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model }),

    saveState: (updatedState) => {
      state = updatedState as FeatureState;
      saveState(state);
    },

    onSessionStart: (sessionNumber) => {
      console.log(`\n--- Feature Session ${sessionNumber} ---\n`);
    },

    onSessionEnd: (sessionNumber, response) => {
      // Sync state from files
      state = syncFeatureTasksFromFile(state);
      state = incrementSession(state) as FeatureState;

      if (!state.initialized) {
        state = markInitialized(state) as FeatureState;
      }

      saveState(state);

      // Append to progress
      const progress = getFeatureTaskProgress(state.tasks);
      appendProgress(
        resolvedProjectDir,
        `Session ${sessionNumber} completed. Tasks: ${progress.completed}/${progress.total} completed.`
      );
    },

    isComplete: (response) => checkFeatureCompletion(response, state),
  });

  // Print completion summary
  printLongRunningCompletion({
    agentName: "Feature Agent",
    completed: result.completed,
    sessions: result.sessions,
    state,
  });
}

// =============================================================================
// Exports
// =============================================================================

export { getInitializerPrompt, getWorkerPrompt };
