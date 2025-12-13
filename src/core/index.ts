/**
 * Core Infrastructure
 *
 * Shared components for all specialized AI agents.
 */

// Basic permissions
export {
  createPermissionCallback,
} from "./permissions";

// Prompt utilities
export {
  type PromptContext,
  loadPrompt,
  renderPrompt,
  loadAndRenderPrompt,
  getPromptsDir,
} from "./prompts";

// Basic session runner (for quick agents)
export {
  type SessionConfig,
  type SessionCallbacks,
  runMultiSessionAgent,
  printAgentHeader,
  printCompletionSummary,
} from "./session";

// State management (for all agents)
export {
  type AgentType,
  type LongRunningAgentType,
  type ProjectState,
  type BuilderState,
  type MigratorState,
  type ScaffoldState,
  type ScaffoldTask,
  type ScaffoldTaskStatus,
  type BugfixState,
  type FeatureState,
  type RefactorState,
  type RefactorFocus,
  type AgentTask,
  type AgentTaskStatus,
  type FeatureTest,
  type FeatureCategory,
  type MigrationFile,
  type MigrationFileStatus,
  hasExistingState,
  detectStateType,
  isInitialized,
  loadState,
  loadBuilderState,
  loadMigratorState,
  loadScaffoldState,
  loadBugfixState,
  loadFeatureState,
  loadRefactorState,
  createBuilderState,
  createMigratorState,
  createScaffoldState,
  createBugfixState,
  createFeatureState,
  createRefactorState,
  saveState,
  loadFeatureList,
  saveFeatureList,
  syncFeaturesFromFile,
  getNextFailingFeature,
  getFeatureProgress,
  loadMigrationManifest,
  saveMigrationManifest,
  syncManifestFromFile,
  getNextPendingFile,
  getMigrationProgress,
  loadScaffoldTasks,
  saveScaffoldTasks,
  syncTasksFromFile,
  getNextPendingTask,
  getScaffoldProgress,
  loadBugfixTasks,
  saveBugfixTasks,
  syncBugfixTasksFromFile,
  getBugfixProgress,
  loadFeatureTasks,
  saveFeatureTasks,
  syncFeatureTasksFromFile,
  getFeatureTaskProgress,
  loadRefactorTasks,
  saveRefactorTasks,
  syncRefactorTasksFromFile,
  getRefactorProgress,
  appendProgress,
  readProgress,
  incrementSession,
  markInitialized,
  isComplete,
  printBuilderProgress,
  printMigratorProgress,
  printScaffoldProgress,
  printBugfixProgress,
  printFeatureProgress,
  printRefactorProgress,
  printProgress,
} from "./state";

// Security (shlex-based command validation)
export {
  validateBashCommand,
  createSecurePermissionCallback,
  bashSecurityHook,
  extractCommands,
  splitCommandSegments,
  tokenizeShellCommand,
} from "./security";

// MCP server integration
export {
  type MCPServerConfig,
  type MCPServersConfig,
  type MCPConfigOptions,
  PUPPETEER_SERVER,
  PUPPETEER_TOOLS,
  BUILTIN_TOOLS,
  getMCPServerConfig,
  getMCPServerTools,
  buildMCPServersConfig,
  getAllAllowedTools,
  getMCPToolPermissions,
  formatPuppeteerToolsForPrompt,
} from "./mcp";

// Sandbox configuration
export {
  type SandboxConfig,
  type PermissionsConfig,
  type ClaudeSettingsFile,
  type SettingsPreset,
  buildFilesystemPermissions,
  buildToolPermissions,
  generateSettings,
  writeSettingsFile,
  createSettingsFile,
  getSettingsPreset,
  printSecuritySummary,
  validateSettings,
} from "./sandbox";

// Long-running session runner
export {
  type LongRunningConfig,
  type LongRunningResult,
  runLongRunningAgent,
  printLongRunningHeader,
  printLongRunningCompletion,
} from "./longrunning";
