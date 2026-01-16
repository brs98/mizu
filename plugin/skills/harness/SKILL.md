---
name: harness
description: Use when you have a plan file from Claude Code plan mode and want to execute it autonomously - transforms plan markdown into execution config JSON for the mizu CLI with proper task extraction, permission inference, and verification commands
---

# /harness Skill

Transform a Claude Code plan into an execution config for `mizu execute`.

## Usage

```
/harness                                    # Auto-detect recent plans
/harness ./.mizu/plans/2024-01-15-feature.md # Specific plan file
```

## Workflow

### Step 1: Find the Plan

**With argument:** Use that file directly.

**Without argument:** Scan `.mizu/plans/` for `.md` files. If multiple, use AskUserQuestion to let user choose.

### Step 2: Extract Tasks

**Try structured parsing first.** Look for numbered lists under:
- `## Implementation Steps`
- `## Tasks`
- `## Plan`

Parse: `1. Do something` → task

**If no standard format:** Use AI to extract tasks, then confirm with user via AskUserQuestion.

### Step 3: Infer Permissions

Start with `dev` preset. Analyze plan for keywords:

| Keywords | Add to inferred |
|----------|-----------------|
| docker, container | `docker` |
| database, postgres, psql | `psql` |
| aws, s3 | `aws` |

Show inferred permissions to user for confirmation.

### Step 4: Infer Verification Commands

| Task Pattern | Verification |
|--------------|--------------|
| "add tests", "write tests" | `bun test` |
| "fix build", "update build" | `bun run build` |
| "typecheck", "create types", "add types", "schema" | `bun run typecheck` |
| "lint", "fix lint" | `bun run lint` |

Leave as `null` for ambiguous tasks (worker self-verifies).

### Step 4b: Set Dependencies

**Default:** Make tasks sequential (each depends on previous).
- `task-001`: no dependencies
- `task-002`: depends on `["task-001"]`
- `task-003`: depends on `["task-002"]`

**Exception:** If tasks are clearly independent (e.g., "update docs" and "add tests" for different modules), they can run in parallel with same dependencies.

### Step 5: Generate Config

**CRITICAL FORMAT REQUIREMENTS:**

```json
{
  "version": "1.0.0",
  "planFile": "./<filename>.md",
  "projectDir": "/absolute/path/to/project",
  "model": "claude-sonnet-4-5",
  "tasks": [
    {
      "id": "task-001",
      "description": "Task from plan",
      "status": "pending",
      "dependencies": [],
      "verificationCommand": "bun test"
    }
  ],
  "permissions": {
    "preset": "dev",
    "inferred": ["docker"],
    "allow": [],
    "deny": []
  },
  "context": {
    "completionSummary": "",
    "sessionCount": 0
  }
}
```

**Format rules:**
- `planFile`: **RELATIVE path** (e.g., `./feature.md`, NOT absolute)
- `projectDir`: **ABSOLUTE path**
- `model`: Use `claude-sonnet-4-5` (NOT date-based IDs)
- Task IDs: Zero-padded `task-001`, `task-002`, etc.
- Tasks have ONLY: `id`, `description`, `status`, `dependencies`, `verificationCommand`, `completedAt` (optional)
- `permissions.inferred`: Bash command names like `["docker", "psql"]`, NOT Claude tool names

Save config at: `.mizu/<plan-name>.execution.json` (sibling to state files)

### Step 6: Output Command

**Derive the plugin root from your base directory** (shown in the skill header). Remove the `/skills/harness` suffix to get the plugin root.

Example: If base directory is `/Users/x/.claude/plugins/cache/mizu/mizu/1.0.0/skills/harness`, then:
- Plugin root: `/Users/x/.claude/plugins/cache/mizu/mizu/1.0.0`
- Binary path: `<plugin-root>/bin/mizu`

**Check if binary exists.** If `<plugin-root>/bin/mizu` does not exist, include build instructions.

**Output format (binary exists):**
```
Execution config generated: ./.mizu/<name>.execution.json

To execute autonomously, exit Claude Code and run:

  <plugin-root>/bin/mizu execute ./.mizu/<name>.execution.json

Resume if interrupted:  <plugin-root>/bin/mizu execute --resume ./.mizu/<name>.execution.json
Start fresh:            <plugin-root>/bin/mizu execute --force ./.mizu/<name>.execution.json
```

**Output format (binary missing):**
```
Execution config generated: ./.mizu/<name>.execution.json

First, build the mizu CLI (one-time setup):

  cd <plugin-root> && bun install && bun run build

Then execute autonomously:

  <plugin-root>/bin/mizu execute ./.mizu/<name>.execution.json

Resume if interrupted:  <plugin-root>/bin/mizu execute --resume ./.mizu/<name>.execution.json
Start fresh:            <plugin-root>/bin/mizu execute --force ./.mizu/<name>.execution.json
```

Replace `<plugin-root>` with the actual absolute path derived from your base directory.

## Important

- Skill generates config and prints command - does NOT execute
- User must exit Claude Code and run the command in terminal
- This is because mizu needs different permissions than Claude Code provides
