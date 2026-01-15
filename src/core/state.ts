/**
 * Persistent State Management
 *
 * File-based state persistence for the execute agent.
 * Enables crash recovery, session continuity, and progress tracking.
 *
 * Key files:
 * - .ai-agent-state.json: Core state (type, session count, initialized)
 * - execute_tasks.json: Task list for execute agent
 * - claude-progress.txt: Human-readable progress notes
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

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

const STATE_FILE = ".ai-agent-state.json";
const EXECUTE_TASKS_FILE = "execute_tasks.json";
const PROGRESS_FILE = "claude-progress.txt";

export function getStateFilePath(projectDir: string): string {
  return join(projectDir, STATE_FILE);
}

export function getExecuteTasksPath(projectDir: string): string {
  return join(projectDir, EXECUTE_TASKS_FILE);
}

export function getProgressFilePath(projectDir: string): string {
  return join(projectDir, PROGRESS_FILE);
}

// =============================================================================
// State Detection
// =============================================================================

export function hasExistingState(projectDir: string): boolean {
  return existsSync(getStateFilePath(projectDir));
}

export function detectStateType(projectDir: string): LongRunningAgentType | null {
  const statePath = getStateFilePath(projectDir);
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

export function isInitialized(projectDir: string): boolean {
  const statePath = getStateFilePath(projectDir);
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

export function loadState(projectDir: string): ProjectState | null {
  const statePath = getStateFilePath(projectDir);
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

export function loadExecuteState(projectDir: string): ExecuteState | null {
  const state = loadState(projectDir);
  if (!state || state.type !== "execute") {
    return null;
  }
  return state;
}

// =============================================================================
// State Creation
// =============================================================================

export interface CreateExecuteStateOptions {
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
  const statePath = getStateFilePath(state.projectDir);

  // Ensure directory exists
  const dir = dirname(statePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

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

export function loadExecuteTasks(projectDir: string): AgentTask[] {
  const tasksPath = getExecuteTasksPath(projectDir);
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

export function saveExecuteTasks(projectDir: string, tasks: AgentTask[]): void {
  const tasksPath = getExecuteTasksPath(projectDir);
  writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
}

export function syncExecuteTasksFromFile(state: ExecuteState): ExecuteState {
  const tasks = loadExecuteTasks(state.projectDir);
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

export function appendProgress(projectDir: string, message: string): void {
  const progressPath = getProgressFilePath(projectDir);
  const timestamp = new Date().toISOString();
  const entry = `\n[${timestamp}]\n${message}\n`;

  if (existsSync(progressPath)) {
    const existing = readFileSync(progressPath, "utf-8");
    writeFileSync(progressPath, existing + entry);
  } else {
    writeFileSync(progressPath, `# Claude Progress Log\n${entry}`);
  }
}

export function readProgress(projectDir: string): string {
  const progressPath = getProgressFilePath(projectDir);
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
