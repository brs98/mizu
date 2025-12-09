/**
 * Migrator Agent
 *
 * Long-running agent for schema migrations (e.g., Zod to OpenAPI).
 */

export { runMigrator, type MigratorOptions } from "./agent";
export {
  scanFileForZodSchemas,
  scanForZodFiles,
  analyzeDirectory,
  buildDependencyGraph,
  computePriorityOrder,
  loadOpenAPISchemas,
  matchZodToOpenAPI,
} from "./scanner";
