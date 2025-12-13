# AI Agents

Specialized AI agents for software engineering tasks, powered by the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).

## Agents

All agents use a **two-phase pattern** with task-based state tracking:
- **Session 1 (Initializer):** Analyzes inputs, creates a task list
- **Sessions 2+ (Worker):** Executes one task per session until complete

This enables crash recovery, incremental progress, and verification at each step.

| Agent | Description | Task File |
|-------|-------------|-----------|
| **bugfix** | Diagnose and fix bugs from error logs and stack traces | `bugfix_tasks.json` |
| **feature** | Add new functionality to existing codebases | `feature_tasks.json` |
| **refactor** | Improve code quality without changing behavior | `refactor_tasks.json` |
| **build** | Build complete applications from specifications with browser testing | `feature_list.json` |
| **migrate** | Migrate schemas across codebases (e.g., Zod to OpenAPI) | `migration_manifest.json` |
| **scaffold** | Scaffold new packages/projects from PRDs with reference support | `scaffold_tasks.json` |

## Installation

```bash
bun install
```

Requires:
- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/download) with an active subscription

## Quick Start

```bash
# Bug fixing
bun run src/cli.ts bugfix -p ./my-project -e "TypeError: Cannot read property 'x' of undefined"

# Feature implementation
bun run src/cli.ts feature -p ./my-project -s "Add dark mode toggle"

# Refactoring
bun run src/cli.ts refactor -p ./my-project -t "src/api/" --focus performance

# Build complete application
bun run src/cli.ts build -p ./new-app -f ./app-spec.md

# Schema migration
bun run src/cli.ts migrate -p ./migration -s src/schemas --swagger ./swagger.json

# Project scaffolding
bun run src/cli.ts scaffold -p ./packages/new-client -f ./prd.md -r ./packages/existing-client

# Resume or check status of any agent
bun run src/cli.ts resume -p ./my-project
bun run src/cli.ts status -p ./my-project
```

## Commands

### bugfix

Diagnose and fix bugs from error logs. Uses TDD approach: reproduce bug → write failing test → implement fix → verify.

```bash
# From error message
bun run src/cli.ts bugfix -p ./my-project -e "TypeError: Cannot read property 'x' of undefined"

# From error log file
bun run src/cli.ts bugfix -p ./my-project -f ./error.log

# Limit sessions
bun run src/cli.ts bugfix -p ./my-project -e "error" --max-sessions 5
```

**How it works:**
1. **Session 1:** Analyzes error, creates `bugfix_tasks.json` with diagnostic and fix steps
2. **Sessions 2+:** Executes one task per session (reproduce, identify cause, write test, fix, verify)

**Options:**
- `-p, --project <path>` - Project directory (required)
- `-e, --error <text>` - Error message or stack trace
- `-f, --error-file <path>` - Path to error log file
- `--max-sessions <n>` - Maximum sessions (default: unlimited)
- `-m, --model <name>` - Claude model (default: claude-sonnet-4-5)

### feature

Add new functionality to existing codebases. Uses TDD approach: write tests first → implement → verify.

```bash
# From description
bun run src/cli.ts feature -p ./my-project -s "Add user authentication with JWT"

# From spec file
bun run src/cli.ts feature -p ./my-project -f ./feature-spec.md
```

**How it works:**
1. **Session 1:** Analyzes spec and codebase, creates `feature_tasks.json` with implementation steps
2. **Sessions 2+:** Executes one task per session (analyze, design, implement, test, integrate)

**Options:**
- `-p, --project <path>` - Project directory (required)
- `-s, --spec <text>` - Feature specification text
- `-f, --spec-file <path>` - Path to specification file
- `--max-sessions <n>` - Maximum sessions (default: unlimited)
- `-m, --model <name>` - Claude model (default: claude-sonnet-4-5)

### refactor

Improve code quality without changing behavior.

```bash
# Refactor for performance
bun run src/cli.ts refactor -p ./my-project -t "src/api/" --focus performance

# Refactor for readability
bun run src/cli.ts refactor -p ./my-project -t "src/utils/" --focus readability
```

**How it works:**
1. **Session 1:** Analyzes target code, creates `refactor_tasks.json` with improvement tasks
2. **Sessions 2+:** Executes one refactoring task per session, verifying behavior is preserved

**Options:**
- `-p, --project <path>` - Project directory (required)
- `-t, --target <path>` - Target path/pattern to refactor
- `--focus <area>` - performance, readability, patterns, all (default: all)
- `--max-sessions <n>` - Maximum sessions (default: unlimited)
- `-m, --model <name>` - Claude model (default: claude-sonnet-4-5)

### build

Build complete applications from specifications.

```bash
# Start a new build
bun run src/cli.ts build -p ./new-app -f ./app-spec.md

# With custom feature count
bun run src/cli.ts build -p ./new-app -f ./spec.md --min-features 50 --max-features 100
```

**How it works:**
1. **Session 1 (Initializer):** Reads spec, creates `feature_list.json` with 100-200 test cases
2. **Session 2+ (Coder):** Implements one feature per session, verifies with browser testing
3. **Completion:** All features passing, creates PR

