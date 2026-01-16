/**
 * Verification Subagent Module
 *
 * Provides the GREEN + REFACTOR phases of TDD - verifying implementation quality.
 */

export {
  runVerification,
  detectQualityCommands,
  getVerificationDir,
  ensureVerificationDir,
  saveVerificationInfo,
  loadVerificationInfo,
  generateRetryGuidance,
  MAX_RETRY_ATTEMPTS,
  type VerifyResult,
  type VerifyFailure,
  type VerificationInfo,
  type QualityCommands,
} from "./agent";
