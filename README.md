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

The mizu plugin bundles everything you need - no separate CLI installation required.

### Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/download) with an active subscription

### Plugin Installation

```bash
# In Claude Code, add the plugin marketplace
/plugin marketplace add /path/to/mizu/plugin

# Install the plugin
/plugin install mizu
```

On your first Claude Code session after installing, the plugin will:
1. Create a symlink to `~/.local/bin/mizu`
2. Add `~/.local/bin` to your PATH (for that session)

The plugin includes:
- **`/harness` skill** - Generate execution configs directly from plans
- **Bundled CLI** - The `mizu` command is included in the plugin
- **Status tools** - Check execution status via MCP tools

### Verify Installation

```bash
mizu --help
```

If `mizu` is not found, ensure `~/.local/bin` is in your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
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

Exit Claude Code and run:

```bash
mizu execute ./docs/plans/dark-mode.execution.json
```

Other commands:

```bash
# Resume if interrupted
mizu execute --resume ./docs/plans/dark-mode.execution.json

# Force restart
mizu execute --force ./docs/plans/dark-mode.execution.json

# Check progress
mizu status -p ./my-project
```

## Using the /harness Skill

The `/harness` skill converts Claude Code plans into mizu execution configs:

```
# Auto-detect recent plans
/harness

# Or specify a plan file
/harness ./docs/plans/my-feature.md
```

The skill will:
1. Extract tasks from the plan
2. Infer permissions based on plan content
3. Suggest verification commands for each task
4. Generate an execution config JSON file
5. Show you the command to run mizu

## Checking Execution Status

With the plugin installed, you can check mizu execution status using natural language in Claude Code:

```
User: "What's the mizu status for this project?"
User: "Show me the mizu tasks"
User: "What's the recent mizu progress?"
```

The plugin provides three MCP tools:
- **mizu_status** - Current execution status and progress
- **mizu_tasks** - Complete task list with status
- **mizu_progress** - Recent progress notes

These tools read state files without modifying them, so you can safely query status at any time.

## Commands

### execute

Execute a plan from an execution config file.

```bash
mizu execute <config.json>
mizu execute --resume <config.json>    # Resume interrupted execution
mizu execute --force <config.json>     # Force restart
mizu execute <config.json> -m claude-opus-4  # Override model
mizu execute <config.json> --max-sessions 10  # Limit sessions
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
mizu status -p ./my-project           # Human-readable output
mizu status -p ./my-project --json    # JSON output (for scripting)
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
├── plugin/                         # Claude Code plugin (recommended)
│   ├── .claude-plugin/             # Plugin manifest
│   ├── bin/mizu                    # Shell wrapper
│   ├── cli/                        # Bundled CLI source
│   ├── hooks/                      # SessionStart setup hook
│   ├── mcp-server/                 # Status checking MCP tools
│   ├── scripts/setup.sh            # PATH configuration
│   └── skills/harness/             # /harness skill
├── src/                            # CLI source (also in plugin/cli/)
│   ├── cli.ts                      # CLI entry point
│   ├── core/                       # Shared infrastructure
│   │   ├── longrunning.ts          # Multi-session execution runner
│   │   ├── state.ts                # Persistent state management
│   │   ├── security.ts             # Command validation
│   │   └── ...
│   └── agents/execute/             # Execute agent implementation
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
mizu execute ./docs/plans/auth-feature.execution.json
```

### Bug Fix

```bash
# In Claude Code:
User: "Fix TypeError in user profile component"
User: /harness

# In terminal:
mizu execute ./docs/plans/bugfix.execution.json
```

### Refactoring

```bash
# In Claude Code:
User: "Refactor API client for better error handling"
User: /harness

# In terminal:
mizu execute ./docs/plans/refactor.execution.json
```

## Development Setup

For contributors working on mizu itself:

```bash
# Clone and install dependencies
git clone https://github.com/anthropics/mizu.git
cd mizu
bun install

# Run directly
bun run src/cli.ts execute ./config.json

# Or link globally for development
bun link
mizu execute ./config.json

# Unlink when done
bun unlink mizu
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