**Options:**
- `-p, --project <path>` - Project directory (required)
- `-s, --spec <text>` - Specification text
- `-f, --spec-file <path>` - Path to specification file
- `--min-features <n>` - Minimum features to generate (default: 100)
- `--max-features <n>` - Maximum features to generate (default: 200)
- `--max-sessions <n>` - Maximum sessions to run
- `-m, --model <name>` - Claude model (default: claude-sonnet-4-5)

### migrate

Migrate schemas across codebases with dependency-aware ordering.

```bash
# Migrate Zod schemas to OpenAPI types
bun run src/cli.ts migrate -p ./migration-state -s src/schemas --swagger ./swagger.json

# With target directory for reference
bun run src/cli.ts migrate -p ./migration -s src/schemas -t src/backend --type zod-to-openapi
```

**How it works:**
1. **Session 1 (Initializer):** Scans codebase, builds dependency graph, creates `migration_manifest.json`
2. **Session 2+ (Migrator):** Migrates one file per session, respects dependencies, verifies typecheck
3. **Completion:** All files migrated, creates PR

**Options:**
- `-p, --project <path>` - Project/state directory (required)
- `-s, --source <path>` - Source directory to scan (required)
- `-t, --target <path>` - Target directory for reference
- `--type <type>` - Migration type (default: zod-to-openapi)
- `--swagger <path>` - Path to OpenAPI/Swagger spec
- `--max-sessions <n>` - Maximum sessions to run
- `-m, --model <name>` - Claude model (default: claude-sonnet-4-5)

### scaffold

Scaffold new packages or projects from specifications.

```bash
# Scaffold from PRD with reference implementation
bun run src/cli.ts scaffold -p ./packages/new-api-client -f ./prd.md -r ./packages/existing-client

# With additional read paths (cross-repo access)
bun run src/cli.ts scaffold -p ./my-package -f ./spec.md --read-paths "/path/to/backend,/path/to/shared"

# With custom verification commands
bun run src/cli.ts scaffold -p ./my-package -f ./spec.md --verify "pnpm typecheck,pnpm build,pnpm test"
```

**How it works:**
1. **Session 1 (Initializer):** Reads spec, studies reference, creates `scaffold_tasks.json` with 15-30 tasks
2. **Session 2+ (Worker):** Executes one task per session, verifies with commands, commits progress
3. **Completion:** All tasks done, runs final verification, creates PR

**Options:**
- `-p, --project <path>` - Project directory (required)
- `-s, --spec <text>` - Specification text
- `-f, --spec-file <path>` - Path to specification file (e.g., PRD)
- `-r, --reference <path>` - Reference directory to copy patterns from
- `--read-paths <paths>` - Additional directories to read (comma-separated)
- `--verify <commands>` - Verification commands (default: pnpm typecheck,pnpm build)
- `--max-sessions <n>` - Maximum sessions to run
- `-m, --model <name>` - Claude model (default: claude-sonnet-4-5)

### resume

Resume any agent from saved state.

```bash
bun run src/cli.ts resume -p ./my-project
```

### status

Check progress of any agent task.

```bash
# Human-readable output
bun run src/cli.ts status -p ./my-project

# JSON output
bun run src/cli.ts status -p ./my-project --json
```

## Project Structure

```
ai-agents/
├── src/
│   ├── cli.ts                      # CLI entry point
│   ├── core/
│   │   ├── longrunning.ts          # Multi-session agent runner
│   │   ├── state.ts                # Persistent state management
│   │   ├── security.ts             # Command validation and security
│   │   ├── sandbox.ts              # OS-level sandbox configuration
│   │   ├── mcp.ts                  # MCP server configuration
│   │   ├── permissions.ts          # Tool permission controls
│   │   └── prompts.ts              # Prompt template loading
│   └── agents/
│       ├── bugfix/                 # Bug diagnosis and fixing
│       ├── feature/                # Feature implementation
│       ├── refactor/               # Code quality improvement
│       ├── builder/                # Complete app building
│       ├── migrator/               # Schema migration
│       └── scaffold/               # Package scaffolding
├── package.json
└── tsconfig.json
```

## State Files

All agents create state files in the project directory for crash recovery:

| File | Agent | Purpose |
|------|-------|---------|
| `.ai-agent-state.json` | All | Core state (type, session count, status) |
| `bugfix_tasks.json` | bugfix | Diagnostic and fix tasks |
| `feature_tasks.json` | feature | Feature implementation tasks |
| `refactor_tasks.json` | refactor | Refactoring improvement tasks |
| `feature_list.json` | build | Test cases with pass/fail status |
| `migration_manifest.json` | migrate | Files with migration status and dependencies |
| `scaffold_tasks.json` | scaffold | Scaffolding tasks with completion status |
| `claude-progress.txt` | All | Human-readable session notes |

## Customizing Prompts

Each agent loads prompts from markdown files in its `prompts/` directory. Prompts support templating:

- `{{ variable }}` - Variable substitution
- `{% if var == "value" %}...{% endif %}` - Conditionals

## Security

Agents use defense-in-depth security:

- OS-level sandbox via `.claude_settings.json`
- Bash command allowlist with proper shell parsing
- Blocks dangerous patterns (`rm -rf /`, fork bombs, etc.)
- Restricts `pkill`/`kill` to development processes
- Fine-grained tool permissions via SDK's `canUseTool`

## License

MIT
