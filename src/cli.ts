#!/usr/bin/env bun
/**
 * AI Agents CLI
 *
 * Unified command-line interface for all specialized AI agents.
 *
 * Quick Tasks:
 *   ai-agent bugfix --project ./my-app --error "TypeError: ..." --depth quick
 *   ai-agent feature --project ./my-app --spec "Add dark mode" --depth standard
 *   ai-agent refactor --project ./my-app --target "src/legacy/" --depth thorough
 *
 * Long-Running Tasks:
 *   ai-agent build --project ./new-app --spec-file ./app-spec.md
 *   ai-agent resume --project ./my-app
 *   ai-agent status --project ./my-app
 */

import { program } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runBugFix } from "./agents/bugfix";
import { runFeature } from "./agents/feature";
import { runRefactor } from "./agents/refactor";
import { runBuilder } from "./agents/builder";
import { runMigrator } from "./agents/migrator";
import { runScaffold } from "./agents/scaffold";
import type { DepthLevel } from "./core/depth";
import {
  hasExistingState,
  detectStateType,
  loadState,
  printProgress,
  getFeatureProgress,
  getMigrationProgress,
  getScaffoldProgress,
  type BuilderState,
  type MigratorState,
  type ScaffoldState,
} from "./core/state";

const DEFAULT_MODEL = "claude-sonnet-4-5";

program
  .name("ai-agent")
  .description("AI Agents for Software Engineering Tasks")
  .version("0.2.0");

// =============================================================================
// Quick Task Commands
// =============================================================================

