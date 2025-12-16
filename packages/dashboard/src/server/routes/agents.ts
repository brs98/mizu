/**
 * Agent Management Routes
 *
 * Handles starting, stopping, and monitoring AI agents.
 */

import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { join } from "node:path";

import {
  getAllAgentRuns,
  getAgentRunById,
  createAgentRun,
  updateAgentRunStatus,
  updateAgentRunPid,
  getRepoById,
} from "../db";
import { AgentManager, type AgentType } from "../services/agent-runner";

// =============================================================================
// Types
// =============================================================================

type Variables = {
  db: Database;
  agentManager: AgentManager;
};

// =============================================================================
// Router
// =============================================================================

export const agentsRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /api/agents
 * List all agents (running and historical)
 */
agentsRouter.get("/", (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");

  // Get historical runs from DB
  const dbRuns = getAllAgentRuns(db);

  // Get currently running agents
  const running = agentManager.getRunningAgents();
  const runningIds = new Set(running.map((a) => a.id));

  // Merge: update status for running agents
  const agents = dbRuns.map((run) => ({
    ...run,
    status: runningIds.has(run.id) ? "running" : run.status,
  }));

  // Add any running agents not in DB yet
  for (const agent of running) {
    if (!dbRuns.find((r) => r.id === agent.id)) {
      agents.unshift({
        id: agent.id,
        repo_id: 0,
        worktree_path: agent.worktreePath,
        agent_type: agent.type,
        status: "running" as const,
        started_at: agent.startedAt.toISOString(),
        pid: agent.pid,
      });
    }
  }

  return c.json({ agents });
});

/**
 * GET /api/agents/running
 * List only currently running agents
 */
agentsRouter.get("/running", (c) => {
  const agentManager = c.get("agentManager");
  const running = agentManager.getRunningAgents();

  const agents = running.map((a) => ({
    id: a.id,
    type: a.type,
    worktreePath: a.worktreePath,
    pid: a.pid,
    startedAt: a.startedAt.toISOString(),
  }));

  return c.json({ agents });
});

/**
 * GET /api/agents/:id
 * Get details for a specific agent
 */
agentsRouter.get("/:id", async (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");
  const id = c.req.param("id");

  // Check if running
  const running = agentManager.getAgent(id);
  if (running) {
    const progress = await agentManager.readProgress(
      running.worktreePath,
      running.type
    );

    return c.json({
      agent: {
        id: running.id,
        type: running.type,
        worktreePath: running.worktreePath,
        status: "running",
        pid: running.pid,
        startedAt: running.startedAt.toISOString(),
        progress,
      },
    });
  }

  // Check DB
  const dbRun = getAgentRunById(db, id);
  if (!dbRun) {
    return c.json({ error: "Agent not found" }, 404);
  }

  // Try to read final progress
  let progress;
  try {
    progress = await agentManager.readProgress(
      dbRun.worktree_path,
      dbRun.agent_type as AgentType
    );
  } catch {
    // Progress file might not exist
  }

  return c.json({
    agent: {
      ...dbRun,
      progress,
    },
  });
});

/**
 * POST /api/agents
 * Start a new agent
 *
 * Body: {
 *   type: AgentType,
 *   worktreePath: string,
 *   repoId?: number,
 *   specText?: string,
 *   specFile?: string,
 *   referencePaths?: string[],
 *   model?: string,
 *   maxSessions?: number
 * }
 */
