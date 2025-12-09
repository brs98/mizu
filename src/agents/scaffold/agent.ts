/**
 * Scaffold Agent
 *
 * A long-running agent for scaffolding new packages, libraries, or project structures.
 * Designed for tasks like:
 * - Creating new packages by copying patterns from reference implementations
 * - Setting up codegen pipelines
 * - Configuring build tooling
 * - Any multi-step project setup that needs verification
 *
 * Key features:
 * - Reference directory support for copying patterns from existing code
 * - Task-based progress tracking with verification commands
 * - Multi-session support with crash recovery
 * - Flexible verification (commands, patterns, or manual)
 */

import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  type ScaffoldState,
  createScaffoldState,
  loadScaffoldState,
  saveState,
  syncTasksFromFile,
  getScaffoldProgress,
  isComplete,
  printScaffoldProgress,
  appendProgress,
  markInitialized,
  incrementSession,
} from "../../core/state";
import { loadAndRenderPrompt, type PromptContext } from "../../core/prompts";
import { getDepthConfig, type DepthLevel } from "../../core/depth";
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

export interface ScaffoldOptions {
  projectDir: string;
  specFile?: string;
  specText?: string;
  referenceDir?: string;
  additionalReadPaths?: string[];
  verificationCommands?: string[];
  depth?: DepthLevel;
  model?: string;
  maxSessions?: number;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are an expert software engineer scaffolding a new project or package.

You work methodically, one task at a time, ensuring each task is verified before moving on.

You understand that:
- Quality matters more than speed
- Each session is independent - you have no memory of previous sessions
- scaffold_tasks.json is the source of truth for progress
- Git history shows what was done before
- Verification commands prove tasks are actually complete

You always:
- Read scaffold_tasks.json to understand what needs to be done
- Check git log to see recent progress
- Verify the project builds/typechecks before adding new code
- Run verification commands after completing tasks
- Commit progress with descriptive messages
- Update scaffold_tasks.json and claude-progress.txt before ending

You never:
- Try to complete multiple tasks at once without verification
- Mark tasks as completed without running verification
- Skip reading reference implementations when they're provided
- Leave the project in a non-building state

When copying patterns from reference directories:
- Read and understand the reference code first
- Adapt patterns to the new context, don't copy blindly
- Maintain consistent naming and style with the reference`;

// =============================================================================
// Prompt Generation
// =============================================================================

interface ScaffoldPromptContext extends PromptContext {
  project_dir: string;
  model: string;
  session_number: number;
  spec_file?: string;
  spec_text?: string;
  reference_dir?: string;
  additional_read_paths: string;
  verification_commands: string;
  total_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  percentage: number;
}

function getInitializerPrompt(state: ScaffoldState, options: ScaffoldOptions): string {
  // Load spec text from file if provided
  let specText = options.specText;
  if (options.specFile && existsSync(options.specFile)) {
    specText = readFileSync(options.specFile, "utf-8");
  }

  const context: ScaffoldPromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    spec_file: options.specFile,
    spec_text: specText,
    reference_dir: state.referenceDir,
    additional_read_paths: state.additionalReadPaths.join(", "),
    verification_commands: state.verificationCommands.join(", "),
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

function getWorkingPrompt(state: ScaffoldState): string {
  const progress = getScaffoldProgress(state.tasks);

  const context: ScaffoldPromptContext = {
    project_dir: state.projectDir,
    model: state.model,
    session_number: state.sessionCount + 1,
    reference_dir: state.referenceDir,
    additional_read_paths: state.additionalReadPaths.join(", "),
    verification_commands: state.verificationCommands.join(", "),
    total_tasks: progress.total,
    completed_tasks: progress.completed,
    remaining_tasks: progress.pending + progress.blocked,
    percentage: progress.percentage,
  };

  const promptFile = resolve(PROMPTS_DIR, "working.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return getFallbackWorkingPrompt(context);
}

// =============================================================================
// Fallback Prompts
// =============================================================================

function getFallbackInitializerPrompt(context: ScaffoldPromptContext): string {
  return `# Scaffold Initializer - Session 1

You are setting up a new project/package in ${context.project_dir}.

## Your Tasks

1. **Read the Specification**
   ${context.spec_text ? "The specification is provided below." : context.spec_file ? `Read the specification from: ${context.spec_file}` : "No specification provided - analyze the task from context."}

${context.spec_text ? `## Specification\n\n${context.spec_text}` : ""}

${context.reference_dir ? `2. **Study the Reference Implementation**
   - Read key files from: ${context.reference_dir}
   - Understand the patterns, structure, and conventions used
   - Note which files/patterns to copy and adapt` : ""}

3. **Create scaffold_tasks.json**
   Break down the work into concrete, verifiable tasks:

\`\`\`json
[
  {
    "id": "task-001",
    "description": "Create package.json with dependencies",
    "status": "pending",
    "verificationCommand": "cat package.json | jq '.name'",
    "dependencies": []
  },
  {
    "id": "task-002",
    "description": "Set up TypeScript configuration",
    "status": "pending",
    "verificationCommand": "pnpm typecheck",
    "dependencies": ["task-001"]
  }
]
\`\`\`

4. **Initialize Git Tracking**
\`\`\`bash
git init  # if not already a repo
git add scaffold_tasks.json
git commit -m "Initialize scaffold tasks"
\`\`\`

5. **Create claude-progress.txt**
   Document what you planned and any decisions made.

## Task Requirements

- Each task should be independently verifiable
- Use verificationCommand when possible (shell command that succeeds = task works)
- Order tasks by dependencies
- All tasks start with "status": "pending"
- Include 10-30 tasks depending on complexity

When done, the next session will begin executing tasks.`;
}

