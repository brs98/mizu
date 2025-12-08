# AI Agents

Specialized AI agents for software engineering tasks, powered by the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk).

## Agents

| Agent | Description |
|-------|-------------|
| **bugfix** | Diagnose and fix bugs from error logs and stack traces |
| **feature** | Add new functionality to existing codebases |
| **refactor** | Improve code quality without changing behavior |

## Installation

```bash
bun install
```

Requires:
- [Bun](https://bun.sh) runtime
- `ANTHROPIC_API_KEY` environment variable

## Usage

```bash
# Bug fix from error message
bun run src/cli.ts bugfix -p ./my-project -e "TypeError: Cannot read property 'x' of undefined"

# Bug fix from error log file
bun run src/cli.ts bugfix -p ./my-project -f ./error.log

# Add a feature
bun run src/cli.ts feature -p ./my-project -s "Add user authentication with JWT"

# Add a feature from spec file
bun run src/cli.ts feature -p ./my-project -f ./feature-spec.md

# Refactor for performance
bun run src/cli.ts refactor -p ./my-project -t "src/api/" --focus performance

# Refactor for readability
bun run src/cli.ts refactor -p ./my-project -t "src/utils/" --focus readability
```

### NPM Scripts

```bash
bun run bugfix -- -p ./project -e "error message"
bun run feature -- -p ./project -s "feature description"
bun run refactor -- -p ./project -t "src/"
```

## Depth Levels

Control how thorough agents are with the `--depth` flag:

| Level | Budget | Behavior |
|-------|--------|----------|
| `quick` | $0.50 | Fast, minimal analysis. Trust user's diagnosis. |
| `standard` | $2.00 | Balanced exploration and implementation. **(default)** |
| `thorough` | $10.00 | Comprehensive analysis, extensive testing. |

```bash
# Quick fix - trust the error, minimal exploration
bun run src/cli.ts bugfix -p ./project -e "error" -d quick

# Thorough investigation - full analysis
bun run src/cli.ts bugfix -p ./project -f ./error.log -d thorough
```

## Commands Reference

### bugfix

```
Usage: ai-agent bugfix [options]

Diagnose and fix bugs from error logs

Options:
  -p, --project <path>      Project directory to work in (required)
  -e, --error <text>        Error message or stack trace to fix
  -f, --error-file <path>   Path to file containing error log
  -d, --depth <level>       How thorough: quick, standard, thorough (default: "standard")
  -m, --model <name>        Claude model to use (default: "claude-sonnet-4-5")
```

### feature

```
Usage: ai-agent feature [options]

Add new features to existing code

Options:
  -p, --project <path>      Project directory to work in (required)
  -s, --spec <text>         Feature specification text
  -f, --spec-file <path>    Path to feature specification file
  -d, --depth <level>       How thorough: quick, standard, thorough (default: "standard")
  -m, --model <name>        Claude model to use (default: "claude-sonnet-4-5")
```

### refactor

```
Usage: ai-agent refactor [options]

Improve code quality without changing behavior

Options:
  -p, --project <path>      Project directory to work in (required)
  -t, --target <path>       Target path/pattern to refactor (e.g., "src/legacy/")
  --focus <area>            Focus: performance, readability, patterns, all (default: "all")
  -d, --depth <level>       How thorough: quick, standard, thorough (default: "standard")
  -m, --model <name>        Claude model to use (default: "claude-sonnet-4-5")
```

## Project Structure

```
ai-agents/
├── src/
│   ├── cli.ts                      # CLI entry point
│   ├── core/
│   │   ├── depth.ts                # Depth levels and budget configs
│   │   ├── permissions.ts          # Security controls for tool usage
│   │   └── prompts.ts              # Prompt template loading
│   └── agents/
│       ├── bugfix/
│       │   ├── agent.ts
│       │   └── prompts/
│       ├── feature/
│       │   ├── agent.ts
│       │   └── prompts/
│       └── refactor/
│           ├── agent.ts
│           └── prompts/
├── package.json
└── tsconfig.json
```

## Customizing Prompts

Each agent loads prompts from markdown files in its `prompts/` directory. You can customize agent behavior by editing these files.

Prompts support simple templating:
- `{{ variable }}` - Variable substitution
- `{% if var == "value" %}...{% endif %}` - Conditionals

Available variables:
- `depth_level` - quick, standard, or thorough
- `analysis_scope` - targeted, moderate, or comprehensive
- `verification_level` - basic, standard, or extensive
- Agent-specific variables (error_input, spec, target, focus, etc.)

## Security

Agents use a permission system that:
- Validates all bash commands against an allowlist
- Blocks dangerous patterns (`rm -rf`, etc.)
- Restricts process killing to development processes
- Uses the SDK's `canUseTool` callback for fine-grained control

## License

MIT
