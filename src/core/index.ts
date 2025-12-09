/**
 * Core Infrastructure
 *
 * Shared components for all specialized AI agents.
 */

// Basic permissions (for quick agents)
export {
  type AgentType,
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

// State management (for long-running agents)
export {
  type AgentMode,
  type LongRunningAgentType,
  type ProjectState,
  type BuilderState,
  type MigratorState,
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
  createBuilderState,
  createMigratorState,
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
  appendProgress,
  readProgress,
  incrementSession,
  markInitialized,
  isComplete,
  printBuilderProgress,
  printMigratorProgress,
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
