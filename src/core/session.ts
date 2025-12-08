/**
 * Multi-Session Agent Runner
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
import { type DepthConfig } from "./depth";
import { type AgentType, createPermissionCallback, getPermissionMode } from "./permissions";

export interface SessionConfig {
  projectDir: string;
  model: string;
  depthConfig: DepthConfig;
  agentType: AgentType;
  systemPrompt: string;
  maxIterations?: number; // Override depth preset
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
    depthConfig,
    agentType,
    systemPrompt,
    maxIterations = depthConfig.maxIterations,
  } = config;

  const { getPrompt, onSessionStart, onSessionEnd, isComplete, onComplete } = callbacks;

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
          permissionMode: getPermissionMode(depthConfig.level),
          canUseTool: createPermissionCallback(agentType),
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
                console.log(`\n[Tool: ${block.name}]`);
              }
            } else if (message.event.type === "content_block_stop") {
              // Tool use completed
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

      console.log("\n");

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
        const delaySec = depthConfig.autoContinueDelayMs / 1000;
        console.log(`Continuing in ${delaySec}s... (Ctrl+C to stop)\n`);
        await sleep(depthConfig.autoContinueDelayMs);
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
    if (depthConfig.level !== "thorough") {
      console.log(`Tip: Use --depth thorough for unlimited iterations`);
    }
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
  depthConfig: DepthConfig,
  maxIterations?: number
): void {
  const iterations = maxIterations ?? depthConfig.maxIterations;

  console.log("\n" + "=".repeat(70));
  console.log(`  ${agentName.toUpperCase()}`);
  console.log("=".repeat(70));
  console.log(`\nProject: ${projectDir}`);
  console.log(`Model: ${model}`);
  console.log(`Depth: ${depthConfig.level}`);
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
