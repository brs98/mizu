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
  maxBudgetUsd: number;
  analysisScope: AnalysisScope;
  verificationLevel: VerificationLevel;
  explorationBudget: number; // Max files to read during analysis
  requireFullTestPass: boolean;
}

/**
 * Depth presets control agent behavior:
 *
 * - quick: Minimal analysis, trust user's diagnosis, fast execution
 * - standard: Balanced exploration and implementation
 * - thorough: Comprehensive analysis, extensive testing
 */
export const DEPTH_PRESETS: Record<DepthLevel, DepthConfig> = {
  quick: {
    level: "quick",
    maxBudgetUsd: 0.5,
    analysisScope: "targeted",
    verificationLevel: "basic",
    explorationBudget: 10,
    requireFullTestPass: false,
  },
  standard: {
    level: "standard",
    maxBudgetUsd: 2.0,
    analysisScope: "moderate",
    verificationLevel: "standard",
    explorationBudget: 30,
    requireFullTestPass: true,
  },
  thorough: {
    level: "thorough",
    maxBudgetUsd: 10.0,
    analysisScope: "comprehensive",
    verificationLevel: "extensive",
    explorationBudget: 100,
    requireFullTestPass: true,
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