function getFallbackWorkingPrompt(context: ScaffoldPromptContext): string {
  return `# Scaffold Worker - Session ${context.session_number}

Continue scaffolding the project in ${context.project_dir}.

## Progress
- Tasks: ${context.completed_tasks}/${context.total_tasks} completed (${context.percentage}%)
- Remaining: ${context.remaining_tasks}

## Your Tasks

1. **Get Your Bearings**
\`\`\`bash
pwd
git log --oneline -10
cat claude-progress.txt
\`\`\`

2. **Read scaffold_tasks.json**
   Find the next pending task whose dependencies are all completed.

${context.reference_dir ? `3. **Check Reference Implementation**
   If the task involves copying patterns, read from: ${context.reference_dir}` : ""}

4. **Execute the Task**
   - Implement what the task describes
   - Follow patterns from reference if available
   - Keep changes focused on this one task

5. **Verify the Task**
   Run the task's verificationCommand (if provided):
\`\`\`bash
# Example: pnpm typecheck
\`\`\`

6. **Update scaffold_tasks.json**
   Mark the task as completed:
\`\`\`json
{
  "id": "task-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
\`\`\`

7. **Commit Progress**
\`\`\`bash
git add -A
git commit -m "scaffold: complete task-XXX - <description>"
\`\`\`

8. **Update claude-progress.txt**
   Document what you did in this session.

## Final Verification Commands

When ALL tasks are completed, run these verification commands:
${context.verification_commands || "pnpm typecheck, pnpm build"}

Work on ONE task at a time. Leave the project in a building state.`;
}

// =============================================================================
// State Management
// =============================================================================

function loadOrCreateState(options: ScaffoldOptions): ScaffoldState {
  const projectDir = resolve(options.projectDir);

  // Try to load existing state
  const existing = loadScaffoldState(projectDir);
  if (existing) {
    // Sync tasks from file (agent may have modified it)
    return syncTasksFromFile(existing);
  }

  // Create new state
  return createScaffoldState({
    projectDir,
    model: options.model ?? "claude-sonnet-4-5",
    specFile: options.specFile,
    specText: options.specText,
    referenceDir: options.referenceDir,
    additionalReadPaths: options.additionalReadPaths,
    verificationCommands: options.verificationCommands,
  });
}

