#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

/**
 * Mizu Status MCP Server
 *
 * Provides tools to check the status of mizu plan executions.
 * Reads state files created by mizu without modifying them.
 */

interface StateFile {
  initialized: boolean;
  sessionCount: number;
  completionSummary?: string;
}

interface Task {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  dependencies: string[];
  verificationCommand: string | null;
  completedAt?: string;
  notes?: string;
}

/**
 * Safely read and parse a JSON file
 */
function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    return null;
  }
}

/**
 * Read last N lines from a file
 */
function readLastLines(filePath: string, lines: number = 50): string {
  try {
    if (!fs.existsSync(filePath)) {
      return "Progress file not found";
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const allLines = content.split("\n");
    const lastLines = allLines.slice(-lines);
    return lastLines.join("\n");
  } catch (error) {
    return `Error reading file: ${error}`;
  }
}

/**
 * Calculate progress percentage from tasks
 */
function calculateProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter((t) => t.status === "completed").length;
  return Math.round((completed / tasks.length) * 100);
}

/**
 * Get the next pending task
 */
function getNextPendingTask(tasks: Task[]): Task | null {
  return tasks.find((t) => t.status === "pending") || null;
}

/**
 * Get current task (in_progress or next pending)
 */
function getCurrentTask(tasks: Task[]): Task | null {
  const inProgress = tasks.find((t) => t.status === "in_progress");
  if (inProgress) return inProgress;
  return getNextPendingTask(tasks);
}

// Create server instance
const server = new Server(
  {
    name: "mizu-status",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mizu_status",
        description:
          "Get the current execution status of a mizu plan. Returns initialization status, session count, progress percentage, and current task.",
        inputSchema: {
          type: "object",
          properties: {
            project_dir: {
              type: "string",
              description: "Absolute path to the project directory",
            },
          },
          required: ["project_dir"],
        },
      },
      {
        name: "mizu_tasks",
        description:
          "List all tasks from the execution plan with their status. Returns task array and next pending task.",
        inputSchema: {
          type: "object",
          properties: {
            project_dir: {
              type: "string",
              description: "Absolute path to the project directory",
            },
          },
          required: ["project_dir"],
        },
      },
      {
        name: "mizu_progress",
        description:
          "Get recent progress notes from the execution. Returns last N lines from claude-progress.txt.",
        inputSchema: {
          type: "object",
          properties: {
            project_dir: {
              type: "string",
              description: "Absolute path to the project directory",
            },
            lines: {
              type: "number",
              description: "Number of lines to retrieve (default: 50)",
            },
          },
          required: ["project_dir"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args || typeof args !== "object") {
    throw new Error("Invalid arguments");
  }

  const projectDir = (args as { project_dir?: string }).project_dir;
  if (!projectDir) {
    throw new Error("project_dir is required");
  }

  switch (name) {
    case "mizu_status": {
      const stateFile = path.join(projectDir, ".ai-agent-state.json");
      const tasksFile = path.join(projectDir, "execute_tasks.json");

      const state = readJsonFile<StateFile>(stateFile);
      const tasks = readJsonFile<Task[]>(tasksFile);

      if (!state || !tasks) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  initialized: false,
                  message: "No active mizu execution found in this directory",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const progress = calculateProgress(tasks);
      const currentTask = getCurrentTask(tasks);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                initialized: state.initialized,
                sessionCount: state.sessionCount,
                progressPercentage: progress,
                totalTasks: tasks.length,
                completedTasks: tasks.filter((t) => t.status === "completed")
                  .length,
                currentTask: currentTask
                  ? {
                      id: currentTask.id,
                      description: currentTask.description,
                      status: currentTask.status,
                    }
                  : null,
                completionSummary: state.completionSummary || "",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "mizu_tasks": {
      const tasksFile = path.join(projectDir, "execute_tasks.json");
      const tasks = readJsonFile<Task[]>(tasksFile);

      if (!tasks) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: "No tasks file found in this directory",
                  tasks: [],
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const nextPending = getNextPendingTask(tasks);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                tasks: tasks.map((t) => ({
                  id: t.id,
                  description: t.description,
                  status: t.status,
                  dependencies: t.dependencies,
                  verificationCommand: t.verificationCommand,
                  completedAt: t.completedAt,
                  notes: t.notes,
                })),
                nextPendingTask: nextPending
                  ? {
                      id: nextPending.id,
                      description: nextPending.description,
                    }
                  : null,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "mizu_progress": {
      const progressFile = path.join(projectDir, "claude-progress.txt");
      const lines = (args as { lines?: number }).lines || 50;
      const content = readLastLines(progressFile, lines);

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mizu Status MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
