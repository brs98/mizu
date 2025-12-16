/**
 * Worktree Management Routes
 *
 * Handles operations for git worktrees within registered repositories.
 */

import { Hono } from "hono";
import type { Database } from "bun:sqlite";

import { getRepoById, getAgentRunsByWorktree } from "../db";
import {
  listWorktrees,
  getStatus,
  getChangedFiles,
  createWorktree,
  removeWorktree,
} from "../services/git";
import { AgentManager } from "../services/agent-runner";

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

export const worktreesRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /api/worktrees
 * List all worktrees across all registered repos
 */
worktreesRouter.get("/", async (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");

  const repos = db.query("SELECT * FROM repos").all() as Array<{
    id: number;
    path: string;
    name: string;
  }>;

  const allWorktrees = [];

  for (const repo of repos) {
    try {
      const worktrees = await listWorktrees(repo.path);

      for (const wt of worktrees) {
        // Check if there's a running agent in this worktree
        const runningAgent = agentManager.getAgentByWorktree(wt.path);

        // Get latest agent run from DB
        const agentRuns = getAgentRunsByWorktree(db, wt.path);
        const latestRun = agentRuns[0];

        allWorktrees.push({
          ...wt,
          repoId: repo.id,
          repoName: repo.name,
          agentStatus: runningAgent
            ? "running"
            : latestRun?.status === "completed"
              ? "completed"
              : latestRun?.status === "failed"
                ? "failed"
                : "idle",
          agentType: runningAgent?.type || latestRun?.agent_type,
          agentId: runningAgent?.id || latestRun?.id,
        });
      }
    } catch (err) {
      console.error(`Failed to list worktrees for ${repo.path}:`, err);
    }
  }

  return c.json({ worktrees: allWorktrees });
});

/**
 * GET /api/worktrees/repo/:repoId
 * List worktrees for a specific repository
 */
worktreesRouter.get("/repo/:repoId", async (c) => {
  const db = c.get("db");
  const agentManager = c.get("agentManager");
  const repoId = parseInt(c.req.param("repoId"), 10);

  const repo = getRepoById(db, repoId);
  if (!repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  try {
    const worktrees = await listWorktrees(repo.path);

    const enrichedWorktrees = worktrees.map((wt) => {
      const runningAgent = agentManager.getAgentByWorktree(wt.path);
      const agentRuns = getAgentRunsByWorktree(db, wt.path);
      const latestRun = agentRuns[0];

      return {
        ...wt,
        repoId: repo.id,
        repoName: repo.name,
        agentStatus: runningAgent
          ? "running"
          : latestRun?.status === "completed"
            ? "completed"
            : latestRun?.status === "failed"
              ? "failed"
              : "idle",
        agentType: runningAgent?.type || latestRun?.agent_type,
        agentId: runningAgent?.id || latestRun?.id,
      };
    });

    return c.json({ worktrees: enrichedWorktrees });
  } catch (err) {
    return c.json({ error: `Failed to list worktrees: ${err}` }, 500);
  }
});

/**
 * GET /api/worktrees/status
 * Get git status for a worktree
 *
 * Query: path (worktree path)
 */
worktreesRouter.get("/status", async (c) => {
  const path = c.req.query("path");

  if (!path) {
    return c.json({ error: "Path query parameter is required" }, 400);
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    return c.json({ error: "Worktree path does not exist" }, 404);
  }

  try {
    const status = await getStatus(path);
    return c.json({ status });
  } catch (err) {
    return c.json({ error: `Failed to get status: ${err}` }, 500);
  }
});

/**
 * GET /api/worktrees/changes
 * Get changed files for a worktree compared to base branch
 *
 * Query: path (worktree path), base (optional base branch)
 */
worktreesRouter.get("/changes", async (c) => {
  const path = c.req.query("path");
  const base = c.req.query("base");

  if (!path) {
    return c.json({ error: "Path query parameter is required" }, 400);
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    return c.json({ error: "Worktree path does not exist" }, 404);
  }

  try {
    const files = await getChangedFiles(path, base || undefined);
    return c.json({ files });
  } catch (err) {
    return c.json({ error: `Failed to get changed files: ${err}` }, 500);
  }
});

/**
 * POST /api/worktrees
 * Create a new worktree
 *
 * Body: { repoId: number, branch: string, path: string }
 */
worktreesRouter.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    repoId: number;
    branch: string;
    path: string;
  }>();

  if (!body.repoId || !body.branch || !body.path) {
    return c.json({ error: "repoId, branch, and path are required" }, 400);
  }

  const repo = getRepoById(db, body.repoId);
  if (!repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  try {
    await createWorktree(repo.path, body.branch, body.path);
    return c.json({ success: true, path: body.path });
  } catch (err) {
    return c.json({ error: `Failed to create worktree: ${err}` }, 500);
  }
});

/**
 * DELETE /api/worktrees
 * Remove a worktree
 *
 * Query: repoId, path (worktree path)
 */
worktreesRouter.delete("/", async (c) => {
  const db = c.get("db");
  const repoId = c.req.query("repoId");
  const path = c.req.query("path");

  if (!repoId || !path) {
    return c.json({ error: "repoId and path query parameters are required" }, 400);
  }

  const repo = getRepoById(db, parseInt(repoId, 10));
  if (!repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  try {
    await removeWorktree(repo.path, path);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: `Failed to remove worktree: ${err}` }, 500);
  }
});
