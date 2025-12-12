/**
 * Long-Running Agent Session Runner
 *
 * Provides the core loop for running agents across many sessions.
 * Unlike the basic session runner, this:
 * - Uses file-based state persistence
 * - Supports crash recovery
 * - Integrates MCP servers (Puppeteer)
 * - Uses OS-level sandbox
 * - Handles the two-agent pattern (initializer + coder)
 */

import { query, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";

import type {
  ProjectState,
  BuilderState,
  MigratorState,
  ScaffoldState,
} from "./state";
import type { AgentType } from "./permissions";
import { createSecurePermissionCallback } from "./security";
import {
  createSettingsFile,
  printSecuritySummary,
  generateSettings,
} from "./sandbox";
import { buildMCPServersConfig, BUILTIN_TOOLS, PUPPETEER_TOOLS } from "./mcp";

// =============================================================================
// Types
// =============================================================================

export interface LongRunningConfig {
  projectDir: string;
  model: string;
  agentType: AgentType;
  systemPrompt: string;
  maxSessions?: number;
  enablePuppeteer?: boolean;
  sandboxEnabled?: boolean;
  additionalReadPaths?: string[];

  // Callbacks
  getPrompt: (sessionNumber: number, state: ProjectState) => string;
  loadState: () => ProjectState;
  saveState: (state: ProjectState) => void;
  onSessionStart?: (sessionNumber: number) => void;
  onSessionEnd?: (sessionNumber: number, response: string) => void;
  isComplete?: (response: string) => boolean;
}

export interface LongRunningResult {
  sessions: number;
  completed: boolean;
  state: ProjectState;
}

// =============================================================================
// Configuration
// =============================================================================

const AUTO_CONTINUE_DELAY_MS = 3000;
const MAX_TURNS_PER_SESSION = 1000;
const ERROR_RETRY_DELAY_MS = 5000;

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Client Creation
// =============================================================================

interface ClientConfig {
  projectDir: string;
  model: string;
  systemPrompt: string;
  enablePuppeteer: boolean;
  agentType: AgentType;
}

function createQueryOptions(config: ClientConfig) {
  const { projectDir, model, systemPrompt, enablePuppeteer, agentType } =
    config;

  // Build allowed tools list
  const allowedTools: string[] = [...BUILTIN_TOOLS];
  if (enablePuppeteer) {
    allowedTools.push(...PUPPETEER_TOOLS);
  }

  // Build MCP servers config
  const mcpServers = buildMCPServersConfig({
    enablePuppeteer,
  });

  return {
    model,
    cwd: projectDir,
    systemPrompt,
    permissionMode: "acceptEdits" as const,
    canUseTool: createSecurePermissionCallback(agentType),
    allowedTools,
    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
    maxTurns: MAX_TURNS_PER_SESSION,
    settingSources: ["project", "local"] as SettingSource[],
  };
}

// =============================================================================
// Session Execution
// =============================================================================

interface SessionResult {
  status: "continue" | "complete" | "error";
  response: string;
  sessionId?: string;
}

async function runSession(
  prompt: string,
  options: ReturnType<typeof createQueryOptions>,
  previousSessionId?: string,
): Promise<SessionResult> {
  let responseText = "";
  let sessionId: string | undefined;

  try {
    const response = query({
      prompt,
      options: {
        ...options,
        ...(previousSessionId ? { resume: previousSessionId } : {}),
      },
    });

    for await (const message of response) {
      switch (message.type) {
        case "system":
          if (message.subtype === "init") {
            sessionId = message.session_id;
            console.log(`Session ID: ${sessionId}\n`);
            console.log("-".repeat(70) + "\n");
          }
          break;

        case "assistant":
          if (message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === "text") {
                responseText += block.text;
                process.stdout.write(block.text);
              }
            }
          }
          break;

        case "stream_event":
          if (message.event.type === "content_block_start") {
            const block = message.event.content_block;
            if (block.type === "tool_use") {
              console.log(`\n\n[Tool: ${block.name}]`);
            }
          } else if (message.event.type === "content_block_stop") {
            console.log("\n");
          }
          break;

        case "result":
          if (message.subtype !== "success") {
            console.error(`\n[Error: ${message.subtype}]`);
            if ("errors" in message && message.errors) {
              for (const err of message.errors) {
                console.error(`  ${err}`);
              }
            }
          }
          break;
      }
    }

    console.log("\n" + "-".repeat(40) + "\n");
    return { status: "continue", response: responseText, sessionId };
  } catch (err) {
    const error = err as Error;
    console.error(`\nSession error: ${error.message}`);
    return { status: "error", response: error.message };
  }
}

// =============================================================================
// Main Loop
// =============================================================================

