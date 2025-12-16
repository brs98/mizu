/**
 * Agent Runner Service
 *
 * Uses Bun.spawn for process management and Bun's native file APIs.
 * Manages spawning, monitoring, and stopping AI agent processes.
 */

import { watch } from "fs";
import { join, dirname } from "node:path";
import type { Subprocess } from "bun";

// =============================================================================
// Types
// =============================================================================

export type AgentType =
  | "bugfix"
  | "feature"
  | "refactor"
  | "builder"
  | "migrator"
  | "scaffold";

export interface RunningAgent {
  id: string;
  type: AgentType;
  worktreePath: string;
  process: Subprocess;
  pid: number;
  startedAt: Date;
  abortController?: AbortController;
}

export interface AgentStartOptions {
  id: string;
  type: AgentType;
  worktreePath: string;
  specText?: string;
  specFile?: string;
  referencePaths?: string[];
  model?: string;
  maxSessions?: number;
}

export interface TaskProgress {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  currentTask?: string;
}

type BroadcastFn = (agentId: string, event: string, data: unknown) => void;

// =============================================================================
// Agent Manager
// =============================================================================

export class AgentManager {
  private agents = new Map<string, RunningAgent>();
  private broadcast: BroadcastFn = () => {};
  private watchers = new Map<string, ReturnType<typeof watch>>();

  /**
   * Set the broadcast function for WebSocket updates
   */
  setBroadcast(fn: BroadcastFn): void {
    this.broadcast = fn;
  }

