/**
 * Persistent State Management
 *
 * File-based state persistence for the execute agent.
 * Enables crash recovery, session continuity, and progress tracking.
 *
 * All state files are stored in plan-scoped directories within .mizu/:
 * - .mizu/<plan-name>/plan.md: Copy of the original plan
 * - .mizu/<plan-name>/execution.json: Execution config from /harness
 * - .mizu/<plan-name>/state.json: Core state (type, session count, initialized)
 * - .mizu/<plan-name>/tasks.json: Task list for execute agent
 * - .mizu/<plan-name>/progress.txt: Human-readable progress notes
 *
 * This structure enables multiple plan executions without conflicts.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

// =============================================================================
// Core Types
// =============================================================================

export type AgentType = "execute";

// Backwards compatibility alias
export type LongRunningAgentType = AgentType;

export interface BaseState {
  version: string;
  type: LongRunningAgentType;
  initialized: boolean;
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
  model: string;
  projectDir: string;
}

// =============================================================================
// Task Types
// =============================================================================

export type AgentTaskStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

export interface AgentTask {
  id: string;
  description: string;
  status: AgentTaskStatus;
  verificationCommand?: string; // Command to run to verify task completion
  verificationPattern?: string; // Pattern to match in output to confirm success
  dependencies: string[]; // Task IDs this depends on
  completedAt?: string;
  notes?: string;
}

// =============================================================================
// Execute State (Plan Execution)
// =============================================================================

export interface ExecutionPermissions {
  preset: "readonly" | "dev" | "full";
  inferred: string[];
  allow: string[];
  deny: string[];
}

export interface ExecutionConfig {
  version: string;
  planFile: string;
  projectDir: string;
  model: string;
  tasks: AgentTask[];
  permissions: ExecutionPermissions;
  context: {
    completionSummary: string;
    sessionCount: number;
  };
}

export interface ExecuteState extends BaseState {
  type: "execute";
  planName: string; // Plan identifier (directory name within .mizu)
  configFile: string;
  planFile: string;
  planContent: string;
  tasks: AgentTask[];
  completedTasks: number;
  totalTasks: number;
  permissions: ExecutionPermissions;
  recentSummaries: string[]; // Last 3 session summaries for bounded context
}

// =============================================================================
// Union Type
// =============================================================================

export type ProjectState = ExecuteState;

// =============================================================================
// File Paths
// =============================================================================

const MIZU_DIR = ".mizu";
const STATE_FILE = "state.json";
const EXECUTE_TASKS_FILE = "tasks.json";
const PROGRESS_FILE = "progress.txt";
const PLAN_FILE = "plan.md";
const EXECUTION_CONFIG_FILE = "execution.json";

/**
 * Get the base .mizu directory
 */
export function getMizuDir(projectDir: string): string {
  return join(projectDir, MIZU_DIR);
}

/**
 * Get plan-scoped directory: .mizu/<planName>/
 * @param projectDir - The project root directory
 * @param planName - The plan name (directory name within .mizu)
 */
export function getPlanDir(projectDir: string, planName: string): string {
  return join(getMizuDir(projectDir), planName);
}

/**
 * Extract plan name from a config file path.
 * e.g., /project/.mizu/my-plan/execution.json -> "my-plan"
 */
export function getPlanNameFromConfigPath(configPath: string): string {
  // Config is at .mizu/<plan-name>/execution.json
  // So parent directory name is the plan name
  return basename(dirname(configPath));
}

/**
 * Get state file path within a plan directory
 */
export function getStateFilePath(projectDir: string, planName: string): string {
  return join(getPlanDir(projectDir, planName), STATE_FILE);
}

/**
 * Get tasks file path within a plan directory
 */
export function getExecuteTasksPath(projectDir: string, planName: string): string {
  return join(getPlanDir(projectDir, planName), EXECUTE_TASKS_FILE);
}

/**
 * Get progress file path within a plan directory
 */
export function getProgressFilePath(projectDir: string, planName: string): string {
  return join(getPlanDir(projectDir, planName), PROGRESS_FILE);
}

/**
 * Get plan.md file path within a plan directory
 */
export function getPlanFilePath(projectDir: string, planName: string): string {
  return join(getPlanDir(projectDir, planName), PLAN_FILE);
}

/**
 * Get execution.json file path within a plan directory
 */
export function getExecutionConfigPath(projectDir: string, planName: string): string {
  return join(getPlanDir(projectDir, planName), EXECUTION_CONFIG_FILE);
}

