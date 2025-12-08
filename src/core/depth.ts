/**
 * Depth Configuration
 *
 * Controls how thorough agents are in their analysis and implementation.
 * The depth system solves the problem of agents going "too deep" for simple tasks.
 */

export type DepthLevel = "quick" | "standard" | "thorough";

export type AnalysisScope = "targeted" | "moderate" | "comprehensive";
export type VerificationLevel = "basic" | "standard" | "extensive";

export interface DepthConfig {
  level: DepthLevel;
  maxIterations: number;
  analysisScope: AnalysisScope;
  verificationLevel: VerificationLevel;
  explorationBudget: number; // Max files to read during analysis
  requireFullTestPass: boolean;
  autoContinueDelayMs: number; // Delay between sessions
}

/**
 * Depth presets control agent behavior:
 *
 * - quick: Minimal analysis, trust user's diagnosis, fast execution (5 iterations)
 * - standard: Balanced exploration and implementation (20 iterations)
 * - thorough: Comprehensive analysis, extensive testing (unlimited iterations)
 */
export const DEPTH_PRESETS: Record<DepthLevel, DepthConfig> = {
  quick: {
    level: "quick",
    maxIterations: 5,
    analysisScope: "targeted",
    verificationLevel: "basic",
    explorationBudget: 10,
    requireFullTestPass: false,
    autoContinueDelayMs: 1000,
  },
  standard: {
    level: "standard",
    maxIterations: 20,
    analysisScope: "moderate",
    verificationLevel: "standard",
    explorationBudget: 30,
    requireFullTestPass: true,
    autoContinueDelayMs: 2000,
  },
  thorough: {
    level: "thorough",
    maxIterations: Infinity, // Run until complete
    analysisScope: "comprehensive",
    verificationLevel: "extensive",
    explorationBudget: 100,
    requireFullTestPass: true,
    autoContinueDelayMs: 3000,
  },
};

export function getDepthConfig(level: DepthLevel): DepthConfig {
  return DEPTH_PRESETS[level];
}

/**
 * Get prompt context for depth-aware prompts
 */
export function getDepthPromptContext(config: DepthConfig): Record<string, string | number | boolean> {
  return {
    depth_level: config.level,
    analysis_scope: config.analysisScope,
    verification_level: config.verificationLevel,
    exploration_budget: config.explorationBudget,
    require_full_test_pass: config.requireFullTestPass,
  };
}
