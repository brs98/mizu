#!/usr/bin/env bun
/**
 * Mizu CLI
 *
 * Unified command-line interface for all specialized AI agents.
 * All agents now use the two-phase pattern with task-based state tracking.
 *
 * Commands:
 *   mizu bugfix --project ./my-app --error "TypeError: ..."
 *   mizu feature --project ./my-app --spec "Add dark mode"
 *   mizu refactor --project ./my-app --target "src/legacy/"
 *   mizu build --project ./new-app --spec-file ./app-spec.md
 *   mizu migrate --project ./migration -s src/schemas --swagger ./swagger.json
 *   mizu scaffold --project ./packages/new-client -f ./prd.md -r ./packages/existing-client
 *   mizu execute ./docs/plans/feature.execution.json
 *   mizu resume --project ./my-app
 *   mizu status --project ./my-app
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
import { runExecute } from "./agents/execute";
import {
  hasExistingState,
  detectStateType,
  loadState,
  printProgress,
  getFeatureProgress,
  getMigrationProgress,
  getScaffoldProgress,
  getBugfixProgress,
  getFeatureTaskProgress,
  getRefactorProgress,
  getExecuteProgress,
  type BuilderState,
  type MigratorState,
  type ScaffoldState,
  type BugfixState,
  type FeatureState,
  type RefactorState,
  type ExecuteState,
} from "./core/state";

const DEFAULT_MODEL = "claude-sonnet-4-5";

program
  .name("mizu")
  .description("Mizu - AI Agents for Software Engineering Tasks")
  .version("0.2.0");

// =============================================================================
// Agent Commands (All now use two-phase pattern)
// =============================================================================

// Bug Fix command
program
  .command("bugfix")
  .description("Diagnose and fix bugs from error logs (multi-session)")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-e, --error <text>", "Error message or stack trace to fix")
  .option("-f, --error-file <path>", "Path to file containing error log")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("--max-sessions <number>", "Maximum number of sessions")
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

    const projectDir = resolve(options.project);

    // Check if project already has state
    if (hasExistingState(projectDir)) {
      const existingType = detectStateType(projectDir);
      if (existingType === "bugfix") {
        console.log("\nNote: Bugfix already in progress.");
        console.log("Use 'mizu resume -p " + options.project + "' to continue.\n");
        console.log("Or delete .ai-agent-state.json to start fresh.\n");
        process.exit(1);
      } else {
        console.error(`Error: Project has existing ${existingType} state.`);
        process.exit(1);
      }
    }

    try {
      await runBugFix({
        projectDir,
        errorInput: options.error,
        errorFile: options.errorFile ? resolve(options.errorFile) : undefined,
        model: options.model,
        maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Feature command
program
  .command("feature")
  .description("Add new features to existing code (multi-session)")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-s, --spec <text>", "Feature specification text")
  .option("-f, --spec-file <path>", "Path to feature specification file")
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

    if (!existsSync(options.project)) {
      console.error(`Error: Project directory not found: ${options.project}`);
      process.exit(1);
    }

    const projectDir = resolve(options.project);

    // Check if project already has state
    if (hasExistingState(projectDir)) {
      const existingType = detectStateType(projectDir);
      if (existingType === "feature") {
        console.log("\nNote: Feature implementation already in progress.");
        console.log("Use 'mizu resume -p " + options.project + "' to continue.\n");
        console.log("Or delete .ai-agent-state.json to start fresh.\n");
        process.exit(1);
      } else {
        console.error(`Error: Project has existing ${existingType} state.`);
        process.exit(1);
      }
    }

    try {
      await runFeature({
        projectDir,
        specText: options.spec,
        specFile: options.specFile ? resolve(options.specFile) : undefined,
        model: options.model,
        maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Refactor command
program
  .command("refactor")
  .description("Improve code quality without changing behavior (multi-session)")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-t, --target <path>", "Target path/pattern to refactor (e.g., 'src/legacy/')")
  .option("--focus <area>", "Focus area: performance, readability, patterns, all", "all")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
  .option("--max-sessions <number>", "Maximum number of sessions")
  .action(async (options) => {
    if (!existsSync(options.project)) {
      console.error(`Error: Project directory not found: ${options.project}`);
      process.exit(1);
    }

    const projectDir = resolve(options.project);

    // Check if project already has state
    if (hasExistingState(projectDir)) {
      const existingType = detectStateType(projectDir);
      if (existingType === "refactor") {
        console.log("\nNote: Refactoring already in progress.");
        console.log("Use 'mizu resume -p " + options.project + "' to continue.\n");
        console.log("Or delete .ai-agent-state.json to start fresh.\n");
        process.exit(1);
      } else {
        console.error(`Error: Project has existing ${existingType} state.`);
        process.exit(1);
      }
    }

    try {
      await runRefactor({
        projectDir,
        target: options.target,
        focus: options.focus as "performance" | "readability" | "patterns" | "all",
        model: options.model,
        maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Build command
program
  .command("build")
  .description("Build a complete application from specification (multi-session)")
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

    const projectDir = resolve(options.project);

    // Check if project already has state
    if (hasExistingState(projectDir)) {
      const existingType = detectStateType(projectDir);
      if (existingType === "builder") {
        console.log("\nNote: Build already in progress.");
        console.log("Use 'mizu resume -p " + options.project + "' to continue.\n");
        console.log("Or delete .ai-agent-state.json to start fresh.\n");
        process.exit(1);
      } else {
        console.error(`Error: Project has existing ${existingType} state.`);
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

// Migrate command
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
        console.log("\nNote: Migration already in progress.");
        console.log("Use 'mizu resume -p " + options.project + "' to continue.\n");
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

// Scaffold command
program
  .command("scaffold")
  .description("Scaffold new packages/projects from specifications (multi-session)")
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
        console.log("\nNote: Scaffold already in progress.");
        console.log("Use 'mizu resume -p " + options.project + "' to continue.\n");
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

// =============================================================================
// Execute Command (run plans from /harness skill)
// =============================================================================

program
  .command("execute")
  .description("Execute a plan from an execution config file")
  .argument("<config>", "Path to execution config JSON file")
  .option("--resume", "Resume interrupted execution")
  .option("--force", "Force restart, overwriting existing state")
  .option("-m, --model <name>", "Claude model to use (overrides config)")
  .option("--max-sessions <number>", "Maximum number of sessions")
  .action(async (configPath, options) => {
    if (!existsSync(configPath)) {
      console.error(`Error: Config file not found: ${configPath}`);
      process.exit(1);
    }

    try {
      await runExecute({
        configFile: resolve(configPath),
        model: options.model,
        maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        resume: options.resume,
        force: options.force,
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// =============================================================================
// Resume Command (handles all agent types)
// =============================================================================

program
  .command("resume")
  .description("Resume any agent from saved state")
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
      console.error("Use one of the agent commands to start a new task.");
      process.exit(1);
    }

    const stateType = detectStateType(projectDir);

    try {
      if (stateType === "bugfix") {
        const state = loadState(projectDir) as BugfixState;
        await runBugFix({
          projectDir,
          errorInput: state.errorInput,
          errorFile: state.errorFile,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        });
      } else if (stateType === "feature") {
        const state = loadState(projectDir) as FeatureState;
        await runFeature({
          projectDir,
          specText: state.specText,
          specFile: state.specFile,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        });
      } else if (stateType === "refactor") {
        const state = loadState(projectDir) as RefactorState;
        await runRefactor({
          projectDir,
          target: state.target,
          focus: state.focus,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        });
      } else if (stateType === "builder") {
        await runBuilder({
          projectDir,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
        });
      } else if (stateType === "migrator") {
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
      } else if (stateType === "execute") {
        const state = loadState(projectDir) as ExecuteState;
        await runExecute({
          configFile: state.configFile,
          model: options.model,
          maxSessions: options.maxSessions ? parseInt(options.maxSessions, 10) : undefined,
          resume: true,
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

// =============================================================================
// Status Command (handles all agent types)
// =============================================================================

program
  .command("status")
  .description("Show progress of any agent task")
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
      let progress;
      if (state.type === "builder") {
        progress = getFeatureProgress((state as BuilderState).features);
      } else if (state.type === "migrator") {
        progress = getMigrationProgress((state as MigratorState).files);
      } else if (state.type === "scaffold") {
        progress = getScaffoldProgress((state as ScaffoldState).tasks);
      } else if (state.type === "bugfix") {
        progress = getBugfixProgress((state as BugfixState).tasks);
      } else if (state.type === "feature") {
        progress = getFeatureTaskProgress((state as FeatureState).tasks);
      } else if (state.type === "refactor") {
        progress = getRefactorProgress((state as RefactorState).tasks);
      } else if (state.type === "execute") {
        progress = getExecuteProgress((state as ExecuteState).tasks);
      }

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
  # All agents use multi-session task-based state tracking
  # Session 1 creates a task list, subsequent sessions execute tasks one by one
  # All agents support resume and status commands

  # Bug fix
  $ mizu bugfix -p ./my-app -e "TypeError: Cannot read property 'x' of undefined"
  $ mizu bugfix -p ./my-app -f ./error.log

  # Feature implementation
  $ mizu feature -p ./my-app -s "Add a dark mode toggle to settings"
  $ mizu feature -p ./my-app -f ./feature-spec.md

  # Refactoring
  $ mizu refactor -p ./my-app -t "src/api/" --focus performance
  $ mizu refactor -p ./my-app --focus readability

  # Build complete application
  $ mizu build -p ./new-app -f ./app-spec.md

  # Schema migration
  $ mizu migrate -p ./migration-state -s src/schemas --swagger ./swagger.json

  # Scaffold new package with reference
  $ mizu scaffold -p ./packages/new-api-client -f ./prd.md -r ./packages/existing-client

  # Execute a plan from /harness skill
  $ mizu execute ./docs/plans/feature.execution.json
  $ mizu execute --resume ./docs/plans/feature.execution.json
  $ mizu execute --force ./docs/plans/feature.execution.json

  # Resume any agent
  $ mizu resume -p ./my-app

  # Check progress of any agent
  $ mizu status -p ./my-app
  $ mizu status -p ./my-app --json

All agents support:
  - Persistent state for crash recovery
  - Task-based progress tracking
  - Git-based change tracking
  - Resume from any point with 'resume' command
`
);

program.parse();