/**
 * Ensure .mizu/ is in .gitignore
 * Adds it if not present, creates .gitignore if it doesn't exist
 */
function ensureGitignore(projectDir: string): void {
  const gitignorePath = join(projectDir, ".gitignore");
  const mizuPattern = ".mizu/";

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    // Check for .mizu/ or .mizu (with or without trailing slash)
    if (content.includes(".mizu")) {
      return; // Already has .mizu entry
    }
    // Append .mizu/ to existing .gitignore
    const newContent = content.endsWith("\n")
      ? `${content}# Mizu execution state\n${mizuPattern}\n`
      : `${content}\n\n# Mizu execution state\n${mizuPattern}\n`;
    writeFileSync(gitignorePath, newContent);
  } else {
    // Create new .gitignore with .mizu/
    writeFileSync(gitignorePath, `# Mizu execution state\n${mizuPattern}\n`);
  }
}

/**
 * Ensure the .mizu directory exists and is gitignored
 */
export function ensureMizuDir(projectDir: string): void {
  const mizuDir = getMizuDir(projectDir);
  if (!existsSync(mizuDir)) {
    mkdirSync(mizuDir, { recursive: true });
    // Only update .gitignore when first creating .mizu/
    ensureGitignore(projectDir);
  }
}

/**
 * Ensure the plan-specific directory exists within .mizu/
 * Creates .mizu/<planName>/ and ensures .gitignore is updated
 */
export function ensurePlanDir(projectDir: string, planName: string): void {
  ensureMizuDir(projectDir);
  const planDir = getPlanDir(projectDir, planName);
  if (!existsSync(planDir)) {
    mkdirSync(planDir, { recursive: true });
  }
}

// =============================================================================
// State Detection
// =============================================================================

export function hasExistingState(projectDir: string, planName: string): boolean {
  return existsSync(getStateFilePath(projectDir, planName));
}

export function detectStateType(projectDir: string, planName: string): LongRunningAgentType | null {
  const statePath = getStateFilePath(projectDir, planName);
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    const state = JSON.parse(content) as ProjectState;
    return state.type;
  } catch {
    return null;
  }
}

export function isInitialized(projectDir: string, planName: string): boolean {
  const statePath = getStateFilePath(projectDir, planName);
  if (!existsSync(statePath)) {
    return false;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    const state = JSON.parse(content) as ProjectState;
    return state.initialized;
  } catch {
    return false;
  }
}

// =============================================================================
// State Loading
// =============================================================================

export function loadState(projectDir: string, planName: string): ProjectState | null {
  const statePath = getStateFilePath(projectDir, planName);
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as ProjectState;
  } catch (error) {
    console.error(`Failed to load state from ${statePath}:`, error);
    return null;
  }
}

export function loadExecuteState(projectDir: string, planName: string): ExecuteState | null {
  const state = loadState(projectDir, planName);
  if (!state || state.type !== "execute") {
    return null;
  }
  return state;
}

// =============================================================================
// State Creation
// =============================================================================

export interface CreateExecuteStateOptions {
  planName: string;
  configFile: string;
  planFile: string;
  planContent: string;
  projectDir: string;
  model: string;
  tasks: AgentTask[];
  permissions: ExecutionPermissions;
}

export function createExecuteState(options: CreateExecuteStateOptions): ExecuteState {
  return {
    version: "1.0",
    type: "execute",
    planName: options.planName,
    configFile: options.configFile,
    planFile: options.planFile,
    planContent: options.planContent,
    projectDir: options.projectDir,
    model: options.model,
    initialized: false,
    sessionCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: options.tasks,
    totalTasks: options.tasks.length,
    completedTasks: 0,
    permissions: options.permissions,
    recentSummaries: [],
  };
}

// =============================================================================
// State Saving
// =============================================================================