// =============================================================================
// Completion Detection
// =============================================================================

function checkScaffoldCompletion(response: string, state: ScaffoldState): boolean {
  // Re-sync tasks from file after each session
  const updated = syncTasksFromFile(state);

  // Check if all tasks are complete
  if (isComplete(updated)) {
    return true;
  }

  // Also check for explicit completion phrases
  const lower = response.toLowerCase();
  const completionPhrases = [
    "all tasks completed",
    "scaffold complete",
    "scaffolding complete",
    "all tasks done",
    "project setup complete",
    "package setup complete",
    "100% complete",
  ];

  return completionPhrases.some((phrase) => lower.includes(phrase));
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runScaffold(options: ScaffoldOptions): Promise<void> {
  const {
    projectDir,
    depth = "standard",
    model = "claude-sonnet-4-5",
    maxSessions,
  } = options;

  const resolvedProjectDir = resolve(projectDir);
  const depthConfig = getDepthConfig(depth);

  // Ensure project directory exists
  if (!existsSync(resolvedProjectDir)) {
    mkdirSync(resolvedProjectDir, { recursive: true });
  }

  // Load or create state
  let state = loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model });

  // Collect all read paths
  const additionalReadPaths: string[] = [...(options.additionalReadPaths ?? [])];
  if (options.referenceDir) {
    additionalReadPaths.push(resolve(options.referenceDir));
  }

  // Print header
  printLongRunningHeader({
    agentName: "Scaffold Agent",
    projectDir: resolvedProjectDir,
    model,
    stateType: "scaffold",
    initialized: state.initialized,
    sessionCount: state.sessionCount,
    maxSessions,
  });

  // Print additional info
  if (options.specFile) {
    console.log(`Spec file: ${options.specFile}`);
  }
  if (options.referenceDir) {
    console.log(`Reference: ${options.referenceDir}`);
  }
  if (additionalReadPaths.length > 0) {
    console.log(`Read paths: ${additionalReadPaths.join(", ")}`);
  }

  if (state.initialized) {
    printScaffoldProgress(state);
  }

  // Run the long-running agent loop
  const result = await runLongRunningAgent({
    projectDir: resolvedProjectDir,
    model,
    agentType: "scaffold",
    systemPrompt: SYSTEM_PROMPT,
    maxSessions: maxSessions ?? depthConfig.maxIterations,
    enablePuppeteer: false, // Scaffold doesn't need browser testing
    sandboxEnabled: true,
    additionalReadPaths,

    getPrompt: (sessionNumber, currentState) => {
      const scaffoldState = currentState as ScaffoldState;
      if (!scaffoldState.initialized) {
        return getInitializerPrompt(scaffoldState, options);
      }
      return getWorkingPrompt(scaffoldState);
    },

    loadState: () => loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model }),

    saveState: (updatedState) => {
      state = updatedState as ScaffoldState;
      saveState(state);
    },

    onSessionStart: (sessionNumber) => {
      console.log(`\n--- Scaffold Session ${sessionNumber} ---\n`);
    },

    onSessionEnd: (sessionNumber, response) => {
      // Sync state from files
      state = syncTasksFromFile(state);
      state = incrementSession(state) as ScaffoldState;

      if (!state.initialized) {
        state = markInitialized(state) as ScaffoldState;
      }

      saveState(state);

      // Append to progress
      const progress = getScaffoldProgress(state.tasks);
      appendProgress(
        resolvedProjectDir,
        `Session ${sessionNumber} completed. Tasks: ${progress.completed}/${progress.total} completed.`
      );
    },

    isComplete: (response) => checkScaffoldCompletion(response, state),
  });

  // Print completion summary
  printLongRunningCompletion({
    agentName: "Scaffold Agent",
    completed: result.completed,
    sessions: result.sessions,
    state,
  });
}

// =============================================================================
// Exports
// =============================================================================

export { getInitializerPrompt, getWorkingPrompt };
