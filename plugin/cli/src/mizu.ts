#!/usr/bin/env bun
/**
 * Mizu CLI
 *
 * Command-line interface for the execute agent.
 * Plans are created in Claude Code plan mode, then executed with the execute agent.
 *
 * Workflow:
 *   1. Create plan in Claude Code plan mode
 *   2. Run /harness skill to generate execution config
 *   3. Run: mizu execute <config.json>
 *
 * Commands:
 *   mizu execute ./.mizu/feature.execution.json
 *   mizu status --project ./my-app
 */

import { program } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runExecute } from "./agents/execute";
import {
  hasExistingState,
  loadState,
  printProgress,
  getExecuteProgress,
  type ExecuteState,
} from "./core/state";

const DEFAULT_MODEL = "claude-sonnet-4-5";

program
  .name("mizu")
  .description("Mizu - Execute Agent for Plan Execution")
  .version("0.2.0");

// =============================================================================
// Execute Command
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
// Status Command
// =============================================================================

program
  .command("status")
  .description("Show progress of plan execution")
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
      const progress = getExecuteProgress((state as ExecuteState).tasks);

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

      // Show progress.txt if it exists
      const progressFile = resolve(projectDir, ".mizu", "progress.txt");
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
  # Workflow: Create plan in Claude Code → /harness skill → mizu execute

  # Execute a plan
  $ mizu execute ./.mizu/feature.execution.json
  $ mizu execute --resume ./.mizu/feature.execution.json
  $ mizu execute --force ./.mizu/feature.execution.json

  # Check progress
  $ mizu status -p ./my-app
  $ mizu status -p ./my-app --json

Features:
  - Task-based execution with dependency management
  - Persistent state for crash recovery
  - Session-based progress tracking
  - Git-based change tracking
  - Resume support via --resume flag
`
);

program.parse();