export function saveState(state: ProjectState): void {
  // Use planName from state to determine path
  const statePath = getStateFilePath(state.projectDir, state.planName);

  // Ensure plan directory exists
  ensurePlanDir(state.projectDir, state.planName);

  // Update timestamp
  state.updatedAt = new Date().toISOString();

  // Update counts
  if (state.type === "execute") {
    state.totalTasks = state.tasks.length;
    state.completedTasks = state.tasks.filter((t) => t.status === "completed").length;
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// =============================================================================
// Task Management (Execute)
// =============================================================================

export function loadExecuteTasks(projectDir: string, planName: string): AgentTask[] {
  const tasksPath = getExecuteTasksPath(projectDir, planName);
  if (!existsSync(tasksPath)) {
    return [];
  }

  try {
    const content = readFileSync(tasksPath, "utf-8");
    return JSON.parse(content) as AgentTask[];
  } catch (error) {
    console.error(`Failed to load execute tasks from ${tasksPath}:`, error);
    return [];
  }
}

export function saveExecuteTasks(projectDir: string, planName: string, tasks: AgentTask[]): void {
  ensurePlanDir(projectDir, planName);
  const tasksPath = getExecuteTasksPath(projectDir, planName);
  writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
}

export function syncExecuteTasksFromFile(state: ExecuteState): ExecuteState {
  const tasks = loadExecuteTasks(state.projectDir, state.planName);
  return {
    ...state,
    tasks,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "completed").length,
  };
}

export function getNextPendingTask(tasks: AgentTask[]): AgentTask | null {
  // Find the first pending task whose dependencies are all completed
  for (const task of tasks) {
    if (task.status === "pending") {
      const dependenciesComplete = task.dependencies.every((depId) => {
        const depTask = tasks.find((t) => t.id === depId);
        return depTask && (depTask.status === "completed" || depTask.status === "skipped");
      });
      if (dependenciesComplete) {
        return task;
      }
    }
  }
  return null;
}

export function getExecuteProgress(tasks: AgentTask[]): {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  blocked: number;
  skipped: number;
  percentage: number;
} {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const skipped = tasks.filter((t) => t.status === "skipped").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, pending, inProgress, blocked, skipped, percentage };
}

// =============================================================================
// Progress File Management
// =============================================================================

export function appendProgress(projectDir: string, planName: string, message: string): void {
  ensurePlanDir(projectDir, planName);
  const progressPath = getProgressFilePath(projectDir, planName);
  const timestamp = new Date().toISOString();
  const entry = `\n[${timestamp}]\n${message}\n`;

  if (existsSync(progressPath)) {
    const existing = readFileSync(progressPath, "utf-8");
    writeFileSync(progressPath, existing + entry);
  } else {
    writeFileSync(progressPath, `# Claude Progress Log\n${entry}`);
  }
}

export function readProgress(projectDir: string, planName: string): string {
  const progressPath = getProgressFilePath(projectDir, planName);
  if (!existsSync(progressPath)) {
    return "";
  }
  return readFileSync(progressPath, "utf-8");
}

// =============================================================================
// Session Management
// =============================================================================

export function incrementSession(state: ProjectState): ProjectState {
  return {
    ...state,
    sessionCount: state.sessionCount + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function markInitialized(state: ProjectState): ProjectState {
  return {
    ...state,
    initialized: true,
    updatedAt: new Date().toISOString(),
  };
}

export function addRecentSummary(state: ExecuteState, summary: string): ExecuteState {
  const summaries = [...state.recentSummaries, summary].slice(-3); // Keep last 3
  return {
    ...state,
    recentSummaries: summaries,
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Progress Display
// =============================================================================

export function printExecuteProgress(state: ExecuteState): void {
  const progress = getExecuteProgress(state.tasks);

  console.log("\n" + "-".repeat(50));
  console.log("  PLAN EXECUTION PROGRESS");
  console.log("-".repeat(50));
  console.log(`  Plan: ${state.planFile}`);
  console.log(`  Sessions completed: ${state.sessionCount}`);
  console.log(`  Tasks: ${progress.completed}/${progress.total} completed (${progress.percentage}%)`);
  if (progress.inProgress > 0) console.log(`  In progress: ${progress.inProgress}`);
  if (progress.blocked > 0) console.log(`  Blocked: ${progress.blocked}`);
  if (progress.skipped > 0) console.log(`  Skipped: ${progress.skipped}`);

  if (progress.pending > 0) {
    const nextTask = getNextPendingTask(state.tasks);
    if (nextTask) {
      console.log(`  Next task: ${nextTask.description.slice(0, 50)}...`);
    }
  } else if (progress.completed === progress.total) {
    console.log("  Status: PLAN EXECUTION COMPLETE!");
  }
  console.log("-".repeat(50) + "\n");
}

export function printProgress(state: ProjectState): void {
  if (state.type === "execute") {
    printExecuteProgress(state);
  }
}

// =============================================================================
// Completion Detection
// =============================================================================

export function isComplete(state: ProjectState): boolean {
  if (state.type === "execute") {
    return (
      state.tasks.length > 0 &&
      state.tasks.every((t) => t.status === "completed" || t.status === "skipped")
    );
  }
  return false;
}