agentsRouter.post("/", async (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");

  const body = await c.req.json<{
    type: AgentType;
    worktreePath: string;
    repoId?: number;
    specText?: string;
    specFile?: string;
    referencePaths?: string[];
    model?: string;
    maxSessions?: number;
  }>();

  // Validate required fields
  if (!body.type || !body.worktreePath) {
    return c.json({ error: "type and worktreePath are required" }, 400);
  }

  // Validate agent type
  const validTypes: AgentType[] = [
    "bugfix",
    "feature",
    "refactor",
    "builder",
    "migrator",
    "scaffold",
  ];
  if (!validTypes.includes(body.type)) {
    return c.json({ error: `Invalid agent type. Must be one of: ${validTypes.join(", ")}` }, 400);
  }

  // Check if worktree exists
  const wtFile = Bun.file(body.worktreePath);
  if (!(await wtFile.exists())) {
    return c.json({ error: "Worktree path does not exist" }, 400);
  }

  // Generate agent ID
  const id = crypto.randomUUID();

  try {
    // Start the agent
    const agent = await agentManager.start({
      id,
      type: body.type,
      worktreePath: body.worktreePath,
      specText: body.specText,
      specFile: body.specFile,
      referencePaths: body.referencePaths,
      model: body.model,
      maxSessions: body.maxSessions,
    });

    // Record in database
    createAgentRun(db, {
      id,
      repo_id: body.repoId || 0,
      worktree_path: body.worktreePath,
      agent_type: body.type,
      status: "running",
      spec_text: body.specText,
      spec_file: body.specFile,
      reference_paths: body.referencePaths
        ? JSON.stringify(body.referencePaths)
        : undefined,
      pid: agent.pid,
    });

    return c.json(
      {
        agent: {
          id: agent.id,
          type: agent.type,
          worktreePath: agent.worktreePath,
          status: "running",
          pid: agent.pid,
          startedAt: agent.startedAt.toISOString(),
        },
      },
      201
    );
  } catch (err) {
    return c.json({ error: `Failed to start agent: ${err}` }, 500);
  }
});

/**
 * POST /api/agents/:id/stop
 * Stop a running agent
 */
agentsRouter.post("/:id/stop", (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");
  const id = c.req.param("id");

  const stopped = agentManager.stop(id);
  if (!stopped) {
    return c.json({ error: "Agent not found or not running" }, 404);
  }

  // Update DB status
  updateAgentRunStatus(db, id, "stopped", new Date().toISOString());

  return c.json({ success: true });
});

/**
 * POST /api/agents/:id/resume
 * Resume a stopped/failed agent
 */
agentsRouter.post("/:id/resume", async (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");
  const id = c.req.param("id");

  const body = await c.req.json<{
    model?: string;
    maxSessions?: number;
  }>().catch(() => ({}));

  // Get the original agent run
  const dbRun = getAgentRunById(db, id);
  if (!dbRun) {
    return c.json({ error: "Agent not found" }, 404);
  }

  if (dbRun.status === "running") {
    return c.json({ error: "Agent is already running" }, 400);
  }

  // Generate new ID for resumed run
  const newId = crypto.randomUUID();

  try {
    const agent = await agentManager.resume(
      newId,
      dbRun.worktree_path,
      body.model,
      body.maxSessions
    );

    // Record new run
    createAgentRun(db, {
      id: newId,
      repo_id: dbRun.repo_id,
      worktree_path: dbRun.worktree_path,
      agent_type: agent.type,
      status: "running",
      spec_text: dbRun.spec_text,
      spec_file: dbRun.spec_file,
      reference_paths: dbRun.reference_paths,
      pid: agent.pid,
    });

    return c.json({
      agent: {
        id: agent.id,
        type: agent.type,
        worktreePath: agent.worktreePath,
        status: "running",
        pid: agent.pid,
        startedAt: agent.startedAt.toISOString(),
      },
    });
  } catch (err) {
    return c.json({ error: `Failed to resume agent: ${err}` }, 500);
  }
});

/**
 * GET /api/agents/:id/progress
 * Get current progress for an agent
 */
agentsRouter.get("/:id/progress", async (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");
  const id = c.req.param("id");

  // Check if running
  const running = agentManager.getAgent(id);
  if (running) {
    const progress = await agentManager.readProgress(
      running.worktreePath,
      running.type
    );
    return c.json({ progress });
  }

  // Check DB for historical
  const dbRun = getAgentRunById(db, id);
  if (!dbRun) {
    return c.json({ error: "Agent not found" }, 404);
  }

  try {
    const progress = await agentManager.readProgress(
      dbRun.worktree_path,
      dbRun.agent_type as AgentType
    );
    return c.json({ progress });
  } catch {
    return c.json({ progress: { total: 0, completed: 0, inProgress: 0, pending: 0 } });
  }
});
