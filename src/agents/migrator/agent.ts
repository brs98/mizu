/**
 * Migrator Agent
 *
 * A long-running agent for schema migrations (e.g., Zod to OpenAPI).
 * Uses the two-agent pattern:
 * - Initializer: Scans codebase, builds manifest, creates migration plan
 * - Migrator: Migrates one file per session, updates manifest
 *
 * Key features:
 * - Persistent state via migration_manifest.json
 * - Dependency-aware migration order
 * - Git-based progress tracking
 * - Crash recovery via file-based state
 */

import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  type MigratorState,
  createMigratorState,
  loadMigratorState,
  saveState,
  syncManifestFromFile,
  getMigrationProgress,
  isComplete,
  printMigratorProgress,
  appendProgress,
  markInitialized,
  incrementSession,
  saveMigrationManifest,
} from "../../core/state";
import { loadAndRenderPrompt, type PromptContext } from "../../core/prompts";
import {
  runLongRunningAgent,
  printLongRunningHeader,
  printLongRunningCompletion,
} from "../../core/longrunning";
import { analyzeDirectory, type AnalysisResult } from "./scanner";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

// =============================================================================
// Types
// =============================================================================

export interface MigratorOptions {
  projectDir: string;
  sourceDir: string;
  targetDir?: string;
  migrationType?: string;
  swaggerPath?: string;
  model?: string;
  maxSessions?: number;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are an expert TypeScript developer performing a schema migration.

You work methodically, one file at a time, ensuring each file compiles before moving on.

You understand that:
- Quality matters more than speed
- Each session is independent - you have no memory of previous sessions
- migration_manifest.json is the source of truth
- Dependencies must be migrated before dependent files
- Git history shows what was done before

You always:
- Read migration_manifest.json to understand the current state
- Check git log to see recent progress
- Verify the codebase compiles before making changes
- Run typecheck after each file migration
- Commit progress with descriptive messages
- Update migration_manifest.json and migration_progress.txt before ending

You never:
- Migrate multiple files at once
- Mark files as migrated without verifying they compile
- Skip dependency checks
- Leave the codebase in a non-compiling state`;

// =============================================================================
// Prompt Generation
// =============================================================================

function getInitializerPrompt(state: MigratorState, options: MigratorOptions): string {
  const context: PromptContext = {
    project_dir: state.projectDir,
    source_dir: state.sourceDir,
    target_dir: state.targetDir ?? "",
    migration_type: state.migrationType,
    swagger_path: options.swaggerPath ?? "",
    model: state.model,
    session_number: state.sessionCount + 1,
  };

  const promptFile = resolve(PROMPTS_DIR, "initializer.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return getFallbackInitializerPrompt(context);
}

function getMigrationPrompt(state: MigratorState): string {
  const progress = getMigrationProgress(state.files);

  const context: PromptContext = {
    project_dir: state.projectDir,
    source_dir: state.sourceDir,
    target_dir: state.targetDir ?? "",
    migration_type: state.migrationType,
    model: state.model,
    session_number: state.sessionCount + 1,
    total_files: progress.total,
    migrated_files: progress.migrated,
    remaining_files: progress.pending + progress.blocked,
    percentage: progress.percentage,
  };

  const promptFile = resolve(PROMPTS_DIR, "migration.md");
  if (existsSync(promptFile)) {
    return loadAndRenderPrompt(promptFile, context);
  }

  // Fallback prompt
  return getFallbackMigrationPrompt(context);
}

// =============================================================================
// Fallback Prompts
// =============================================================================

function getFallbackInitializerPrompt(context: PromptContext): string {
  return `# Migration Initializer - Session 1

You are setting up a schema migration in ${context.project_dir}.

## Your Tasks

1. **Verify Prerequisites**
   - Check that source files exist in: ${context.source_dir}
   ${context.swagger_path ? `- Check OpenAPI spec at: ${context.swagger_path}` : ""}

2. **Review the Migration Manifest**
   - Read \`migration_manifest.json\` to see scanned files
   - Understand the dependency graph
   - Note which files are blocked

3. **Create Migration Plan**
   - Create \`migration_plan.md\` documenting the strategy
   - List files in priority order
   - Note any blockers or special cases

4. **Initialize Git Tracking**
   \`\`\`bash
   git add migration_manifest.json migration_plan.md
   git commit -m "Initialize ${context.migration_type} migration"
   \`\`\`

5. **Update Progress**
   - Create \`migration_progress.txt\` with session summary

When done, the next agent will begin actual migrations.`;
}

function getFallbackMigrationPrompt(context: PromptContext): string {
  return `# Migration Agent - Session ${context.session_number}

Continue the ${context.migration_type} migration in ${context.project_dir}.

## Progress
- Files: ${context.migrated_files}/${context.total_files} migrated (${context.percentage}%)
- Remaining: ${context.remaining_files}

## Your Tasks

1. **Get Your Bearings**
   \`\`\`bash
   pwd
   git log --oneline -10
   cat migration_progress.txt
   cat migration_manifest.json | head -100
   \`\`\`

2. **Run Typecheck First**
   \`\`\`bash
   pnpm typecheck
   \`\`\`

3. **Pick Next File**
   - Find the next \`pending\` file in the manifest
   - Ensure its dependencies are \`migrated\`

4. **Migrate the File**
   - Read the file carefully
   - Apply migration patterns
   - Update imports and types

5. **Verify**
   \`\`\`bash
   pnpm typecheck
   \`\`\`

6. **Update Manifest**
   - Set status to \`migrated\`
   - Add \`migratedAt\` timestamp

7. **Commit**
   \`\`\`bash
   git add -A
   git commit -m "Migrate [file] to ${context.migration_type}"
   \`\`\`

8. **Update Progress**
   - Append to \`migration_progress.txt\`

Work on ONE file only. Leave codebase compiling.`;
}