export async function runLongRunningAgent(
  config: LongRunningConfig,
): Promise<LongRunningResult> {
  const {
    projectDir,
    model,
    agentType,
    systemPrompt,
    maxSessions = Infinity,
    enablePuppeteer = true,
    sandboxEnabled = true,
    additionalReadPaths = [],
    getPrompt,
    loadState,
    saveState,
    onSessionStart,
    onSessionEnd,
    isComplete,
  } = config;

  const resolvedProjectDir = resolve(projectDir);

  // Create security settings file
  const settings = generateSettings({
    projectDir: resolvedProjectDir,
    sandboxEnabled,
    permissionMode: "acceptEdits",
    enablePuppeteer,
    additionalReadPaths,
  });
  const settingsPath = createSettingsFile({
    projectDir: resolvedProjectDir,
    sandboxEnabled,
    permissionMode: "acceptEdits",
    enablePuppeteer,
    additionalReadPaths,
  });

  printSecuritySummary(settingsPath, settings, resolvedProjectDir);

  // Create query options
  const queryOptions = createQueryOptions({
    projectDir: resolvedProjectDir,
    model,
    systemPrompt,
    enablePuppeteer,
    agentType,
  });

  // Load initial state
  let state = loadState();
  let sessionNumber = state.sessionCount;
  let completed = false;
  let lastSessionId: string | undefined;

  // Main loop
  while (sessionNumber < maxSessions) {
    sessionNumber++;

    // Notify session start
    onSessionStart?.(sessionNumber);

    console.log(
      `\n${"=".repeat(70)}\n  SESSION ${sessionNumber}${maxSessions === Infinity ? "" : ` / ${maxSessions}`}\n${"=".repeat(70)}\n`,
    );

    // Get prompt for this session
    const prompt = getPrompt(sessionNumber, state);

    // Run session
    const result = await runSession(prompt, queryOptions, lastSessionId);

    if (result.sessionId) {
      lastSessionId = result.sessionId;
    }

    // Handle result
    if (result.status === "error") {
      console.log(
        `\nSession error. Retrying in ${ERROR_RETRY_DELAY_MS / 1000}s...`,
      );
      await sleep(ERROR_RETRY_DELAY_MS);
      sessionNumber--; // Retry this session
      continue;
    }

    // Notify session end
    onSessionEnd?.(sessionNumber, result.response);

    // Reload state (agent may have modified files)
    state = loadState();

    // Check completion
    if (isComplete?.(result.response)) {
      completed = true;
      console.log("\n*** TASK COMPLETED ***\n");
      break;
    }

    // Auto-continue
    if (sessionNumber < maxSessions) {
      const delaySec = AUTO_CONTINUE_DELAY_MS / 1000;
      console.log(`\nContinuing in ${delaySec}s... (Ctrl+C to stop)\n`);
      await sleep(AUTO_CONTINUE_DELAY_MS);
    }
  }

  if (!completed && sessionNumber >= maxSessions) {
    console.log(`\nReached max sessions (${maxSessions})`);
    console.log(
      "To continue, run again with --max-sessions or use 'ai-agent resume'\n",
    );
  }

  return {
    sessions: sessionNumber,
    completed,
    state,
  };
}

// =============================================================================
// Display Helpers
// =============================================================================

export interface LongRunningHeaderOptions {
  agentName: string;
  projectDir: string;
  model: string;
  stateType: AgentType;
  initialized: boolean;
  sessionCount: number;
  maxSessions?: number;
}

export function printLongRunningHeader(
  options: LongRunningHeaderOptions,
): void {
  const {
    agentName,
    projectDir,
    model,
    stateType,
    initialized,
    sessionCount,
    maxSessions,
  } = options;

  console.log("\n" + "=".repeat(70));
  console.log(`  ${agentName.toUpperCase()}`);
  console.log("=".repeat(70));
  console.log(`\nProject: ${projectDir}`);
  console.log(`Model: ${model}`);
  console.log(`Type: ${stateType}`);
  console.log(`Status: ${initialized ? "Continuing" : "Fresh start"}`);
  console.log(`Sessions completed: ${sessionCount}`);
  console.log(
    `Max sessions: ${maxSessions === Infinity ? "Unlimited" : maxSessions}`,
  );
  console.log();
}

export interface LongRunningCompletionOptions {
  agentName: string;
  completed: boolean;
  sessions: number;
  state: ProjectState;
}

export function printLongRunningCompletion(
  options: LongRunningCompletionOptions,
): void {
  const { agentName, completed, sessions, state } = options;

  console.log("\n" + "=".repeat(70));
  console.log(completed ? "  TASK COMPLETED" : "  SESSION ENDED");
  console.log("=".repeat(70));
  console.log(`\nAgent: ${agentName}`);
  console.log(`Sessions: ${sessions}`);
  console.log(`Status: ${completed ? "Completed" : "Incomplete"}`);

  if (state.type === "builder") {
    const builderState = state as BuilderState;
    const total = builderState.features.length;
    const passing = builderState.features.filter((f) => f.passes).length;
    console.log(`Features: ${passing}/${total} passing`);
  } else if (state.type === "migrator") {
    const migratorState = state as MigratorState;
    const total = migratorState.files.length;
    const migrated = migratorState.files.filter(
      (f) => f.status === "migrated",
    ).length;
    console.log(`Files: ${migrated}/${total} migrated`);
  } else if (state.type === "scaffold") {
    const scaffoldState = state as ScaffoldState;
    const total = scaffoldState.tasks.length;
    const completed = scaffoldState.tasks.filter(
      (t) => t.status === "completed",
    ).length;
    console.log(`Tasks: ${completed}/${total} completed`);
  }

  console.log();

  // Print next steps
  if (!completed) {
    console.log("-".repeat(70));
    console.log("  TO CONTINUE:");
    console.log("-".repeat(70));
    console.log(`\n  ai-agent resume -p ${state.projectDir}`);
    console.log(
      "\n  Or run the same command again to pick up where you left off.",
    );
    console.log("-".repeat(70));
  }
}
