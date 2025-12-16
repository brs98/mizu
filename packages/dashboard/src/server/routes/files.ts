/**
 * File and Diff Routes
 *
 * Handles viewing file changes and diffs for agent worktrees.
 */

import { Hono } from "hono";
import { join } from "node:path";

import { getDiff, getFileDiff, getChangedFiles, getRecentCommits } from "../services/git";

// =============================================================================
// Router
// =============================================================================

export const filesRouter = new Hono();

/**
 * GET /api/files/diff
 * Get full diff for a worktree compared to base branch
 *
 * Query: path (worktree path), base (optional base branch)
 */
filesRouter.get("/diff", async (c) => {
  const path = c.req.query("path");
  const base = c.req.query("base");

  if (!path) {
    return c.json({ error: "Path query parameter is required" }, 400);
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    return c.json({ error: "Path does not exist" }, 404);
  }

  try {
    const diff = await getDiff(path, base || undefined);
    return c.json({ diff });
  } catch (err) {
    return c.json({ error: `Failed to get diff: ${err}` }, 500);
  }
});

/**
 * GET /api/files/diff/:file
 * Get diff for a specific file
 *
 * Query: path (worktree path), base (optional base branch)
 * Param: file (file path relative to worktree, URL encoded)
 */
filesRouter.get("/diff/:file{.+}", async (c) => {
  const worktreePath = c.req.query("path");
  const base = c.req.query("base");
  const filePath = c.req.param("file");

  if (!worktreePath) {
    return c.json({ error: "Path query parameter is required" }, 400);
  }

  const file = Bun.file(worktreePath);
  if (!(await file.exists())) {
    return c.json({ error: "Worktree path does not exist" }, 404);
  }

  try {
    const diff = await getFileDiff(worktreePath, filePath, base || undefined);
    return c.json({ diff, file: filePath });
  } catch (err) {
    return c.json({ error: `Failed to get file diff: ${err}` }, 500);
  }
});

/**
 * GET /api/files/changes
 * Get list of changed files in a worktree
 *
 * Query: path (worktree path), base (optional base branch)
 */
filesRouter.get("/changes", async (c) => {
  const path = c.req.query("path");
  const base = c.req.query("base");

  if (!path) {
    return c.json({ error: "Path query parameter is required" }, 400);
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    return c.json({ error: "Path does not exist" }, 404);
  }

  try {
    const files = await getChangedFiles(path, base || undefined);
    return c.json({ files });
  } catch (err) {
    return c.json({ error: `Failed to get changed files: ${err}` }, 500);
  }
});

/**
 * GET /api/files/commits
 * Get recent commits for a worktree
 *
 * Query: path (worktree path), count (optional, default 10)
 */
filesRouter.get("/commits", async (c) => {
  const path = c.req.query("path");
  const countStr = c.req.query("count");
  const count = countStr ? parseInt(countStr, 10) : 10;

  if (!path) {
    return c.json({ error: "Path query parameter is required" }, 400);
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    return c.json({ error: "Path does not exist" }, 404);
  }

  try {
    const commits = await getRecentCommits(path, count);
    return c.json({ commits });
  } catch (err) {
    return c.json({ error: `Failed to get commits: ${err}` }, 500);
  }
});

/**
 * GET /api/files/content
 * Get content of a specific file
 *
 * Query: path (worktree path), file (file path relative to worktree)
 */
filesRouter.get("/content", async (c) => {
  const worktreePath = c.req.query("path");
  const filePath = c.req.query("file");

  if (!worktreePath || !filePath) {
    return c.json({ error: "Path and file query parameters are required" }, 400);
  }

  const fullPath = join(worktreePath, filePath);
  const file = Bun.file(fullPath);

  if (!(await file.exists())) {
    return c.json({ error: "File does not exist" }, 404);
  }

  try {
    const content = await file.text();
    return c.json({ content, file: filePath });
  } catch (err) {
    return c.json({ error: `Failed to read file: ${err}` }, 500);
  }
});
