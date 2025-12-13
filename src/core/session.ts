/**
 * Multi-Session Agent Runner
 *
 * @deprecated Use `runLongRunningAgent` from `longrunning.ts` instead.
 * All agents now use the two-phase pattern (initializer → worker) with
 * persistent task-based state tracking. This module is kept for backwards
 * compatibility but will be removed in a future version.
 *
 * Migration guide:
 * - Replace `runMultiSessionAgent` with `runLongRunningAgent`
 * - Add state management using the appropriate state type (BuilderState, etc.)
 * - Create initializer.md and worker.md prompts
 * - Use task-based tracking instead of iteration counts
 *
 * Provides the core loop for running agents across multiple sessions.
 * Handles:
 * - Session continuation with resume
 * - Iteration limits
 * - Auto-continue delays
 * - Completion detection
 * - Progress tracking
 */

import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type AgentType } from "./permissions";
import { createSecurePermissionCallback } from "./security";
import { createSettingsFile, generateSettings, printSecuritySummary } from "./sandbox";

export interface SessionConfig {
  projectDir: string;
  model: string;
  agentType: AgentType;
  systemPrompt: string;
  maxIterations?: number; // Default: unlimited (Infinity)
}

export interface SessionCallbacks {
  getPrompt: (iteration: number, sessionId?: string) => string;
  onSessionStart?: (iteration: number) => void;
  onSessionEnd?: (iteration: number, response: string) => void;
  isComplete?: (response: string) => boolean;
  onComplete?: () => void;
}

// Default completion markers
const DEFAULT_COMPLETION_MARKERS = [
  "task completed",
  "fix applied",
  "fix verified",
  "bug fixed",
  "bug is resolved",
  "successfully fixed",
  "successfully completed",
  "implementation complete",
  "feature implementation complete",
  "refactoring complete",
  "all tests passing",
];

const DEFAULT_AUTO_CONTINUE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an agent across multiple sessions until completion or max iterations
 */
export async function runMultiSessionAgent(
  config: SessionConfig,
  callbacks: SessionCallbacks
): Promise<{ iterations: number; completed: boolean; sessionId?: string }> {
  const {
    projectDir,
    model,
    agentType,
    systemPrompt,
    maxIterations = Infinity,
  } = config;

  const { getPrompt, onSessionStart, onSessionEnd, isComplete, onComplete } = callbacks;

  // Create settings file for permissions
  const settings = generateSettings({
    projectDir,
    sandboxEnabled: true,
    permissionMode: "acceptEdits",
    enablePuppeteer: false,
  });
  const settingsPath = createSettingsFile({
    projectDir,
    sandboxEnabled: true,
    permissionMode: "acceptEdits",
    enablePuppeteer: false,
  });

  printSecuritySummary(settingsPath, settings, projectDir);

  let iteration = 0;
  let sessionId: string | undefined;
  let completed = false;

  // Check completion using provided function or defaults
  const checkComplete = (response: string): boolean => {
    if (isComplete) {
      return isComplete(response);
    }
    const lowerResponse = response.toLowerCase();
    return DEFAULT_COMPLETION_MARKERS.some((marker) => lowerResponse.includes(marker));
  };

  while (iteration < maxIterations) {
    iteration++;

    // Notify session start
    onSessionStart?.(iteration);

    console.log(`\n--- Session ${iteration}${maxIterations === Infinity ? "" : `/${maxIterations}`} ---\n`);

    const prompt = getPrompt(iteration, sessionId);
    let responseText = "";

    try {
      const response = query({
        prompt,
        options: {
          model,
          cwd: projectDir,
          systemPrompt,
          permissionMode: "acceptEdits" as const,
          canUseTool: createSecurePermissionCallback(agentType),
          // Load settings from .claude/settings.local.json
          settingSources: ["local" as const],
          // Resume previous session if we have one
          ...(sessionId ? { resume: sessionId } : {}),
        },
      });

      for await (const message of response) {
        switch (message.type) {
          case "system":
            if (message.subtype === "init") {
              sessionId = message.session_id;
              if (iteration === 1) {
                console.log(`Session ID: ${sessionId}\n`);
              }
              console.log("-".repeat(70) + "\n");
            }
            break;

          case "assistant":
            // Extract text from the assistant message content blocks
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
            // Handle streaming events for tool use
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

      // Notify session end
      onSessionEnd?.(iteration, responseText);

      // Check for completion
      if (checkComplete(responseText)) {
        completed = true;
        onComplete?.();
        break;
      }

      // Auto-continue delay
      if (iteration < maxIterations) {
        const delaySec = DEFAULT_AUTO_CONTINUE_DELAY_MS / 1000;
        console.log(`Continuing in ${delaySec}s... (Ctrl+C to stop)\n`);
        await sleep(DEFAULT_AUTO_CONTINUE_DELAY_MS);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`\nSession error: ${error.message}`);

      // On error, wait and retry
      console.log("Retrying in 5s...");
      await sleep(5000);
    }
  }

  if (!completed && iteration >= maxIterations) {
    console.log(`\nReached max iterations (${maxIterations})`);
  }

  return { iterations: iteration, completed, sessionId };
}

/**
 * Print session summary header
 */
export function printAgentHeader(
  agentName: string,
  projectDir: string,
  model: string,
  maxIterations?: number
): void {
  const iterations = maxIterations ?? Infinity;

  console.log("\n" + "=".repeat(70));
  console.log(`  ${agentName.toUpperCase()}`);
  console.log("=".repeat(70));
  console.log(`\nProject: ${projectDir}`);
  console.log(`Model: ${model}`);
  console.log(`Max iterations: ${iterations === Infinity ? "unlimited" : iterations}`);
  console.log();
}

/**
 * Print completion summary
 */
export function printCompletionSummary(
  agentName: string,
  completed: boolean,
  iterations: number
): void {
  console.log("\n" + "=".repeat(70));
  if (completed) {
    console.log("  TASK COMPLETED");
  } else {
    console.log("  SESSION ENDED");
  }
  console.log("=".repeat(70));
  console.log(`\nAgent: ${agentName}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Status: ${completed ? "Completed" : "Incomplete"}`);
  console.log();
}
