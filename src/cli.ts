#!/usr/bin/env bun
/**
 * AI Agents CLI
 *
 * Unified command-line interface for all specialized AI agents.
 *
 * Usage:
 *   ai-agent bugfix --project ./my-app --error "TypeError: ..." --depth quick
 *   ai-agent feature --project ./my-app --spec ./feature.md --depth standard
 *   ai-agent refactor --project ./my-app --target "src/legacy/" --depth thorough
 */

import { program } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { runBugFix } from "./agents/bugfix";
import { runFeature } from "./agents/feature";
import { runRefactor } from "./agents/refactor";
import type { DepthLevel } from "./core/depth";

const DEFAULT_MODEL = "claude-sonnet-4-5";

program
  .name("ai-agent")
  .description("AI Agents for Software Engineering Tasks")
  .version("0.1.0");

// Bug Fix command
program
  .command("bugfix")
  .description("Diagnose and fix bugs from error logs")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-e, --error <text>", "Error message or stack trace to fix")
  .option("-f, --error-file <path>", "Path to file containing error log")
  .option("-d, --depth <level>", "How thorough: quick, standard, thorough", "standard")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
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
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Feature command
program
  .command("feature")
  .description("Add new features to existing code")
  .requiredOption("-p, --project <path>", "Project directory to work in")
  .option("-s, --spec <text>", "Feature specification text")
  .option("-f, --spec-file <path>", "Path to feature specification file")
  .option("-d, --depth <level>", "How thorough: quick, standard, thorough", "standard")
  .option("-m, --model <name>", "Claude model to use", DEFAULT_MODEL)
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
      });
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Add examples to help
program.addHelpText("after", `
Examples:
  # Quick bug fix from error message
  $ ai-agent bugfix -p ./my-app -e "TypeError: Cannot read property 'x' of undefined" -d quick

  # Bug fix from error log file with standard depth
  $ ai-agent bugfix -p ./my-app -f ./error.log

  # Thorough bug investigation
  $ ai-agent bugfix -p ./my-app -f ./trace.log -d thorough

  # Add a feature from spec file
  $ ai-agent feature -p ./my-app -f ./feature-spec.md

  # Refactor for performance
  $ ai-agent refactor -p ./my-app -t "src/api/" --focus performance

  # Comprehensive refactoring
  $ ai-agent refactor -p ./my-app -d thorough

Depth Levels:
  quick     - Fast, minimal analysis. Trust user's diagnosis. Budget: $0.50
  standard  - Balanced exploration and implementation. Budget: $2.00 (default)
  thorough  - Comprehensive analysis, extensive testing. Budget: $10.00
`);

program.parse();
