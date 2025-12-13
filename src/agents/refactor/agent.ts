/**
 * Refactor Agent
 *
 * Improve code quality without changing behavior.
 * Now uses the two-phase pattern with task-based state tracking:
 *
 * Session 1 (Initializer): Analyzes codebase, creates refactor_tasks.json with improvement steps
 * Sessions 2+ (Worker): Executes one refactoring task per session until complete
 *
 * Task breakdown typically includes:
 * - Establish test baseline
 * - Identify refactoring targets
 * - Refactor area 1, 2, 3...
 * - Final verification
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type RefactorState,
  type RefactorFocus,
  createRefactorState,
  loadRefactorState,
  saveState,
  syncRefactorTasksFromFile,
  getRefactorProgress,
  isComplete,
  printRefactorProgress,
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

export interface RefactorOptions {
  projectDir: string;
  target?: string;
  focus?: RefactorFocus;
  model?: string;
  maxSessions?: number;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are an expert software architect focused on improving code quality.

You work methodically, one task at a time, ensuring each step is verified before moving on.

You understand that:
- Quality matters more than speed
- Each session is independent - you have no memory of previous sessions
- refactor_tasks.json is the source of truth for progress
- Git history shows what was done before
- Tests MUST pass before AND after every change

You always:
- Read refactor_tasks.json to understand what needs to be done
- Check git log to see recent progress
- Run tests before making changes
- Make incremental, safe transformations
- Verify tests still pass after changes
- Commit progress with descriptive messages
- Update refactor_tasks.json and claude-progress.txt before ending

You never:
- Try to complete multiple tasks at once without verification
- Mark tasks as completed without running tests
- Make changes that alter existing behavior
- Leave the codebase in a broken state

When refactoring is complete:
- All tasks in refactor_tasks.json should be marked "completed"
- All tests should pass
- Say "Refactoring complete - all tests passing" to indicate completion`;

// =============================================================================
// Prompt Context
// =============================================================================

interface RefactorPromptContext extends PromptContext {
  project_dir: string;
  model: string;
  session_number: number;
  target?: string;
  focus: string;
  focus_instructions: string;
  total_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  percentage: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getFocusInstructions(focus: RefactorFocus): string {
  const instructions: Record<RefactorFocus, string> = {
    performance: "Focus on performance optimizations: algorithm efficiency, caching, lazy loading, reducing allocations.",
    readability: "Focus on readability: clear naming, reduced complexity, better organization, documentation.",
    patterns: "Focus on design patterns: proper abstractions, SOLID principles, reducing coupling, DRY.",
    all: "Consider all aspects: performance, readability, and design patterns.",
  };
  return instructions[focus];
}

// =============================================================================
// Prompt Generation
// =============================================================================

function getInitializerPrompt(state: RefactorState): string {
  const focus = state.focus ?? "all";

  const context: RefactorPromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    target: state.target,
    focus,
    focus_instructions: getFocusInstructions(focus),
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

function getWorkerPrompt(state: RefactorState): string {
  const progress = getRefactorProgress(state.tasks);
  const focus = state.focus ?? "all";

  const context: RefactorPromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    target: state.target,
    focus,
    focus_instructions: getFocusInstructions(focus),
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

function getFallbackInitializerPrompt(context: RefactorPromptContext): string {
  return `# Refactor Initializer - Session 1

You are setting up a refactoring task in ${context.project_dir}.

## Focus Area
${context.focus_instructions}

## Target
${context.target || "Analyze the codebase and identify areas that would benefit from refactoring."}

## Your Tasks

1. **Run Test Baseline**
   - Run the full test suite to ensure everything passes
   - This is CRITICAL - never start refactoring with failing tests
   \`\`\`bash
   pnpm test
   \`\`\`

2. **Analyze the Codebase**
   - Explore the target area and its dependencies
   - Identify specific refactoring opportunities
   - Note areas with code smells, complexity, or poor patterns

3. **Create refactor_tasks.json**
   Break down the refactoring into concrete, verifiable tasks:

\`\`\`json
[
  {
    "id": "refactor-001",
    "description": "Run tests to establish passing baseline",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": []
  },
  {
    "id": "refactor-002",
    "description": "Identify and document refactoring targets",
    "status": "pending",
    "dependencies": ["refactor-001"]
  },
  {
    "id": "refactor-003",
    "description": "Refactor: [specific improvement 1]",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["refactor-002"]
  },
  {
    "id": "refactor-004",
    "description": "Refactor: [specific improvement 2]",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["refactor-003"]
  },
  {
    "id": "refactor-005",
    "description": "Final verification - all tests pass, code quality improved",
    "status": "pending",
    "verificationCommand": "pnpm test && pnpm typecheck",
    "dependencies": ["refactor-004"]
  }
]
\`\`\`

4. **Initialize Git Tracking**
\`\`\`bash
git add refactor_tasks.json
git commit -m "Initialize refactor tasks"
\`\`\`

5. **Create claude-progress.txt**
   Document your analysis and planned refactoring approach.

## Task Guidelines

- EVERY task that makes code changes must have a verificationCommand
- Tests must pass after every refactoring step
- Order tasks so each builds on the previous
- Be specific about what each task will improve
- Include 5-15 tasks depending on scope

## Critical Rules

- Tests must pass BEFORE you start
- Tests must pass AFTER every change
- No behavior changes - refactoring is invisible to users

When done, the next session will begin executing tasks one by one.`;
}

function getFallbackWorkerPrompt(context: RefactorPromptContext): string {
  return `# Refactor Worker - Session ${context.session_number}

Continue refactoring in ${context.project_dir}.

## Progress
- Tasks: ${context.completed_tasks}/${context.total_tasks} completed (${context.percentage}%)
- Remaining: ${context.remaining_tasks}

## Focus Area
${context.focus_instructions}

## Target
${context.target || "Continue improving the codebase."}

## Your Tasks

1. **Get Your Bearings**
\`\`\`bash
pwd
git log --oneline -10
cat claude-progress.txt
\`\`\`

2. **Run Tests First**
   Ensure the codebase is in a working state:
\`\`\`bash
pnpm test
\`\`\`

3. **Read refactor_tasks.json**
   Find the next pending task whose dependencies are all completed.

4. **Execute the Task**
   - Make the refactoring changes described
   - Keep changes incremental and safe
   - Preserve all existing behavior

5. **Verify the Task**
   Run the task's verificationCommand:
\`\`\`bash
# Example: pnpm test
\`\`\`

6. **Update refactor_tasks.json**
   Mark the task as completed:
\`\`\`json
{
  "id": "refactor-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
\`\`\`

7. **Commit Progress**
\`\`\`bash
git add -A
git commit -m "refactor: complete task-XXX - <description>"
\`\`\`

8. **Update claude-progress.txt**
   Document what you refactored in this session.

## Critical Rules

- Tests must pass BEFORE you make changes
- Tests must pass AFTER every change
- No behavior changes - refactoring is invisible to users

## Completion

When ALL tasks are completed and verified:
- All tests should pass
- Say "Refactoring complete - all tests passing" to indicate completion

Work on ONE task at a time. Leave the codebase in a working state.`;
}

// =============================================================================
// State Management
// =============================================================================

function loadOrCreateState(options: RefactorOptions): RefactorState {
  const projectDir = resolve(options.projectDir);

  // Try to load existing state
  const existing = loadRefactorState(projectDir);
  if (existing) {
    // Sync tasks from file (agent may have modified it)
    return syncRefactorTasksFromFile(existing);
  }

  // Create new state
  return createRefactorState({
    projectDir,
    model: options.model ?? "claude-sonnet-4-5",
    target: options.target,
    focus: options.focus,
  });
}

// =============================================================================
// Completion Detection
// =============================================================================

function checkRefactorCompletion(response: string, state: RefactorState): boolean {
  // Re-sync tasks from file after each session
  const updated = syncRefactorTasksFromFile(state);

  // Check if all tasks are complete
  if (isComplete(updated)) {
    return true;
  }

  // Also check for explicit completion phrases (fallback)
  const lower = response.toLowerCase();
  const completionPhrases = [
    "refactoring complete",
    "all tests passing",
    "refactor complete",
    "successfully refactored",
    "all tasks completed",
  ];

  return completionPhrases.some((phrase) => lower.includes(phrase));
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runRefactor(options: RefactorOptions): Promise<void> {
  const {
    projectDir,
    target = "",
    focus = "all",
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
    agentName: "Refactor Agent",
    projectDir: resolvedProjectDir,
    model,
    stateType: "refactor",
    initialized: state.initialized,
    sessionCount: state.sessionCount,
    maxSessions,
  });

  // Print focus and target
  console.log(`Focus: ${focus}`);
  if (target) {
    console.log(`Target: ${target}`);
  }
  console.log();

  if (state.initialized) {
    printRefactorProgress(state);
  }

  // Run the long-running agent loop
  const result = await runLongRunningAgent({
    projectDir: resolvedProjectDir,
    model,
    agentType: "refactor",
    systemPrompt: SYSTEM_PROMPT,
    maxSessions: maxSessions ?? Infinity,
    enablePuppeteer: false,
    sandboxEnabled: true,

    getPrompt: (sessionNumber, currentState) => {
      const refactorState = currentState as RefactorState;
      if (!refactorState.initialized) {
        return getInitializerPrompt(refactorState);
      }
      return getWorkerPrompt(refactorState);
    },

    loadState: () => loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model }),

    saveState: (updatedState) => {
      state = updatedState as RefactorState;
      saveState(state);
    },

    onSessionStart: (sessionNumber) => {
      console.log(`\n--- Refactor Session ${sessionNumber} ---\n`);
    },

    onSessionEnd: (sessionNumber, response) => {
      // Sync state from files
      state = syncRefactorTasksFromFile(state);
      state = incrementSession(state) as RefactorState;

      if (!state.initialized) {
        state = markInitialized(state) as RefactorState;
      }

      saveState(state);

      // Append to progress
      const progress = getRefactorProgress(state.tasks);
      appendProgress(
        resolvedProjectDir,
        `Session ${sessionNumber} completed. Tasks: ${progress.completed}/${progress.total} completed.`
      );
    },

    isComplete: (response) => checkRefactorCompletion(response, state),
  });

  // Print completion summary
  printLongRunningCompletion({
    agentName: "Refactor Agent",
    completed: result.completed,
    sessions: result.sessions,
    state,
  });
}

// =============================================================================
// Exports
// =============================================================================

export { getInitializerPrompt, getWorkerPrompt };
