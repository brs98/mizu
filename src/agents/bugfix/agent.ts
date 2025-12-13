/**
 * Bug Fix Agent
 *
 * A focused agent for diagnosing and fixing bugs from error logs and stack traces.
 * Now uses the two-phase pattern with task-based state tracking:
 *
 * Session 1 (Initializer): Analyzes error, creates bugfix_tasks.json with diagnostic steps
 * Sessions 2+ (Worker): Executes one task per session until bug is fixed
 *
 * Task breakdown typically includes:
 * - Reproduce and understand the bug
 * - Identify root cause
 * - Implement fix
 * - Write regression test
 * - Verify fix works
 */

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type BugfixState,
  createBugfixState,
  loadBugfixState,
  saveState,
  syncBugfixTasksFromFile,
  getBugfixProgress,
  isComplete,
  printBugfixProgress,
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

export interface BugFixOptions {
  projectDir: string;
  errorInput?: string;
  errorFile?: string;
  model?: string;
  maxSessions?: number;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are an expert debugger focused on finding and fixing bugs efficiently.

You work methodically, one task at a time, ensuring each step is verified before moving on.

You understand that:
- Quality matters more than speed
- Each session is independent - you have no memory of previous sessions
- bugfix_tasks.json is the source of truth for progress
- Git history shows what was done before
- Verification proves tasks are actually complete

You always:
- Read bugfix_tasks.json to understand what needs to be done
- Check git log to see recent progress
- Verify your work before marking tasks complete
- Commit progress with descriptive messages
- Update bugfix_tasks.json and claude-progress.txt before ending

You never:
- Try to complete multiple tasks at once without verification
- Mark tasks as completed without running verification
- Apply fixes without understanding the root cause
- Leave the codebase in a broken state

When the bug fix is complete:
- All tasks in bugfix_tasks.json should be marked "completed"
- Tests should pass
- Say "Fix verified - bug is resolved" to indicate completion`;

// =============================================================================
// Prompt Context
// =============================================================================

interface BugfixPromptContext extends PromptContext {
  project_dir: string;
  model: string;
  session_number: number;
  error_input?: string;
  error_file?: string;
  total_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  percentage: number;
}

// =============================================================================
// Prompt Generation
// =============================================================================

function getInitializerPrompt(state: BugfixState): string {
  const context: BugfixPromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    error_input: state.errorInput,
    error_file: state.errorFile,
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

function getWorkerPrompt(state: BugfixState): string {
  const progress = getBugfixProgress(state.tasks);

  const context: BugfixPromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    error_input: state.errorInput,
    error_file: state.errorFile,
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

function getFallbackInitializerPrompt(context: BugfixPromptContext): string {
  return `# Bug Fix Initializer - Session 1

You are setting up a bug fix task in ${context.project_dir}.

## Error to Fix

\`\`\`
${context.error_input || "No error input provided - analyze the codebase for obvious issues"}
\`\`\`

${context.error_file ? `Error file: ${context.error_file}` : ""}

## Your Tasks

1. **Analyze the Error**
   - Read the error message and stack trace carefully
   - Identify which files are involved
   - Understand what the error is telling you

2. **Explore the Codebase**
   - Read the files mentioned in the error
   - Check related files for context
   - Look for similar patterns in the codebase

3. **Create bugfix_tasks.json**
   Break down the bug fix into concrete, verifiable tasks:

\`\`\`json
[
  {
    "id": "bugfix-001",
    "description": "Reproduce and understand the bug",
    "status": "pending",
    "dependencies": []
  },
  {
    "id": "bugfix-002",
    "description": "Identify root cause by tracing through relevant code",
    "status": "pending",
    "dependencies": ["bugfix-001"]
  },
  {
    "id": "bugfix-003",
    "description": "Implement the fix for the root cause",
    "status": "pending",
    "dependencies": ["bugfix-002"]
  },
  {
    "id": "bugfix-004",
    "description": "Write regression test to prevent bug from recurring",
    "status": "pending",
    "dependencies": ["bugfix-003"]
  },
  {
    "id": "bugfix-005",
    "description": "Verify fix works and all tests pass",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["bugfix-004"]
  }
]
\`\`\`

4. **Initialize Git Tracking** (if not already a repo)
\`\`\`bash
git init  # if not already a repo
git add bugfix_tasks.json
git commit -m "Initialize bugfix tasks"
\`\`\`

5. **Create claude-progress.txt**
   Document your initial analysis and planned approach.

## Task Guidelines

- Each task should be independently verifiable
- Use verificationCommand when possible (shell command that succeeds = task works)
- Order tasks by dependencies
- Keep the task list focused (typically 3-7 tasks for a bug fix)
- All tasks start with "status": "pending"

When done, the next session will begin executing tasks one by one.`;
}

