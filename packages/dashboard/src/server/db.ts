/**
 * SQLite Database for Dashboard
 *
 * Uses Bun's native bun:sqlite for optimal performance.
 *
 * Stores:
 * - Registered repositories
 * - Agent run history
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// =============================================================================
// Types
// =============================================================================

export interface Repo {
  id: number;
  path: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  repo_id: number;
  worktree_path: string;
  agent_type: string;
  status: "running" | "completed" | "failed" | "stopped";
  spec_text?: string;
  spec_file?: string;
  reference_paths?: string; // JSON array
  started_at: string;
  completed_at?: string;
  pid?: number;
}

// =============================================================================
// Database Initialization
// =============================================================================

const DB_PATH = join(homedir(), ".ai-agents", "dashboard.db");

export function initDatabase(): Database {
  // Ensure directory exists
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH, { create: true });

  // Enable WAL mode for better concurrent access
  db.exec("PRAGMA journal_mode = WAL");

  // Create tables
  db.exec(`
    -- Registered repositories
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Agent run history
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      repo_id INTEGER,
      worktree_path TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      spec_text TEXT,
      spec_file TEXT,
      reference_paths TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      pid INTEGER,
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_worktree ON agent_runs(worktree_path);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_repo ON agent_runs(repo_id);
  `);

  return db;
}

// =============================================================================
// Repository Operations
// =============================================================================

export function getAllRepos(db: Database): Repo[] {
  return db.query("SELECT * FROM repos ORDER BY updated_at DESC").all() as Repo[];
}

export function getRepoById(db: Database, id: number): Repo | null {
  return db.query("SELECT * FROM repos WHERE id = ?").get(id) as Repo | null;
}

export function getRepoByPath(db: Database, path: string): Repo | null {
  return db.query("SELECT * FROM repos WHERE path = ?").get(path) as Repo | null;
}

export function createRepo(db: Database, path: string, name: string): Repo {
  const stmt = db.query(
    "INSERT INTO repos (path, name) VALUES (?, ?) RETURNING *"
  );
  return stmt.get(path, name) as Repo;
}

export function deleteRepo(db: Database, id: number): void {
  db.query("DELETE FROM repos WHERE id = ?").run(id);
}

export function updateRepoTimestamp(db: Database, id: number): void {
  db.query("UPDATE repos SET updated_at = datetime('now') WHERE id = ?").run(id);
}

// =============================================================================
// Agent Run Operations
// =============================================================================

export function getAllAgentRuns(db: Database): AgentRun[] {
  return db
    .query("SELECT * FROM agent_runs ORDER BY started_at DESC")
    .all() as AgentRun[];
}

export function getRunningAgents(db: Database): AgentRun[] {
  return db
    .query("SELECT * FROM agent_runs WHERE status = 'running' ORDER BY started_at DESC")
    .all() as AgentRun[];
}

export function getAgentRunById(db: Database, id: string): AgentRun | null {
  return db
    .query("SELECT * FROM agent_runs WHERE id = ?")
    .get(id) as AgentRun | null;
}

export function getAgentRunsByWorktree(db: Database, worktreePath: string): AgentRun[] {
  return db
    .query("SELECT * FROM agent_runs WHERE worktree_path = ? ORDER BY started_at DESC")
    .all(worktreePath) as AgentRun[];
}

export function createAgentRun(
  db: Database,
  run: Omit<AgentRun, "started_at" | "completed_at">
): AgentRun {
  const stmt = db.query(`
    INSERT INTO agent_runs (id, repo_id, worktree_path, agent_type, status, spec_text, spec_file, reference_paths, pid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(
    run.id,
    run.repo_id,
    run.worktree_path,
    run.agent_type,
    run.status,
    run.spec_text || null,
    run.spec_file || null,
    run.reference_paths || null,
    run.pid || null
  ) as AgentRun;
}

export function updateAgentRunStatus(
  db: Database,
  id: string,
  status: AgentRun["status"],
  completed_at?: string
): void {
  if (completed_at) {
    db.query("UPDATE agent_runs SET status = ?, completed_at = ? WHERE id = ?").run(
      status,
      completed_at,
      id
    );
  } else {
    db.query("UPDATE agent_runs SET status = ? WHERE id = ?").run(status, id);
  }
}

export function updateAgentRunPid(db: Database, id: string, pid: number): void {
  db.query("UPDATE agent_runs SET pid = ? WHERE id = ?").run(pid, id);
}
