---
name: harness
description: Use when you have a plan file from Claude Code plan mode and want to execute it autonomously - transforms plan markdown into execution config JSON for the mizu CLI with proper task extraction, permission inference, and verification commands
---

# /harness Skill

Transform a Claude Code plan into an execution config for `mizu execute`.

## Usage

```
/harness                                                    # Auto-detect recent Claude Code plans
/harness ~/.claude/plans/squishy-prancing-mango.md          # Specific plan file
```

## Output Structure

All execution artifacts are stored in a plan-scoped directory:

```
.mizu/
└── <plan-name>/           # e.g., squishy-prancing-mango/
    ├── plan.md            # Copy of the original Claude Code plan
    ├── execution.json     # Execution config (references ./plan.md)
    ├── state.json         # Created by mizu execute
    ├── tasks.json         # Created by mizu execute
    └── progress.txt       # Created by mizu execute
```

This structure enables running multiple plans without conflicts.

## Workflow

### Step 1: Find the Plan

**With argument:** Use that file directly.

**Without argument:** Scan `~/.claude/plans/` for recent `.md` files. If multiple, use AskUserQuestion to let user choose.

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

**CRITICAL: Create plan directory and copy plan file first:**

1. **Derive plan name** from the source plan filename (without `.md` extension)
   - e.g., `~/.claude/plans/squishy-prancing-mango.md` → plan name: `squishy-prancing-mango`

2. **Create plan directory:** `.mizu/<plan-name>/`
   ```bash
   mkdir -p .mizu/<plan-name>
   ```

3. **Copy plan to plan directory:**
   ```bash
   cp <source-plan-path> .mizu/<plan-name>/plan.md
   ```

4. **Generate execution.json** in the same directory:

```json
{
  "version": "1.0.0",
  "planFile": "./plan.md",
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
- `planFile`: Always `"./plan.md"` (plan is copied to same directory as execution.json)
- `projectDir`: **ABSOLUTE path** to the project root
- `model`: Use `claude-sonnet-4-5` (NOT date-based IDs)
- Task IDs: Zero-padded `task-001`, `task-002`, etc.
- Tasks have ONLY: `id`, `description`, `status`, `dependencies`, `verificationCommand`, `completedAt` (optional)
- `permissions.inferred`: Bash command names like `["docker", "psql"]`, NOT Claude tool names

**Save locations:**
- Plan copy: `.mizu/<plan-name>/plan.md`
- Config: `.mizu/<plan-name>/execution.json`

### Step 6: Output Command

**Derive the plugin root from your base directory** (shown in the skill header). Remove the `/skills/harness` suffix to get the plugin root.

Example: If base directory is `/Users/x/.claude/plugins/cache/mizu/mizu/1.0.0/skills/harness`, then:
- Plugin root: `/Users/x/.claude/plugins/cache/mizu/mizu/1.0.0`
- CLI path: `<plugin-root>/cli/src/mizu.ts`

**MANDATORY: Check if dependencies are installed using Bash:**
```bash
test -d <plugin-root>/cli/node_modules && echo "installed" || echo "missing"
```

You MUST run this check. Do not assume dependencies are installed.

**If dependencies installed**, output:
```
Plan directory created: .mizu/<plan-name>/
- plan.md: Copy of source plan
- execution.json: Execution config

To execute autonomously, exit Claude Code and run:

  bun run <plugin-root>/cli/src/mizu.ts execute ./.mizu/<plan-name>/execution.json

Resume if interrupted:  bun run <plugin-root>/cli/src/mizu.ts execute --resume ./.mizu/<plan-name>/execution.json
Start fresh:            bun run <plugin-root>/cli/src/mizu.ts execute --force ./.mizu/<plan-name>/execution.json
```

**If dependencies missing**, output:
```
Plan directory created: .mizu/<plan-name>/
- plan.md: Copy of source plan
- execution.json: Execution config

First, install dependencies (one-time setup):

  cd <plugin-root>/cli && bun install

Then execute autonomously:

  bun run <plugin-root>/cli/src/mizu.ts execute ./.mizu/<plan-name>/execution.json

Resume if interrupted:  bun run <plugin-root>/cli/src/mizu.ts execute --resume ./.mizu/<plan-name>/execution.json
Start fresh:            bun run <plugin-root>/cli/src/mizu.ts execute --force ./.mizu/<plan-name>/execution.json
```

Replace `<plugin-root>` with the actual absolute path and `<plan-name>` with the actual plan name.

## Important

- Skill generates config and prints command - does NOT execute
- User must exit Claude Code and run the command in terminal
- This is because mizu needs different permissions than Claude Code provides
- Each plan gets its own directory, so multiple plans can run without conflicts
