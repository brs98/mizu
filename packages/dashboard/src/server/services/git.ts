/**
 * Git Operations Service
 *
 * Uses Bun.spawn for git commands.
 * Handles git operations for repos and worktrees.
 */

import { basename } from "node:path";

// =============================================================================
// Types
// =============================================================================

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  name: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
}

// =============================================================================
// Helpers
// =============================================================================

async function execGit(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const code = await proc.exited;

  return { stdout, stderr, code };
}

// =============================================================================
// Git Operations
// =============================================================================

/**
 * Check if a path is a git repository
 */
export async function isGitRepo(path: string): Promise<boolean> {
  const file = Bun.file(path);
  if (!(await file.exists())) return false;

  const result = await execGit(["rev-parse", "--git-dir"], path);
  return result.code === 0;
}

/**
 * Get the root of a git repository
 */
export async function getRepoRoot(path: string): Promise<string | null> {
  const result = await execGit(["rev-parse", "--show-toplevel"], path);
  if (result.code !== 0) return null;
  return result.stdout.trim();
}

/**
 * Get the default branch name (main or master)
 */
export async function getDefaultBranch(repoPath: string): Promise<string> {
  // Try to get from remote
  const result = await execGit(
    ["symbolic-ref", "refs/remotes/origin/HEAD"],
    repoPath
  );
  if (result.code === 0) {
    const ref = result.stdout.trim();
    return ref.replace("refs/remotes/origin/", "");
  }
  // Fallback to checking if main or master exists
  const mainCheck = await execGit(
    ["show-ref", "--verify", "--quiet", "refs/heads/main"],
    repoPath
  );
  return mainCheck.code === 0 ? "main" : "master";
}

/**
 * List all worktrees for a repository
 */
export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const result = await execGit(["worktree", "list", "--porcelain"], repoPath);
  if (result.code !== 0) {
    throw new Error(`Failed to list worktrees: ${result.stderr}`);
  }

  const worktrees: Worktree[] = [];
  const lines = result.stdout.trim().split("\n");

  let current: Partial<Worktree> = {};

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        worktrees.push(current as Worktree);
      }
      current = {
        path: line.substring(9),
        isMain: false,
        name: basename(line.substring(9)),
      };
    } else if (line.startsWith("HEAD ")) {
      current.commit = line.substring(5);
    } else if (line.startsWith("branch ")) {
      const branch = line.substring(7);
      current.branch = branch.replace("refs/heads/", "");
    } else if (line === "bare") {
      current.isMain = true;
    }
  }

  // Don't forget the last entry
  if (current.path) {
    worktrees.push(current as Worktree);
  }

  // Mark the main worktree
  if (worktrees.length > 0) {
    worktrees[0].isMain = true;
  }

  return worktrees;
}

/**
 * Get git status for a worktree
 */
export async function getStatus(worktreePath: string): Promise<GitStatus> {
  // Get branch name
  const branchResult = await execGit(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    worktreePath
  );
  const branch = branchResult.stdout.trim();

  // Get ahead/behind counts
  let ahead = 0;
  let behind = 0;
  const trackingResult = await execGit(
    ["rev-list", "--left-right", "--count", `${branch}...@{upstream}`],
    worktreePath
  );
  if (trackingResult.code === 0) {
    const [aheadStr, behindStr] = trackingResult.stdout.trim().split("\t");
    ahead = parseInt(aheadStr, 10) || 0;
    behind = parseInt(behindStr, 10) || 0;
  }

  // Get status
  const statusResult = await execGit(
    ["status", "--porcelain=v1"],
    worktreePath
  );

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of statusResult.stdout.split("\n")) {
    if (!line) continue;
    const indexStatus = line[0];
    const workStatus = line[1];
    const file = line.substring(3);

    if (indexStatus === "?" && workStatus === "?") {
      untracked.push(file);
    } else {
      if (indexStatus !== " " && indexStatus !== "?") {
        staged.push(file);
      }
      if (workStatus !== " " && workStatus !== "?") {
        unstaged.push(file);
      }
    }
  }

  return { branch, ahead, behind, staged, unstaged, untracked };
}

/**
 * Get list of changed files compared to a base branch
 */
export async function getChangedFiles(
  worktreePath: string,
  baseBranch?: string
): Promise<ChangedFile[]> {
  const base = baseBranch || (await getDefaultBranch(worktreePath));

  const result = await execGit(
    ["diff", "--name-status", `${base}...HEAD`],
    worktreePath
  );

  if (result.code !== 0) {
    // Try without the tracking
    const altResult = await execGit(
      ["diff", "--name-status", base],
      worktreePath
    );
    if (altResult.code !== 0) {
      return [];
    }
    return parseChangedFiles(altResult.stdout);
  }

  return parseChangedFiles(result.stdout);
}

function parseChangedFiles(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];

  for (const line of output.split("\n")) {
    if (!line) continue;
    const [status, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");

    let fileStatus: ChangedFile["status"];
    switch (status[0]) {
      case "A":
        fileStatus = "added";
        break;
      case "D":
        fileStatus = "deleted";
        break;
      case "R":
        fileStatus = "renamed";
        break;
      default:
        fileStatus = "modified";
    }

    files.push({ path, status: fileStatus });
  }

  return files;
}

/**
 * Get full diff for a worktree compared to base branch
 */
export async function getDiff(
  worktreePath: string,
  baseBranch?: string
): Promise<string> {
  const base = baseBranch || (await getDefaultBranch(worktreePath));

  const result = await execGit(
    ["diff", "--color=never", `${base}...HEAD`],
    worktreePath
  );

  if (result.code !== 0) {
    const altResult = await execGit(
      ["diff", "--color=never", base],
      worktreePath
    );
    return altResult.stdout;
  }

  return result.stdout;
}

/**
 * Get diff for a specific file
 */
export async function getFileDiff(
  worktreePath: string,
  filePath: string,
  baseBranch?: string
): Promise<string> {
  const base = baseBranch || (await getDefaultBranch(worktreePath));

  const result = await execGit(
    ["diff", "--color=never", `${base}...HEAD`, "--", filePath],
    worktreePath
  );

  return result.stdout;
}

/**
 * Get recent commits for a worktree
 */
export async function getRecentCommits(
  worktreePath: string,
  count = 10
): Promise<Array<{ hash: string; message: string; author: string; date: string }>> {
  const result = await execGit(
    ["log", `-${count}`, "--format=%H|%s|%an|%ai"],
    worktreePath
  );

  if (result.code !== 0) return [];

  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, message, author, date] = line.split("|");
      return { hash, message, author, date };
    });
}

/**
 * Create a new worktree
 */
export async function createWorktree(
  repoPath: string,
  branch: string,
  path: string
): Promise<void> {
  const result = await execGit(
    ["worktree", "add", "-b", branch, path],
    repoPath
  );

  if (result.code !== 0) {
    throw new Error(`Failed to create worktree: ${result.stderr}`);
  }
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string
): Promise<void> {
  const result = await execGit(
    ["worktree", "remove", worktreePath],
    repoPath
  );

  if (result.code !== 0) {
    throw new Error(`Failed to remove worktree: ${result.stderr}`);
  }
}
