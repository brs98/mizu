/**
 * Validate Subagent - Public API
 *
 * Validates tests written by the test subagent before main agent runs.
 * Includes self-fix capability for common test bugs.
 */

export {
  // Main functions
  runValidation,
  runValidationWithFix,
  attemptFix,
  // Gate functions
  runCompilationGate,
  runExecutionGate,
  analyzeFailureType,
  extractIssues,
  // Directory management
  getValidationDir,
  ensureValidationDir,
  // Persistence
  saveValidationInfo,
  loadValidationInfo,
  // Types
  type ValidationResult,
  type ValidationIssue,
  type ValidationInfo,
  type FailureType,
  type FixResult,
} from "./agent";
