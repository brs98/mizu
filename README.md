# Mizu - Execute Agent for Plan Execution

Task execution agent powered by the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).

## Overview

Mizu executes implementation plans created in Claude Code's plan mode. The workflow:

1. **Create plan in Claude Code plan mode** - Analyze the task and design implementation steps
2. **Run `/harness` skill** - Generate execution config with tasks and permissions
3. **Run `mizu execute`** - Execute the plan task by task with state persistence

This enables:
- **Crash recovery** - Resume from any point
- **Task-based tracking** - One task per session with verification
- **Incremental progress** - See exactly what's done and what's next
- **Git integration** - Track changes across sessions

## Installation

```bash
bun install
```

Requires:
- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/download) with an active subscription

### Global Installation

To make the `mizu` command available globally:

```bash
# From the project directory
bun link
```

After linking, you can run mizu from anywhere:

```bash
# Instead of: bun run src/cli.ts execute ./config.json
mizu execute ./config.json

# Check status
mizu status -p ./my-project

# Get help
mizu --help
```

To unlink:

```bash
bun unlink mizu
```

## Quick Start

### 1. Create a Plan in Claude Code

Use Claude Code's plan mode to analyze your task and create a detailed implementation plan:

```
User: "Add dark mode support to the app"
Claude: [Creates detailed plan with steps]
```

### 2. Generate Execution Config

Run the `/harness` skill in Claude Code to convert the plan to an execution config:

```
User: /harness
Claude: [Generates execution config JSON file]
```

This creates a file like `docs/plans/dark-mode.execution.json` with:
- Task list with dependencies
- Permission settings
- Verification commands

### 3. Execute the Plan

```bash
# Start execution (if mizu is linked globally)
mizu execute ./docs/plans/dark-mode.execution.json

# Or run directly with bun
bun run src/cli.ts execute ./docs/plans/dark-mode.execution.json

# Resume if interrupted
mizu execute --resume ./docs/plans/dark-mode.execution.json

# Force restart
mizu execute --force ./docs/plans/dark-mode.execution.json

# Check progress
mizu status -p ./my-project
```

## Commands

### execute

Execute a plan from an execution config file.

```bash
# Execute plan
bun run src/cli.ts execute <config.json>

# Resume interrupted execution
bun run src/cli.ts execute --resume <config.json>

# Force restart (overwrite existing state)
bun run src/cli.ts execute --force <config.json>

# Override model
bun run src/cli.ts execute <config.json> -m claude-opus-4

# Limit sessions
bun run src/cli.ts execute <config.json> --max-sessions 10
```

**How it works:**
1. **Session 1:** Loads config, initializes state, begins first task
2. **Sessions 2+:** Executes one task per session, verifies completion, moves to next
3. **Completion:** All tasks done, final verification runs

**Options:**
- `--resume` - Resume interrupted execution
- `--force` - Force restart, overwriting existing state
- `-m, --model <name>` - Claude model (overrides config)
- `--max-sessions <n>` - Maximum sessions to run

### status

Check progress of plan execution.

```bash
# Human-readable output
bun run src/cli.ts status -p ./my-project

# JSON output (for scripting)
bun run src/cli.ts status -p ./my-project --json
```

Shows:
- Current task
- Tasks completed
- Session count
- Recent progress notes

## Execution Config Format

The `/harness` skill generates execution configs. Example structure:

```json
{
  "version": "1.0",
  "planFile": "./docs/plans/feature.plan.md",
  "projectDir": "./my-project",
  "model": "claude-sonnet-4-5",
  "tasks": [
    {
      "id": "task-001",
      "description": "Update component with dark mode support",
      "status": "pending",
      "dependencies": [],
      "verificationCommand": "npm test"
    }
  ],
  "permissions": {
    "preset": "dev",
    "allow": [],
    "deny": []
  }
}
```

## State Files

Execution creates state files in the project directory:

| File | Purpose |
|------|---------|
| `.ai-agent-state.json` | Core state (type, session count, status) |
| `execute_tasks.json` | Task list with completion status |
| `claude-progress.txt` | Human-readable session notes |

## Project Structure

```
mizu/
├── src/
│   ├── cli.ts                      # CLI entry point
│   ├── core/
│   │   ├── longrunning.ts          # Multi-session execution runner
│   │   ├── state.ts                # Persistent state management
│   │   ├── security.ts             # Command validation
│   │   ├── sandbox.ts              # OS-level sandbox configuration
│   │   ├── mcp.ts                  # MCP server configuration
│   │   ├── permissions.ts          # Tool permission controls
│   │   └── prompts.ts              # Prompt template loading
│   └── agents/
│       └── execute/                # Execute agent implementation
├── package.json
└── tsconfig.json
```

## Security

Defense-in-depth security model:

- **OS-level sandbox** via `.claude_settings.json`
- **Command allowlist** - Only approved bash commands
- **Dangerous pattern blocking** - Prevents `rm -rf /`, fork bombs, etc.
- **Process restrictions** - `pkill`/`kill` limited to dev processes
- **Fine-grained permissions** - Via SDK's `canUseTool` callback

Permission presets:
- `readonly` - Read-only operations
- `dev` - Full development commands (default)
- `full` - All commands (use with caution)

## Examples

### Feature Implementation

```bash
# In Claude Code:
User: "Add user authentication with JWT"
User: /harness

# In terminal:
bun run src/cli.ts execute ./docs/plans/auth-feature.execution.json
```

### Bug Fix

```bash
# In Claude Code:
User: "Fix TypeError in user profile component"
User: /harness

# In terminal:
bun run src/cli.ts execute ./docs/plans/bugfix.execution.json
```

### Refactoring

```bash
# In Claude Code:
User: "Refactor API client for better error handling"
User: /harness

# In terminal:
bun run src/cli.ts execute ./docs/plans/refactor.execution.json
```

## Customizing Prompts

The execute agent loads prompts from `src/agents/execute/prompts/`. Prompts support Jinja2-like templating:

- `{{ variable }}` - Variable substitution
- `{% if condition %}...{% endif %}` - Conditionals
- `{% for item in items %}...{% endfor %}` - Loops

## Workflow Tips

1. **Start with detailed plans** - Better plans = better execution
2. **Use verification commands** - Catch issues early
3. **Check status frequently** - Monitor progress between sessions
4. **Resume on interruption** - State persistence handles crashes
5. **Review progress notes** - `claude-progress.txt` tracks all changes

## License

MIT