// Bug Fix command
program
  .command("bugfix")
  .description("Diagnose and fix bugs from error logs")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-e, --error <text>", "Error message or stack trace to fix")
  .option("-f, --error-file <path>", "Path to file containing error log")
  .option("-d, --depth <level>", "How thorough: quick, standard, thorough", "standard")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("-i, --max-iterations <number>", "Max iterations (overrides depth preset)")
  .action(async (options) => {
    // Validate inputs
    if (!options.error && !options.errorFile) {
      console.error("Error: Must provide either --error or --error-file");
      process.exit(1);
    }

    if (options.errorFile && !existsSync(options.errorFile)) {
      console.error(`Error: Error file not found: ${options.errorFile}`);
      process.exit(1);
    }

    if (!existsSync(options.project)) {
      console.error(`Error: Project directory not found: ${options.project}`);
      process.exit(1);
    }

    try {
      await runBugFix({
        projectDir: resolve(options.project),
        errorInput: options.error,
        errorFile: options.errorFile ? resolve(options.errorFile) : undefined,
        depth: options.depth as DepthLevel,
        model: options.model,
        maxIterations: options.maxIterations ? parseInt(options.maxIterations, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Feature command (quick)
program
  .command("feature")
  .description("Add new features to existing code (quick task)")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-s, --spec <text>", "Feature specification text")
  .option("-f, --spec-file <path>", "Path to feature specification file")
  .option("-d, --depth <level>", "How thorough: quick, standard, thorough", "standard")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("-i, --max-iterations <number>", "Max iterations (overrides depth preset)")
  .action(async (options) => {
    if (!options.spec && !options.specFile) {
      console.error("Error: Must provide either --spec or --spec-file");
      process.exit(1);
    }

    if (options.specFile && !existsSync(options.specFile)) {
      console.error(`Error: Spec file not found: ${options.specFile}`);
      process.exit(1);
    }

    if (!existsSync(options.project)) {
      console.error(`Error: Project directory not found: ${options.project}`);
      process.exit(1);
    }

    try {
      await runFeature({
        projectDir: resolve(options.project),
        specText: options.spec,
        specFile: options.specFile ? resolve(options.specFile) : undefined,
        depth: options.depth as DepthLevel,
        model: options.model,
        maxIterations: options.maxIterations ? parseInt(options.maxIterations, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Refactor command
program
  .command("refactor")
  .description("Improve code quality without changing behavior")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-t, --target <path>", "Target path/pattern to refactor (e.g., 'src/legacy/')")
  .option("--focus <area>", "Focus area: performance, readability, patterns, all", "all")
  .option("-d, --depth <level>", "How thorough: quick, standard, thorough", "standard")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("-i, --max-iterations <number>", "Max iterations (overrides depth preset)")
  .action(async (options) => {
    if (!existsSync(options.project)) {
      console.error(`Error: Project directory not found: ${options.project}`);
      process.exit(1);
    }

    try {
      await runRefactor({
        projectDir: resolve(options.project),
        target: options.target,
        focus: options.focus as "performance" | "readability" | "patterns" | "all",
        depth: options.depth as DepthLevel,
        model: options.model,
        maxIterations: options.maxIterations ? parseInt(options.maxIterations, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// =============================================================================
// Long-Running Task Commands
// =============================================================================

// Build command (long-running)
program
  .command("build")
  .description("Build a complete application from specification (long-running)")
  .requiredOption("-p, --project <path>", "Project directory to create/work in")
  .option("-s, --spec <text>", "Application specification text")
  .option("-f, --spec-file <path>", "Path to specification file")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("--max-sessions <number>", "Maximum number of sessions")
  .option("--min-features <number>", "Minimum features to generate", "100")
  .option("--max-features <number>", "Maximum features to generate", "200")
  .action(async (options) => {
    if (!options.spec && !options.specFile) {
      console.error("Error: Must provide either --spec or --spec-file");
      process.exit(1);
    }

    if (options.specFile && !existsSync(options.specFile)) {
      console.error(`Error: Spec file not found: ${options.specFile}`);
      process.exit(1);
    }

    // Check if project already has state (might want to use 'resume' instead)
    const projectDir = resolve(options.project);
    if (hasExistingState(projectDir)) {
      console.log("\nNote: Project already has existing state.");
      console.log("Use 'ai-agent resume -p " + options.project + "' to continue.\n");
      console.log("Or delete .ai-agent-state.json to start fresh.\n");

      const continueAnyway = process.env.FORCE_NEW_BUILD === "1";
      if (!continueAnyway) {
        process.exit(1);
      }
    }

    try {
      await runBuilder({
        projectDir,
        specText: options.spec,
        specFile: options.specFile ? resolve(options.specFile) : undefined,
        model: options.model,
        maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        minFeatures: parseInt(options.minFeatures, 10),
        maxFeatures: parseInt(options.maxFeatures, 10),
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Resume command
program
  .command("resume")
  .description("Resume a long-running task from saved state")
  .requiredOption("-p, --project <path>", "Project directory with existing state")
  .option("-m, --model <name>", "Claude model to use (overrides saved)")
  .option("--max-sessions <number>", "Maximum additional sessions to run")
  .action(async (options) => {
    const projectDir = resolve(options.project);

    if (!existsSync(projectDir)) {
      console.error(`Error: Project directory not found: ${projectDir}`);
      process.exit(1);
    }

    if (!hasExistingState(projectDir)) {
      console.error(`Error: No saved state found in ${projectDir}`);
      console.error("Use 'ai-agent build' to start a new project.");
      process.exit(1);
    }

    const stateType = detectStateType(projectDir);

    try {
      if (stateType === "builder") {
        await runBuilder({
          projectDir,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        });
      } else if (stateType === "migrator") {
        // Load state to get sourceDir
        const state = loadState(projectDir) as MigratorState;
        await runMigrator({
          projectDir,
          sourceDir: state.sourceDir,
          targetDir: state.targetDir,
          migrationType: state.migrationType,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        });
      } else if (stateType === "scaffold") {
        // Load state to get reference dir and read paths
        const state = loadState(projectDir) as ScaffoldState;
        await runScaffold({
          projectDir,
          specFile: state.specFile,
          specText: state.specText,
          referenceDir: state.referenceDir,
          additionalReadPaths: state.additionalReadPaths,
          verificationCommands: state.verificationCommands,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        });
      } else {
        console.error(`Error: Unknown state type: ${stateType}`);
        process.exit(1);
      }
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Migrate command (long-running)
program
  .command("migrate")
  .description("Migrate schemas across a codebase (e.g., Zod to OpenAPI)")
  .requiredOption("-p, --project <path>", "Project/state directory")
  .requiredOption("-s, --source <path>", "Source directory to scan (relative to project)")
  .option("-t, --target <path>", "Target directory for reference (e.g., backend)")
  .option("--type <type>", "Migration type", "zod-to-openapi")
  .option("--swagger <path>", "Path to OpenAPI/Swagger spec file")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("--max-sessions <number>", "Maximum number of sessions")
  .action(async (options) => {
    const projectDir = resolve(options.project);

    // Check if project already has state
    if (hasExistingState(projectDir)) {
      const existingType = detectStateType(projectDir);
      if (existingType === "migrator") {
        console.log("\nNote: Project already has migration state.");
        console.log("Use 'ai-agent resume -p " + options.project + "' to continue.\n");
        process.exit(1);
      } else {
        console.error(`Error: Project has existing ${existingType} state.`);
        process.exit(1);
      }
    }

    try {
      await runMigrator({
        projectDir,
        sourceDir: options.source,
        targetDir: options.target,
        migrationType: options.type,
        swaggerPath: options.swagger ? resolve(options.swagger) : undefined,
        model: options.model,
        maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Scaffold command (long-running)
program
  .command("scaffold")
  .description("Scaffold new packages/projects from specifications (long-running)")
  .requiredOption("-p, --project <path>", "Project directory to create/work in")
  .option("-s, --spec <text>", "Specification text describing what to build")
  .option("-f, --spec-file <path>", "Path to specification file (e.g., PRD)")
  .option("-r, --reference <path>", "Reference directory to copy patterns from")
  .option("--read-paths <paths>", "Additional directories the agent can read (comma-separated)")
  .option("--verify <commands>", "Verification commands to run at completion (comma-separated)", "pnpm typecheck,pnpm build")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("--max-sessions <number>", "Maximum number of sessions")
  .action(async (options) => {
    if (!options.spec && !options.specFile) {
      console.error("Error: Must provide either --spec or --spec-file");
      process.exit(1);
    }

    if (options.specFile && !existsSync(options.specFile)) {
      console.error(`Error: Spec file not found: ${options.specFile}`);
      process.exit(1);
    }

    const projectDir = resolve(options.project);

    // Check if project already has state
    if (hasExistingState(projectDir)) {
      const existingType = detectStateType(projectDir);
      if (existingType === "scaffold") {
        console.log("\nNote: Project already has scaffold state.");
        console.log("Use 'ai-agent resume -p " + options.project + "' to continue.\n");
        process.exit(1);
      } else {
        console.error(`Error: Project has existing ${existingType} state.`);
        process.exit(1);
      }
    }

    // Parse additional read paths
    const additionalReadPaths = options.readPaths
      ? options.readPaths.split(",").map((p: string) => resolve(p.trim()))
      : [];

    // Parse verification commands
    const verificationCommands = options.verify
      ? options.verify.split(",").map((c: string) => c.trim())
      : ["pnpm typecheck", "pnpm build"];

    try {
      await runScaffold({
        projectDir,
        specText: options.spec,
        specFile: options.specFile ? resolve(options.specFile) : undefined,
        referenceDir: options.reference ? resolve(options.reference) : undefined,
        additionalReadPaths,
        verificationCommands,
        model: options.model,
        maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Status command
program
  .command("status")
  .description("Show progress of a long-running task")
  .requiredOption("-p, --project <path>", "Project directory to check")
  .option("--json", "Output as JSON")
  .action((options) => {
    const projectDir = resolve(options.project);

    if (!existsSync(projectDir)) {
      console.error(`Error: Project directory not found: ${projectDir}`);
      process.exit(1);
    }

    if (!hasExistingState(projectDir)) {
      console.error(`No saved state found in ${projectDir}`);
      process.exit(1);
    }

    const state = loadState(projectDir);
    if (!state) {
      console.error("Failed to load state");
      process.exit(1);
    }

    if (options.json) {
      // JSON output
      if (state.type === "builder") {
        const progress = getFeatureProgress((state as BuilderState).features);
        console.log(
          JSON.stringify(
            {
              type: state.type,
              initialized: state.initialized,
              sessionCount: state.sessionCount,
              createdAt: state.createdAt,
              updatedAt: state.updatedAt,
              progress,
            },
            null,
            2
          )
        );
      } else if (state.type === "migrator") {
        const progress = getMigrationProgress((state as MigratorState).files);
        console.log(
          JSON.stringify(
            {
              type: state.type,
              initialized: state.initialized,
              sessionCount: state.sessionCount,
              createdAt: state.createdAt,
              updatedAt: state.updatedAt,
              progress,
            },
            null,
            2
          )
        );
      } else if (state.type === "scaffold") {
        const progress = getScaffoldProgress((state as ScaffoldState).tasks);
        console.log(
          JSON.stringify(
            {
              type: state.type,
              initialized: state.initialized,
              sessionCount: state.sessionCount,
              createdAt: state.createdAt,
              updatedAt: state.updatedAt,
              progress,
            },
            null,
            2
          )
        );
      }
    } else {
      // Human-readable output
      console.log("\n" + "=".repeat(50));
      console.log(`  PROJECT STATUS: ${projectDir}`);
      console.log("=".repeat(50));
      console.log(`\nType: ${state.type}`);
      console.log(`Status: ${state.initialized ? "In Progress" : "Not Started"}`);
      console.log(`Sessions: ${state.sessionCount}`);
      console.log(`Created: ${state.createdAt}`);
      console.log(`Updated: ${state.updatedAt}`);

      printProgress(state);

      // Show claude-progress.txt if it exists
      const progressFile = resolve(projectDir, "claude-progress.txt");
      if (existsSync(progressFile)) {
        const progressContent = readFileSync(progressFile, "utf-8");
        const lastLines = progressContent.split("\n").slice(-20).join("\n");
        console.log("\nRecent Progress:");
        console.log("-".repeat(50));
        console.log(lastLines);
      }
    }
  });

// =============================================================================
// Help Text
// =============================================================================

program.addHelpText(
  "after",
  `
Examples:
  # Quick Tasks (minutes)
  # ----------------------

  # Quick bug fix from error message
  $ ai-agent bugfix -p ./my-app -e "TypeError: Cannot read property 'x' of undefined" -d quick

  # Bug fix from error log file with standard depth
  $ ai-agent bugfix -p ./my-app -f ./error.log

  # Add a small feature
  $ ai-agent feature -p ./my-app -s "Add a dark mode toggle to settings"

  # Refactor for performance
  $ ai-agent refactor -p ./my-app -t "src/api/" --focus performance


  # Long-Running Tasks (hours)
  # --------------------------

  # Build a complete application from spec
  $ ai-agent build -p ./new-app -f ./app-spec.md

  # Migrate schemas from Zod to OpenAPI types
  $ ai-agent migrate -p ./migration-state -s src/schemas --swagger ./swagger.json

  # Scaffold a new package from a PRD with reference implementation
  $ ai-agent scaffold -p ./packages/new-api-client -f ./prd.md -r ./packages/existing-client

  # Scaffold with additional read paths (for cross-repo access)
  $ ai-agent scaffold -p ./my-package -f ./spec.md --read-paths "/path/to/backend,/path/to/shared"

  # Resume a long-running task
  $ ai-agent resume -p ./my-app

  # Check progress
  $ ai-agent status -p ./my-app


Depth Levels (for quick tasks):
  quick     - Fast, minimal analysis. Trust user's diagnosis. Max iterations: 5
  standard  - Balanced exploration and implementation. Max iterations: 20 (default)
  thorough  - Comprehensive analysis, extensive testing. Max iterations: unlimited

Long-Running Tasks:
  'build'    - Build complete applications with browser testing and feature tracking
  'migrate'  - Migrate schemas across codebases with dependency-aware ordering
  'scaffold' - Scaffold new packages/projects from specifications with reference support

  All support:
  - Persistent state for crash recovery
  - Git-based progress tracking
  - Resume from any point with 'resume' command
`
);

program.parse();