function getFallbackWorkerPrompt(context: BugfixPromptContext): string {
  return `# Bug Fix Worker - Session ${context.session_number}

Continue fixing the bug in ${context.project_dir}.

## Progress
- Tasks: ${context.completed_tasks}/${context.total_tasks} completed (${context.percentage}%)
- Remaining: ${context.remaining_tasks}

## Original Error
\`\`\`
${context.error_input || "No error input provided"}
\`\`\`

## Your Tasks

1. **Get Your Bearings**
\`\`\`bash
pwd
git log --oneline -10
cat claude-progress.txt
\`\`\`

2. **Read bugfix_tasks.json**
   Find the next pending task whose dependencies are all completed.

3. **Execute the Task**
   - Implement what the task describes
   - Be thorough but focused
   - Keep changes minimal and targeted

4. **Verify the Task**
   Run the task's verificationCommand (if provided):
\`\`\`bash
# Example: pnpm test
\`\`\`

5. **Update bugfix_tasks.json**
   Mark the task as completed:
\`\`\`json
{
  "id": "bugfix-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
\`\`\`

6. **Commit Progress**
\`\`\`bash
git add -A
git commit -m "bugfix: complete task-XXX - <description>"
\`\`\`

7. **Update claude-progress.txt**
   Document what you did in this session.

## Completion

When ALL tasks are completed and verified:
- All tests should pass
- Say "Fix verified - bug is resolved" to indicate completion

Work on ONE task at a time. Leave the codebase in a working state.`;
}

// =============================================================================
// State Management
// =============================================================================

function loadOrCreateState(options: BugFixOptions): BugfixState {
  const projectDir = resolve(options.projectDir);

  // Try to load existing state
  const existing = loadBugfixState(projectDir);
  if (existing) {
    // Sync tasks from file (agent may have modified it)
    return syncBugfixTasksFromFile(existing);
  }

  // Load error from file if provided
  let errorInput = options.errorInput;
  if (options.errorFile && existsSync(options.errorFile)) {
    errorInput = readFileSync(options.errorFile, "utf-8");
  }

  // Create new state
  return createBugfixState({
    projectDir,
    model: options.model ?? "claude-sonnet-4-5",
    errorInput,
    errorFile: options.errorFile,
  });
}

// =============================================================================
// Completion Detection
// =============================================================================

function checkBugfixCompletion(response: string, state: BugfixState): boolean {
  // Re-sync tasks from file after each session
  const updated = syncBugfixTasksFromFile(state);

  // Check if all tasks are complete
  if (isComplete(updated)) {
    return true;
  }

  // Also check for explicit completion phrases (fallback)
  const lower = response.toLowerCase();
  const completionPhrases = [
    "fix verified",
    "bug fixed",
    "bug is resolved",
    "successfully fixed",
    "all tasks completed",
    "bug fix complete",
  ];

  return completionPhrases.some((phrase) => lower.includes(phrase));
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runBugFix(options: BugFixOptions): Promise<void> {
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
    agentName: "Bug Fix Agent",
    projectDir: resolvedProjectDir,
    model,
    stateType: "bugfix",
    initialized: state.initialized,
    sessionCount: state.sessionCount,
    maxSessions,
  });

  // Print error preview
  if (state.errorInput) {
    const preview = state.errorInput.length > 200
      ? state.errorInput.slice(0, 200) + "..."
      : state.errorInput;
    console.log(`Error input (${state.errorInput.length} chars):`);
    console.log(`  ${preview}\n`);
  }

  if (state.initialized) {
    printBugfixProgress(state);
  }

  // Run the long-running agent loop
  const result = await runLongRunningAgent({
    projectDir: resolvedProjectDir,
    model,
    agentType: "bugfix",
    systemPrompt: SYSTEM_PROMPT,
    maxSessions: maxSessions ?? Infinity,
    enablePuppeteer: false,
    sandboxEnabled: true,

    getPrompt: (sessionNumber, currentState) => {
      const bugfixState = currentState as BugfixState;
      if (!bugfixState.initialized) {
        return getInitializerPrompt(bugfixState);
      }
      return getWorkerPrompt(bugfixState);
    },

    loadState: () => loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model }),

    saveState: (updatedState) => {
      state = updatedState as BugfixState;
      saveState(state);
    },

    onSessionStart: (sessionNumber) => {
      console.log(`\n--- Bug Fix Session ${sessionNumber} ---\n`);
    },

    onSessionEnd: (sessionNumber, response) => {
      // Sync state from files
      state = syncBugfixTasksFromFile(state);
      state = incrementSession(state) as BugfixState;

      if (!state.initialized) {
        state = markInitialized(state) as BugfixState;
      }

      saveState(state);

      // Append to progress
      const progress = getBugfixProgress(state.tasks);
      appendProgress(
        resolvedProjectDir,
        `Session ${sessionNumber} completed. Tasks: ${progress.completed}/${progress.total} completed.`
      );
    },

    isComplete: (response) => checkBugfixCompletion(response, state),
  });

  // Print completion summary
  printLongRunningCompletion({
    agentName: "Bug Fix Agent",
    completed: result.completed,
    sessions: result.sessions,
    state,
  });
}

// =============================================================================
// Exports
// =============================================================================

export { getInitializerPrompt, getWorkerPrompt };
