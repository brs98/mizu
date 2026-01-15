/**
 * Persistent State Management
 *
 * File-based state persistence for long-running agents.
 * Enables crash recovery, session continuity, and progress tracking.
 *
 * Key files:
 * - .ai-agent-state.json: Core state (type, session count, initialized)
 * - feature_list.json: Test cases for builder agent
 * - migration_manifest.json: File list for migrator agent
 * - claude-progress.txt: Human-readable progress notes
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// =============================================================================
// Core Types
// =============================================================================

export type AgentType = "builder" | "migrator" | "scaffold" | "bugfix" | "feature" | "refactor" | "execute";

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
// Builder State (App Development)
// =============================================================================

export type FeatureCategory = "functional" | "style" | "performance" | "security";

export interface FeatureTest {
  id: string;
  category: FeatureCategory;
  description: string;
  steps: string[];
  passes: boolean;
  lastTestedAt?: string;
  failureReason?: string;
}

export interface BuilderState extends BaseState {
  type: "builder";
  specFile?: string;
  specText?: string;
  features: FeatureTest[];
  completedFeatures: number;
  totalFeatures: number;
}

// =============================================================================
// Migrator State (Schema Migration)
// =============================================================================

export type MigrationFileStatus =
  | "pending"
  | "in_progress"
  | "migrated"
  | "skipped"
  | "blocked"
  | "error";

export interface MigrationFile {
  path: string;
  status: MigrationFileStatus;
  dependencies: string[];
  sourceType: string; // e.g., "zod"
  targetType: string; // e.g., "openapi"
  error?: string;
  migratedAt?: string;
}

export interface MigratorState extends BaseState {
  type: "migrator";
  sourceDir: string;
  targetDir?: string;
  migrationType: string; // e.g., "zod-to-openapi"
  files: MigrationFile[];
  completedFiles: number;
  totalFiles: number;
}

// =============================================================================
// Scaffold State (Package/Project Scaffolding)
// =============================================================================

export type ScaffoldTaskStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

export interface ScaffoldTask {
  id: string;
  description: string;
  status: ScaffoldTaskStatus;
  verificationCommand?: string; // Command to run to verify task completion
  verificationPattern?: string; // Pattern to match in output to confirm success
  dependencies: string[]; // Task IDs this depends on
  completedAt?: string;
  notes?: string;
}

export interface ScaffoldState extends BaseState {
  type: "scaffold";
  specFile?: string;
  specText?: string;
  referenceDir?: string; // Directory containing reference implementation to copy patterns from
  additionalReadPaths: string[]; // Other directories the agent can read from
  tasks: ScaffoldTask[];
  completedTasks: number;
  totalTasks: number;
  verificationCommands: string[]; // Commands to run at the end to verify everything works
}

// =============================================================================
// Bugfix State
// =============================================================================

// Reuse ScaffoldTask as the generic task type - it's well-designed for all agents
export type AgentTask = ScaffoldTask;
export type AgentTaskStatus = ScaffoldTaskStatus;

export interface BugfixState extends BaseState {
  type: "bugfix";
  errorInput?: string;
  errorFile?: string;
  tasks: AgentTask[];
  completedTasks: number;
  totalTasks: number;
}

// =============================================================================
// Feature State
// =============================================================================

export interface FeatureState extends BaseState {
  type: "feature";
  specFile?: string;
  specText?: string;
  tasks: AgentTask[];
  completedTasks: number;
  totalTasks: number;
}

// =============================================================================
// Refactor State
// =============================================================================

export type RefactorFocus = "performance" | "readability" | "patterns" | "all";

export interface RefactorState extends BaseState {
  type: "refactor";
  target?: string;
  focus?: RefactorFocus;
  tasks: AgentTask[];
  completedTasks: number;
  totalTasks: number;
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

export type ProjectState =
  | BuilderState
  | MigratorState
  | ScaffoldState
  | BugfixState
  | FeatureState
  | RefactorState
  | ExecuteState;

// =============================================================================
// File Paths
// =============================================================================

const STATE_FILE = ".ai-agent-state.json";
const FEATURE_LIST_FILE = "feature_list.json";
const MIGRATION_MANIFEST_FILE = "migration_manifest.json";
const SCAFFOLD_TASKS_FILE = "scaffold_tasks.json";
const BUGFIX_TASKS_FILE = "bugfix_tasks.json";
const FEATURE_TASKS_FILE = "feature_tasks.json";
const REFACTOR_TASKS_FILE = "refactor_tasks.json";
const EXECUTE_TASKS_FILE = "execute_tasks.json";
const PROGRESS_FILE = "claude-progress.txt";

export function getStateFilePath(projectDir: string): string {
  return join(projectDir, STATE_FILE);
}

export function getFeatureListPath(projectDir: string): string {
  return join(projectDir, FEATURE_LIST_FILE);
}

export function getMigrationManifestPath(projectDir: string): string {
  return join(projectDir, MIGRATION_MANIFEST_FILE);
}

export function getScaffoldTasksPath(projectDir: string): string {
  return join(projectDir, SCAFFOLD_TASKS_FILE);
}

export function getBugfixTasksPath(projectDir: string): string {
  return join(projectDir, BUGFIX_TASKS_FILE);
}

export function getFeatureTasksPath(projectDir: string): string {
  return join(projectDir, FEATURE_TASKS_FILE);
}

export function getRefactorTasksPath(projectDir: string): string {
  return join(projectDir, REFACTOR_TASKS_FILE);
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

export function loadBuilderState(projectDir: string): BuilderState | null {
  const state = loadState(projectDir);
  if (state?.type === "builder") {
    return state;
  }
  return null;
}

export function loadMigratorState(projectDir: string): MigratorState | null {
  const state = loadState(projectDir);
  if (state?.type === "migrator") {
    return state;
  }
  return null;
}

export function loadScaffoldState(projectDir: string): ScaffoldState | null {
  const state = loadState(projectDir);
  if (state?.type === "scaffold") {
    return state;
  }
  return null;
}

export function loadBugfixState(projectDir: string): BugfixState | null {
  const state = loadState(projectDir);
  if (state?.type === "bugfix") {
    return state as BugfixState;
  }
  return null;
}

export function loadFeatureState(projectDir: string): FeatureState | null {
  const state = loadState(projectDir);
  if (state?.type === "feature") {
    return state as FeatureState;
  }
  return null;
}

export function loadRefactorState(projectDir: string): RefactorState | null {
  const state = loadState(projectDir);
  if (state?.type === "refactor") {
    return state as RefactorState;
  }
  return null;
}

export function loadExecuteState(projectDir: string): ExecuteState | null {
  const state = loadState(projectDir);
  if (state?.type === "execute") {
    return state as ExecuteState;
  }
  return null;
}

// =============================================================================
// State Creation
// =============================================================================

export interface CreateBuilderStateOptions {
  projectDir: string;
  model: string;
  specFile?: string;
  specText?: string;
}

export function createBuilderState(options: CreateBuilderStateOptions): BuilderState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    type: "builder",
    initialized: false,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    model: options.model,
    projectDir: options.projectDir,
    specFile: options.specFile,
    specText: options.specText,
    features: [],
    completedFeatures: 0,
    totalFeatures: 0,
  };
}

export interface CreateMigratorStateOptions {
  projectDir: string;
  model: string;
  sourceDir: string;
  targetDir?: string;
  migrationType: string;
}

export function createMigratorState(options: CreateMigratorStateOptions): MigratorState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    type: "migrator",
    initialized: false,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    model: options.model,
    projectDir: options.projectDir,
    sourceDir: options.sourceDir,
    targetDir: options.targetDir,
    migrationType: options.migrationType,
    files: [],
    completedFiles: 0,
    totalFiles: 0,
  };
}

export interface CreateScaffoldStateOptions {
  projectDir: string;
  model: string;
  specFile?: string;
  specText?: string;
  referenceDir?: string;
  additionalReadPaths?: string[];
  verificationCommands?: string[];
}

export function createScaffoldState(options: CreateScaffoldStateOptions): ScaffoldState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    type: "scaffold",
    initialized: false,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    model: options.model,
    projectDir: options.projectDir,
    specFile: options.specFile,
    specText: options.specText,
    referenceDir: options.referenceDir,
    additionalReadPaths: options.additionalReadPaths ?? [],
    tasks: [],
    completedTasks: 0,
    totalTasks: 0,
    verificationCommands: options.verificationCommands ?? ["pnpm typecheck", "pnpm build"],
  };
}

export interface CreateBugfixStateOptions {
  projectDir: string;
  model: string;
  errorInput?: string;
  errorFile?: string;
}

export function createBugfixState(options: CreateBugfixStateOptions): BugfixState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    type: "bugfix",
    initialized: false,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    model: options.model,
    projectDir: options.projectDir,
    errorInput: options.errorInput,
    errorFile: options.errorFile,
    tasks: [],
    completedTasks: 0,
    totalTasks: 0,
  };
}

export interface CreateFeatureStateOptions {
  projectDir: string;
  model: string;
  specFile?: string;
  specText?: string;
}

export function createFeatureState(options: CreateFeatureStateOptions): FeatureState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    type: "feature",
    initialized: false,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    model: options.model,
    projectDir: options.projectDir,
    specFile: options.specFile,
    specText: options.specText,
    tasks: [],
    completedTasks: 0,
    totalTasks: 0,
  };
}

export interface CreateRefactorStateOptions {
  projectDir: string;
  model: string;
  target?: string;
  focus?: RefactorFocus;
}

export function createRefactorState(options: CreateRefactorStateOptions): RefactorState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    type: "refactor",
    initialized: false,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    model: options.model,
    projectDir: options.projectDir,
    target: options.target,
    focus: options.focus,
    tasks: [],
    completedTasks: 0,
    totalTasks: 0,
  };
}

export interface CreateExecuteStateOptions {
  projectDir: string;
  model: string;
  configFile: string;
  planFile: string;
  planContent: string;
  tasks: AgentTask[];
  permissions: ExecutionPermissions;
}

export function createExecuteState(options: CreateExecuteStateOptions): ExecuteState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    type: "execute",
    initialized: true, // Execute starts initialized (no initializer phase)
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    model: options.model,
    projectDir: options.projectDir,
    configFile: options.configFile,
    planFile: options.planFile,
    planContent: options.planContent,
    tasks: options.tasks,
    completedTasks: 0,
    totalTasks: options.tasks.length,
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
  if (state.type === "builder") {
    state.totalFeatures = state.features.length;
    state.completedFeatures = state.features.filter((f) => f.passes).length;
  } else if (state.type === "migrator") {
    state.totalFiles = state.files.length;
    state.completedFiles = state.files.filter((f) => f.status === "migrated").length;
  } else if (state.type === "scaffold") {
    state.totalTasks = state.tasks.length;
    state.completedTasks = state.tasks.filter((t) => t.status === "completed").length;
  } else if (state.type === "bugfix" || state.type === "feature" || state.type === "refactor" || state.type === "execute") {
    state.totalTasks = state.tasks.length;
    state.completedTasks = state.tasks.filter((t) => t.status === "completed").length;
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// =============================================================================
// Feature List Management (Builder)
// =============================================================================

export function loadFeatureList(projectDir: string): FeatureTest[] {
  const featureListPath = getFeatureListPath(projectDir);
  if (!existsSync(featureListPath)) {
    return [];
  }

  try {
    const content = readFileSync(featureListPath, "utf-8");
    return JSON.parse(content) as FeatureTest[];
  } catch (error) {
    console.error(`Failed to load feature list from ${featureListPath}:`, error);
    return [];
  }
}

export function saveFeatureList(projectDir: string, features: FeatureTest[]): void {
  const featureListPath = getFeatureListPath(projectDir);
  writeFileSync(featureListPath, JSON.stringify(features, null, 2));
}

export function syncFeaturesFromFile(state: BuilderState): BuilderState {
  const features = loadFeatureList(state.projectDir);
  return {
    ...state,
    features,
    totalFeatures: features.length,
    completedFeatures: features.filter((f) => f.passes).length,
  };
}

export function getNextFailingFeature(features: FeatureTest[]): FeatureTest | null {
  return features.find((f) => !f.passes) ?? null;
}

export function getFeatureProgress(features: FeatureTest[]): {
  total: number;
  passing: number;
  failing: number;
  percentage: number;
} {
  const total = features.length;
  const passing = features.filter((f) => f.passes).length;
  const failing = total - passing;
  const percentage = total > 0 ? Math.round((passing / total) * 100) : 0;
  return { total, passing, failing, percentage };
}

// =============================================================================
// Migration Manifest Management (Migrator)
// =============================================================================

export function loadMigrationManifest(projectDir: string): MigrationFile[] {
  const manifestPath = getMigrationManifestPath(projectDir);
  if (!existsSync(manifestPath)) {
    return [];
  }

  try {
    const content = readFileSync(manifestPath, "utf-8");
    return JSON.parse(content) as MigrationFile[];
  } catch (error) {
    console.error(`Failed to load migration manifest from ${manifestPath}:`, error);
    return [];
  }
}

export function saveMigrationManifest(projectDir: string, files: MigrationFile[]): void {
  const manifestPath = getMigrationManifestPath(projectDir);
  writeFileSync(manifestPath, JSON.stringify(files, null, 2));
}

export function syncManifestFromFile(state: MigratorState): MigratorState {
  const files = loadMigrationManifest(state.projectDir);
  return {
    ...state,
    files,
    totalFiles: files.length,
    completedFiles: files.filter((f) => f.status === "migrated").length,
  };
}

export function getNextPendingFile(files: MigrationFile[]): MigrationFile | null {
  // Find files that are pending and have all dependencies migrated
  return (
    files.find((f) => {
      if (f.status !== "pending") return false;
      // Check all dependencies are migrated
      return f.dependencies.every((dep) => {
        const depFile = files.find((df) => df.path === dep);
        return depFile?.status === "migrated";
      });
    }) ?? null
  );
}

export function getMigrationProgress(files: MigrationFile[]): {
  total: number;
  migrated: number;
  pending: number;
  inProgress: number;
  blocked: number;
  error: number;
  percentage: number;
} {
  const total = files.length;
  const migrated = files.filter((f) => f.status === "migrated").length;
  const pending = files.filter((f) => f.status === "pending").length;
  const inProgress = files.filter((f) => f.status === "in_progress").length;
  const blocked = files.filter((f) => f.status === "blocked").length;
  const error = files.filter((f) => f.status === "error").length;
  const percentage = total > 0 ? Math.round((migrated / total) * 100) : 0;
  return { total, migrated, pending, inProgress, blocked, error, percentage };
}

// =============================================================================
// Scaffold Tasks Management
// =============================================================================

export function loadScaffoldTasks(projectDir: string): ScaffoldTask[] {
  const tasksPath = getScaffoldTasksPath(projectDir);
  if (!existsSync(tasksPath)) {
    return [];
  }

  try {
    const content = readFileSync(tasksPath, "utf-8");
    return JSON.parse(content) as ScaffoldTask[];
  } catch (error) {
    console.error(`Failed to load scaffold tasks from ${tasksPath}:`, error);
    return [];
  }
}

export function saveScaffoldTasks(projectDir: string, tasks: ScaffoldTask[]): void {
  const tasksPath = getScaffoldTasksPath(projectDir);
  writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
}

export function syncTasksFromFile(state: ScaffoldState): ScaffoldState {
  const tasks = loadScaffoldTasks(state.projectDir);
  return {
    ...state,
    tasks,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "completed").length,
  };
}

export function getNextPendingTask(tasks: ScaffoldTask[]): ScaffoldTask | null {
  // Find tasks that are pending and have all dependencies completed
  return (
    tasks.find((t) => {
      if (t.status !== "pending") return false;
      // Check all dependencies are completed
      return t.dependencies.every((dep) => {
        const depTask = tasks.find((dt) => dt.id === dep);
        return depTask?.status === "completed";
      });
    }) ?? null
  );
}

export function getScaffoldProgress(tasks: ScaffoldTask[]): {
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
// Bugfix Tasks Management
// =============================================================================

export function loadBugfixTasks(projectDir: string): AgentTask[] {
  const tasksPath = getBugfixTasksPath(projectDir);
  if (!existsSync(tasksPath)) {
    return [];
  }

  try {
    const content = readFileSync(tasksPath, "utf-8");
    return JSON.parse(content) as AgentTask[];
  } catch (error) {
    console.error(`Failed to load bugfix tasks from ${tasksPath}:`, error);
    return [];
  }
}

export function saveBugfixTasks(projectDir: string, tasks: AgentTask[]): void {
  const tasksPath = getBugfixTasksPath(projectDir);
  writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
}

export function syncBugfixTasksFromFile(state: BugfixState): BugfixState {
  const tasks = loadBugfixTasks(state.projectDir);
  return {
    ...state,
    tasks,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "completed").length,
  };
}

export function getBugfixProgress(tasks: AgentTask[]): {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  blocked: number;
  skipped: number;
  percentage: number;
} {
  return getScaffoldProgress(tasks); // Reuse scaffold progress since task structure is identical
}

// =============================================================================
// Feature Tasks Management
// =============================================================================

export function loadFeatureTasks(projectDir: string): AgentTask[] {
  const tasksPath = getFeatureTasksPath(projectDir);
  if (!existsSync(tasksPath)) {
    return [];
  }

  try {
    const content = readFileSync(tasksPath, "utf-8");
    return JSON.parse(content) as AgentTask[];
  } catch (error) {
    console.error(`Failed to load feature tasks from ${tasksPath}:`, error);
    return [];
  }
}

export function saveFeatureTasks(projectDir: string, tasks: AgentTask[]): void {
  const tasksPath = getFeatureTasksPath(projectDir);
  writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
}

export function syncFeatureTasksFromFile(state: FeatureState): FeatureState {
  const tasks = loadFeatureTasks(state.projectDir);
  return {
    ...state,
    tasks,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "completed").length,
  };
}

export function getFeatureTaskProgress(tasks: AgentTask[]): {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  blocked: number;
  skipped: number;
  percentage: number;
} {
  return getScaffoldProgress(tasks); // Reuse scaffold progress since task structure is identical
}

// =============================================================================
// Refactor Tasks Management
// =============================================================================

export function loadRefactorTasks(projectDir: string): AgentTask[] {
  const tasksPath = getRefactorTasksPath(projectDir);
  if (!existsSync(tasksPath)) {
    return [];
  }

  try {
    const content = readFileSync(tasksPath, "utf-8");
    return JSON.parse(content) as AgentTask[];
  } catch (error) {
    console.error(`Failed to load refactor tasks from ${tasksPath}:`, error);
    return [];
  }
}

export function saveRefactorTasks(projectDir: string, tasks: AgentTask[]): void {
  const tasksPath = getRefactorTasksPath(projectDir);
  writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
}

export function syncRefactorTasksFromFile(state: RefactorState): RefactorState {
  const tasks = loadRefactorTasks(state.projectDir);
  return {
    ...state,
    tasks,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "completed").length,
  };
}

export function getRefactorProgress(tasks: AgentTask[]): {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  blocked: number;
  skipped: number;
  percentage: number;
} {
  return getScaffoldProgress(tasks); // Reuse scaffold progress since task structure is identical
}

// =============================================================================
// Execute Tasks Management
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
  // If no tasks file exists yet, use the tasks from state
  if (tasks.length === 0 && state.tasks.length > 0) {
    return state;
  }
  return {
    ...state,
    tasks: tasks.length > 0 ? tasks : state.tasks,
    totalTasks: tasks.length > 0 ? tasks.length : state.tasks.length,
    completedTasks: (tasks.length > 0 ? tasks : state.tasks).filter((t) => t.status === "completed").length,
  };
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
  return getScaffoldProgress(tasks); // Reuse scaffold progress since task structure is identical
}

export function addRecentSummary(state: ExecuteState, summary: string): ExecuteState {
  const recentSummaries = [...state.recentSummaries, summary];
  // Keep only the last 3 summaries
  if (recentSummaries.length > 3) {
    recentSummaries.shift();
  }
  return {
    ...state,
    recentSummaries,
  };
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

// =============================================================================
// Progress Display
// =============================================================================

export function printBuilderProgress(state: BuilderState): void {
  const progress = getFeatureProgress(state.features);

  console.log("\n" + "-".repeat(50));
  console.log("  BUILDER PROGRESS");
  console.log("-".repeat(50));
  console.log(`  Sessions completed: ${state.sessionCount}`);
  console.log(`  Features: ${progress.passing}/${progress.total} passing (${progress.percentage}%)`);

  if (progress.failing > 0) {
    const nextFeature = getNextFailingFeature(state.features);
    if (nextFeature) {
      console.log(`  Next feature: ${nextFeature.description.slice(0, 50)}...`);
    }
  } else {
    console.log("  Status: ALL FEATURES PASSING!");
  }
  console.log("-".repeat(50) + "\n");
}

export function printMigratorProgress(state: MigratorState): void {
  const progress = getMigrationProgress(state.files);

  console.log("\n" + "-".repeat(50));
  console.log("  MIGRATOR PROGRESS");
  console.log("-".repeat(50));
  console.log(`  Sessions completed: ${state.sessionCount}`);
  console.log(`  Files: ${progress.migrated}/${progress.total} migrated (${progress.percentage}%)`);
  if (progress.inProgress > 0) console.log(`  In progress: ${progress.inProgress}`);
  if (progress.blocked > 0) console.log(`  Blocked: ${progress.blocked}`);
  if (progress.error > 0) console.log(`  Errors: ${progress.error}`);

  if (progress.pending > 0) {
    const nextFile = getNextPendingFile(state.files);
    if (nextFile) {
      console.log(`  Next file: ${nextFile.path}`);
    }
  } else if (progress.migrated === progress.total) {
    console.log("  Status: ALL FILES MIGRATED!");
  }
  console.log("-".repeat(50) + "\n");
}

export function printScaffoldProgress(state: ScaffoldState): void {
  const progress = getScaffoldProgress(state.tasks);

  console.log("\n" + "-".repeat(50));
  console.log("  SCAFFOLD PROGRESS");
  console.log("-".repeat(50));
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
    console.log("  Status: ALL TASKS COMPLETED!");
  }
  console.log("-".repeat(50) + "\n");
}

export function printBugfixProgress(state: BugfixState): void {
  const progress = getBugfixProgress(state.tasks);

  console.log("\n" + "-".repeat(50));
  console.log("  BUGFIX PROGRESS");
  console.log("-".repeat(50));
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
    console.log("  Status: BUG FIX COMPLETE!");
  }
  console.log("-".repeat(50) + "\n");
}

export function printFeatureProgress(state: FeatureState): void {
  const progress = getFeatureTaskProgress(state.tasks);

  console.log("\n" + "-".repeat(50));
  console.log("  FEATURE PROGRESS");
  console.log("-".repeat(50));
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
    console.log("  Status: FEATURE COMPLETE!");
  }
  console.log("-".repeat(50) + "\n");
}

export function printRefactorProgress(state: RefactorState): void {
  const progress = getRefactorProgress(state.tasks);

  console.log("\n" + "-".repeat(50));
  console.log("  REFACTOR PROGRESS");
  console.log("-".repeat(50));
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
    console.log("  Status: REFACTOR COMPLETE!");
  }
  console.log("-".repeat(50) + "\n");
}

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
  if (state.type === "builder") {
    printBuilderProgress(state);
  } else if (state.type === "migrator") {
    printMigratorProgress(state);
  } else if (state.type === "scaffold") {
    printScaffoldProgress(state);
  } else if (state.type === "bugfix") {
    printBugfixProgress(state);
  } else if (state.type === "feature") {
    printFeatureProgress(state);
  } else if (state.type === "refactor") {
    printRefactorProgress(state);
  } else if (state.type === "execute") {
    printExecuteProgress(state);
  }
}

// =============================================================================
// Completion Detection
// =============================================================================

export function isComplete(state: ProjectState): boolean {
  if (state.type === "builder") {
    return state.features.length > 0 && state.features.every((f) => f.passes);
  } else if (state.type === "migrator") {
    return (
      state.files.length > 0 &&
      state.files.every((f) => f.status === "migrated" || f.status === "skipped")
    );
  } else if (
    state.type === "scaffold" ||
    state.type === "bugfix" ||
    state.type === "feature" ||
    state.type === "refactor" ||
    state.type === "execute"
  ) {
    return (
      state.tasks.length > 0 &&
      state.tasks.every((t) => t.status === "completed" || t.status === "skipped")
    );
  }
  return false;
}
