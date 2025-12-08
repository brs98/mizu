/**
 * Core Infrastructure
 *
 * Shared components for all specialized AI agents.
 */

export {
  type DepthLevel,
  type DepthConfig,
  type AnalysisScope,
  type VerificationLevel,
  DEPTH_PRESETS,
  getDepthConfig,
  getDepthPromptContext,
} from "./depth";

export {
  type PermissionDecision,
  type AgentType,
  createPermissionCallback,
  getPermissionMode,
} from "./permissions";

export {
  loadPrompt,
  renderPrompt,
  loadAndRenderPrompt,
  getPromptsDir,
} from "./prompts";
