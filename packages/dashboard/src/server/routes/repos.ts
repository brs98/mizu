/**
 * Repository Management Routes
 *
 * Handles CRUD operations for registered repositories.
 */

import { Hono } from "hono";
import { basename, resolve } from "node:path";
import type { Database } from "bun:sqlite";

import {
  getAllRepos,
  getRepoById,
  getRepoByPath,
  createRepo,
  deleteRepo,
} from "../db";
import { isGitRepo, getRepoRoot } from "../services/git";

// =============================================================================
// Types
// =============================================================================

type Variables = {
  db: Database;
};

// =============================================================================
// Router
// =============================================================================

export const reposRouter = new Hono<{ Variables: Variables }>();

/**
 * GET /api/repos
 * List all registered repositories
 */
reposRouter.get("/", (c) => {
  const db = c.get("db");
  const repos = getAllRepos(db);
  return c.json({ repos });
});

/**
 * GET /api/repos/:id
 * Get a specific repository
 */
reposRouter.get("/:id", (c) => {
  const db = c.get("db");
  const id = parseInt(c.req.param("id"), 10);

  const repo = getRepoById(db, id);
  if (!repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  return c.json({ repo });
});

/**
 * POST /api/repos
 * Register a new repository
 *
 * Body: { path: string, name?: string }
 */
reposRouter.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{ path: string; name?: string }>();

  if (!body.path) {
    return c.json({ error: "Path is required" }, 400);
  }

  const resolvedPath = resolve(body.path);

  // Check if path exists
  const file = Bun.file(resolvedPath);
  if (!(await file.exists())) {
    return c.json({ error: "Path does not exist" }, 400);
  }

  // Check if it's a git repo
  if (!(await isGitRepo(resolvedPath))) {
    return c.json({ error: "Path is not a git repository" }, 400);
  }

  // Get the repo root (in case they pointed to a subdirectory)
  const repoRoot = await getRepoRoot(resolvedPath);
  if (!repoRoot) {
    return c.json({ error: "Could not determine repository root" }, 400);
  }

  // Check if already registered
  const existing = getRepoByPath(db, repoRoot);
  if (existing) {
    return c.json({ error: "Repository already registered", repo: existing }, 409);
  }

  // Create the repo entry
  const name = body.name || basename(repoRoot);
  const repo = createRepo(db, repoRoot, name);

  return c.json({ repo }, 201);
});

/**
 * DELETE /api/repos/:id
 * Unregister a repository
 */
reposRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = parseInt(c.req.param("id"), 10);

  const repo = getRepoById(db, id);
  if (!repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  deleteRepo(db, id);

  return c.json({ success: true });
});

/**
 * PATCH /api/repos/:id
 * Update repository name
 *
 * Body: { name: string }
 */
reposRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{ name: string }>();

  const repo = getRepoById(db, id);
  if (!repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  if (!body.name) {
    return c.json({ error: "Name is required" }, 400);
  }

  db.query("UPDATE repos SET name = ?, updated_at = datetime('now') WHERE id = ?").run(
    body.name,
    id
  );

  const updated = getRepoById(db, id);
  return c.json({ repo: updated });
});
