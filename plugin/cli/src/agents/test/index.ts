/**
 * Test Subagent Module
 *
 * Provides the RED phase of TDD - writing failing tests before implementation.
 */

export {
  runTestSubagent,
  detectTestCommand,
  getTestsDir,
  ensureTestsDir,
  saveTestInfo,
  loadTestInfo,
  type TestSubagentResult,
  type TestInfo,
} from "./agent";