  /**
   * Get all running agents
   */
  getRunningAgents(): RunningAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get a running agent by ID
   */
  getAgent(id: string): RunningAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get a running agent by worktree path
   */
  getAgentByWorktree(worktreePath: string): RunningAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.worktreePath === worktreePath) {
        return agent;
      }
    }
    return undefined;
  }

  /**
   * Start a new agent
   */
  async start(options: AgentStartOptions): Promise<RunningAgent> {
    const { id, type, worktreePath, specText, specFile, referencePaths, model, maxSessions } =
      options;

    // Check if an agent is already running in this worktree
    const existing = this.getAgentByWorktree(worktreePath);
    if (existing) {
      throw new Error(`Agent already running in ${worktreePath}`);
    }

    // Build command arguments
    const args = ["run", this.getCliPath(), type, "-p", worktreePath];

    if (specText) {
      args.push("-s", specText);
    } else if (specFile) {
      args.push("-f", specFile);
    }

    if (model) {
      args.push("-m", model);
    }

    if (maxSessions) {
      args.push("--max-sessions", maxSessions.toString());
    }

    if (referencePaths && referencePaths.length > 0) {
      args.push("--read-paths", referencePaths.join(","));
    }

    console.log(`[AgentManager] Starting ${type} agent in ${worktreePath}`);
    console.log(`[AgentManager] Command: bun ${args.join(" ")}`);

    // Spawn using Bun.spawn
    const proc = Bun.spawn(["bun", ...args], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });

    const agent: RunningAgent = {
      id,
      type,
      worktreePath,
      process: proc,
      pid: proc.pid,
      startedAt: new Date(),
    };

    // Stream stdout
    this.streamOutput(agent, proc.stdout, "stdout");
    this.streamOutput(agent, proc.stderr, "stderr");

    // Handle process exit
    proc.exited.then((code) => {
      console.log(`[AgentManager] Agent ${id} exited with code ${code}`);
      this.cleanup(id);

      const status = code === 0 ? "completed" : "failed";
      this.broadcast(id, "agent:complete", { status, exitCode: code });
    });

    // Watch state files for progress updates
    this.watchStateFiles(agent);

    this.agents.set(id, agent);
    return agent;
  }

  /**
   * Stop a running agent
   */
  stop(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) {
      return false;
    }

    console.log(`[AgentManager] Stopping agent ${id}`);

    // Kill the process
    agent.process.kill();

    // Cleanup will happen in the exited handler
    return true;
  }

  /**
   * Resume a stopped agent
   */
  async resume(
    id: string,
    worktreePath: string,
    model?: string,
    maxSessions?: number
  ): Promise<RunningAgent> {
    const existing = this.getAgentByWorktree(worktreePath);
    if (existing) {
      throw new Error(`Agent already running in ${worktreePath}`);
    }

    const args = ["run", this.getCliPath(), "resume", "-p", worktreePath];

    if (model) {
      args.push("-m", model);
    }

    if (maxSessions) {
      args.push("--max-sessions", maxSessions.toString());
    }

    const proc = Bun.spawn(["bun", ...args], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Detect agent type from state file
    const type = await this.detectAgentType(worktreePath);

    const agent: RunningAgent = {
      id,
      type,
      worktreePath,
      process: proc,
      pid: proc.pid,
      startedAt: new Date(),
    };

    this.streamOutput(agent, proc.stdout, "stdout");
    this.streamOutput(agent, proc.stderr, "stderr");

    proc.exited.then((code) => {
      console.log(`[AgentManager] Agent ${id} exited with code ${code}`);
      this.cleanup(id);
      const status = code === 0 ? "completed" : "failed";
      this.broadcast(id, "agent:complete", { status, exitCode: code });
    });

    this.watchStateFiles(agent);
    this.agents.set(id, agent);

    return agent;
  }

  /**
   * Get CLI path relative to dashboard package
   */
  private getCliPath(): string {
    // Dashboard is at packages/dashboard, CLI is at src/cli.ts
    return join(dirname(dirname(dirname(dirname(__dirname)))), "src", "cli.ts");
  }

  /**
   * Stream output from a readable stream
   */
  private async streamOutput(
    agent: RunningAgent,
    stream: ReadableStream<Uint8Array> | null,
    type: "stdout" | "stderr"
  ): Promise<void> {
    if (!stream) return;

    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        this.broadcast(agent.id, "agent:log", { text, stream: type });
      }
    } catch (err) {
      // Stream closed
    }
  }

  /**
   * Detect agent type from state file
   */
  private async detectAgentType(worktreePath: string): Promise<AgentType> {
    const stateFile = Bun.file(join(worktreePath, ".ai-agent-state.json"));

    if (await stateFile.exists()) {
      try {
        const state = await stateFile.json();
        return state.type || "feature";
      } catch {
        // Default
      }
    }
    return "feature";
  }

  /**
   * Watch state files for progress updates
   */
  private watchStateFiles(agent: RunningAgent): void {
    const { id, worktreePath } = agent;

    // Watch the directory for changes
    const watcher = watch(worktreePath, { persistent: false }, async (eventType, filename) => {
      if (!filename) return;

      // Check if it's a state file we care about
      const stateFiles = [
        ".ai-agent-state.json",
        "bugfix_tasks.json",
        "feature_tasks.json",
        "refactor_tasks.json",
        "feature_list.json",
        "migration_manifest.json",
        "scaffold_tasks.json",
      ];

      if (stateFiles.includes(filename)) {
        await this.broadcastProgress(agent);
      }
    });

    this.watchers.set(id, watcher);

    // Send initial progress after a short delay
    setTimeout(() => this.broadcastProgress(agent), 1000);
  }

  /**
   * Cleanup resources for an agent
   */
  private cleanup(id: string): void {
    const watcher = this.watchers.get(id);
    if (watcher) {
      watcher.close();
      this.watchers.delete(id);
    }
    this.agents.delete(id);
  }

  /**
   * Broadcast current progress for an agent
   */
  private async broadcastProgress(agent: RunningAgent): Promise<void> {
    try {
      const progress = await this.readProgress(agent.worktreePath, agent.type);
      this.broadcast(agent.id, "agent:progress", progress);
    } catch {
      // File might not exist yet
    }
  }

  /**
   * Read progress from state files
   */
  async readProgress(worktreePath: string, type: AgentType): Promise<TaskProgress> {
    const taskFiles: Record<AgentType, string> = {
      bugfix: "bugfix_tasks.json",
      feature: "feature_tasks.json",
      refactor: "refactor_tasks.json",
      builder: "feature_list.json",
      migrator: "migration_manifest.json",
      scaffold: "scaffold_tasks.json",
    };

    const taskFile = Bun.file(join(worktreePath, taskFiles[type]));

    if (!(await taskFile.exists())) {
      return { total: 0, completed: 0, inProgress: 0, pending: 0 };
    }

    const data = await taskFile.json();

    // Handle different file formats
    if (type === "builder") {
      const features = data.features || [];
      const passing = features.filter((f: { passes: boolean }) => f.passes).length;
      return {
        total: features.length,
        completed: passing,
        inProgress: 0,
        pending: features.length - passing,
        currentTask: features.find((f: { passes: boolean }) => !f.passes)?.feature,
      };
    } else if (type === "migrator") {
      const files = data.files || [];
      const migrated = files.filter((f: { status: string }) => f.status === "migrated").length;
      const inProgress = files.filter((f: { status: string }) => f.status === "in_progress").length;
      return {
        total: files.length,
        completed: migrated,
        inProgress,
        pending: files.length - migrated - inProgress,
        currentTask: files.find((f: { status: string }) => f.status === "in_progress")?.path,
      };
    } else {
      // Standard task format
      const tasks = data.tasks || [];
      const completed = tasks.filter((t: { status: string }) => t.status === "completed").length;
      const inProgress = tasks.filter((t: { status: string }) => t.status === "in_progress").length;
      return {
        total: tasks.length,
        completed,
        inProgress,
        pending: tasks.length - completed - inProgress,
        currentTask: tasks.find((t: { status: string }) => t.status === "in_progress")?.description,
      };
    }
  }
}