// =============================================================================
// State Management
// =============================================================================

function loadOrCreateState(options: MigratorOptions): MigratorState {
  const projectDir = resolve(options.projectDir);

  // Try to load existing state
  const existing = loadMigratorState(projectDir);
  if (existing) {
    return syncManifestFromFile(existing);
  }

  // Create new state
  const state = createMigratorState({
    projectDir,
    model: options.model ?? "claude-sonnet-4-5",
    sourceDir: options.sourceDir,
    targetDir: options.targetDir,
    migrationType: options.migrationType ?? "zod-to-openapi",
  });

  return state;
}

/**
 * Run initial scan and create manifest
 */
function initializeManifest(
  state: MigratorState,
  options: MigratorOptions
): MigratorState {
  console.log("\nScanning source directory for schemas...");

  const analysis = analyzeDirectory(
    resolve(state.projectDir, state.sourceDir),
    options.swaggerPath
  );

  console.log(`Found ${analysis.stats.total} files with Zod schemas`);
  console.log(`  With schema definitions: ${analysis.stats.withSchemas}`);
  console.log(`  Without schema definitions: ${analysis.stats.withoutSchemas}`);
  console.log(`  By type:`, analysis.stats.byFileType);

  // Update state with files
  state.files = analysis.files;
  state.totalFiles = analysis.files.length;
  state.completedFiles = 0;

  // Save manifest
  saveMigrationManifest(state.projectDir, state.files);

  // Also save priority order
  const manifestPath = resolve(state.projectDir, "migration_manifest.json");
  const manifestData = {
    version: "1.0.0",
    migrationType: state.migrationType,
    sourceDir: state.sourceDir,
    targetDir: state.targetDir,
    swaggerPath: options.swaggerPath,
    priorityOrder: analysis.priorityOrder,
    files: state.files,
  };
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  return state;
}

// =============================================================================
// Completion Detection
// =============================================================================

function checkMigrationCompletion(response: string, state: MigratorState): boolean {
  // Re-sync from files
  const updated = syncManifestFromFile(state);

  // Check if all files are migrated or skipped
  if (isComplete(updated)) {
    return true;
  }

  // Check for explicit completion phrases
  const lower = response.toLowerCase();
  const completionPhrases = [
    "all files migrated",
    "migration complete",
    "all migrations complete",
    "100% complete",
  ];

  return completionPhrases.some((phrase) => lower.includes(phrase));
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runMigrator(options: MigratorOptions): Promise<void> {
  const {
    projectDir,
    sourceDir,
    model = "claude-sonnet-4-5",
    maxSessions,
  } = options;

  const resolvedProjectDir = resolve(projectDir);

  // Ensure project directory exists
  if (!existsSync(resolvedProjectDir)) {
    mkdirSync(resolvedProjectDir, { recursive: true });
  }

  // Load or create state
  let state = loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model });

  // If this is a fresh start, scan and create manifest
  if (!state.initialized && state.files.length === 0) {
    state = initializeManifest(state, options);
    saveState(state);
  }

  // Print header
  printLongRunningHeader({
    agentName: "Migrator Agent",
    projectDir: resolvedProjectDir,
    model,
    stateType: "migrator",
    initialized: state.initialized,
    sessionCount: state.sessionCount,
    maxSessions,
  });

  console.log(`Migration type: ${state.migrationType}`);
  console.log(`Source directory: ${state.sourceDir}`);
  if (state.targetDir) {
    console.log(`Target directory: ${state.targetDir}`);
  }

  if (state.initialized) {
    printMigratorProgress(state);
  }

  // Run the long-running agent loop
  const result = await runLongRunningAgent({
    projectDir: resolvedProjectDir,
    model,
    agentType: "migrator",
    systemPrompt: SYSTEM_PROMPT,
    maxSessions: maxSessions ?? Infinity,
    enablePuppeteer: false, // Migrator doesn't need browser testing
    sandboxEnabled: true,
    additionalReadPaths: state.targetDir ? [state.targetDir] : [],

    getPrompt: (sessionNumber, currentState) => {
      const migratorState = currentState as MigratorState;
      if (!migratorState.initialized) {
        return getInitializerPrompt(migratorState, options);
      }
      return getMigrationPrompt(migratorState);
    },

    loadState: () => loadOrCreateState({ ...options, projectDir: resolvedProjectDir, model }),

    saveState: (updatedState) => {
      state = updatedState as MigratorState;
      saveState(state);
    },

    onSessionStart: (sessionNumber) => {
      console.log(`\n--- Migrator Session ${sessionNumber} ---\n`);
    },

    onSessionEnd: (sessionNumber, response) => {
      // Sync state from files
      state = syncManifestFromFile(state);
      state = incrementSession(state) as MigratorState;

      if (!state.initialized) {
        state = markInitialized(state) as MigratorState;
      }

      saveState(state);

      // Append to progress
      const progress = getMigrationProgress(state.files);
      appendProgress(
        resolvedProjectDir,
        `Session ${sessionNumber} completed. Files: ${progress.migrated}/${progress.total} migrated.`
      );
    },

    isComplete: (response) => checkMigrationCompletion(response, state),
  });

  // Print completion summary
  printLongRunningCompletion({
    agentName: "Migrator Agent",
    completed: result.completed,
    sessions: result.sessions,
    state,
  });
}

// =============================================================================
// Exports
// =============================================================================

export { getInitializerPrompt, getMigrationPrompt };
