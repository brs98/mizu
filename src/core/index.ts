/**
 * Core Infrastructure
 *
 * Shared components for the execute agent.
 */

// Permissions
export {
  createPermissionCallback,
  type AgentType,
} from "./permissions";

// Prompt utilities
export {
  type PromptContext,
  loadPrompt,
  renderPrompt,
  loadAndRenderPrompt,
  getPromptsDir,
} from "./prompts";

// Basic session runner
export {
  type SessionConfig,
  type SessionCallbacks,
  runMultiSessionAgent,
  printAgentHeader,
  printCompletionSummary,
} from "./session";

// State management
export {
  type LongRunningAgentType,
  type ProjectState,
  type ExecuteState,
  type ExecutionPermissions,
  type ExecutionConfig,
  type AgentTask,
  type AgentTaskStatus,
  type BaseState,
  hasExistingState,
  detectStateType,
  isInitialized,
  loadState,
  loadExecuteState,
  createExecuteState,
  saveState,
  loadExecuteTasks,
  saveExecuteTasks,
  getExecuteTasksPath,
  syncExecuteTasksFromFile,
  getNextPendingTask,
  getExecuteProgress,
  appendProgress,
  readProgress,
  getProgressFilePath,
  incrementSession,
  markInitialized,
  addRecentSummary,
  isComplete,
  printExecuteProgress,
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
  type LongRunningHeaderOptions,
  type LongRunningCompletionOptions,
  runLongRunningAgent,
  printLongRunningHeader,
  printLongRunningCompletion,
} from "./longrunning";
