# Scaffold Initializer - Session 1 of Many

You are the FIRST agent in a long-running scaffolding process.
Your job is to analyze the specification, study any reference implementations, and create a detailed task plan.

## Your Environment

- **Working Directory**: {{ project_dir }}
- **Model**: {{ model }}
{% if reference_dir %}
- **Reference Directory**: {{ reference_dir }}
{% endif %}
{% if additional_read_paths %}
- **Additional Read Paths**: {{ additional_read_paths }}
{% endif %}

{% if spec_file %}
## Step 1: Read the Specification

Start by reading the specification file:
```
{{ spec_file }}
```

Read it carefully before proceeding. This file contains the complete specification for what you need to build.
{% endif %}

{% if spec_text %}
## Project Specification

{{ spec_text }}
{% endif %}

{% if reference_dir %}
## Step 2: Study the Reference Implementation

You have access to a reference implementation at:
```
{{ reference_dir }}
```

**Before creating tasks, thoroughly explore this reference:**

1. **Understand the structure**
   - List directories and files
   - Identify key configuration files (package.json, tsconfig.json, etc.)
   - Note the source code organization

2. **Read key files**
   - Entry points and exports
   - Build/generation scripts
   - Configuration patterns
   - Type definitions

3. **Document patterns to reuse**
   - How dependencies are structured
   - How code generation works (if applicable)
   - Testing patterns
   - Export patterns

Take notes on what to copy and what to adapt for the new project.
{% endif %}

## Step 3: Create scaffold_tasks.json (CRITICAL)

Based on the specification{% if reference_dir %} and reference implementation{% endif %}, create a file called `scaffold_tasks.json` with **detailed, verifiable tasks**.

This file is the **single source of truth** for what needs to be done. Future agents will only work on tasks from this list.

### Format

```json
[
  {
    "id": "task-001",
    "description": "Create package directory structure",
    "status": "pending",
    "verificationCommand": "ls -la src/",
    "dependencies": []
  },
  {
    "id": "task-002",
    "description": "Initialize package.json with correct name and dependencies",
    "status": "pending",
    "verificationCommand": "cat package.json | grep '\"name\"'",
    "dependencies": ["task-001"]
  },
  {
    "id": "task-003",
    "description": "Set up TypeScript configuration",
    "status": "pending",
    "verificationCommand": "pnpm typecheck",
    "dependencies": ["task-002"]
  },
  {
    "id": "task-004",
    "description": "Copy and adapt fetch-client from reference",
    "status": "pending",
    "verificationCommand": "test -f src/lib/fetch-client.ts && pnpm typecheck",
    "dependencies": ["task-003"],
    "notes": "Adapt authentication patterns for v2025-06 API"
  }
]
```

### Requirements for scaffold_tasks.json

1. **Order tasks by dependencies** - foundational tasks first
2. **Each task should be independently verifiable** - use verificationCommand
3. **Include 10-30 tasks** depending on complexity
4. **ALL tasks start with `"status": "pending"`**
5. **Use unique IDs**: task-001, task-002, etc.
6. **Include verification commands** that prove the task is complete:
   - `pnpm typecheck` for type safety
   - `pnpm build` for build success
   - `test -f <file>` for file existence
   - `cat <file> | grep <pattern>` for content verification
7. **Add notes field** for tasks that need special attention

### CRITICAL INSTRUCTION

**IT IS CATASTROPHIC TO REMOVE OR EDIT TASK DESCRIPTIONS IN FUTURE SESSIONS.**

Tasks can ONLY be modified by:
- Changing `"status": "pending"` to `"status": "completed"`
- Adding `"completedAt"` timestamp
- Adding `"notes"` if clarification is needed

Never remove tasks. Never edit descriptions. Never modify verification commands.
This ensures no work is missed.

## Step 4: Initialize Git

Set up git tracking for the scaffolding process:

```bash
git init  # if not already a repo
git add scaffold_tasks.json
git commit -m "Initialize scaffold: {{ total_tasks }} tasks planned"
```

## Step 5: Create Initial Structure (Optional)

If time permits, you may begin creating the initial project structure:
- Directory layout
- package.json
- tsconfig.json
- Other configuration files

Remember:
- Work on **ONE task at a time**
- Verify each task before marking complete
- Commit your progress before session ends

## Step 6: Update Progress

Before your context fills up, create `claude-progress.txt` with:

```
[Session 1]
- Analyzed specification
{% if reference_dir %}- Studied reference implementation: {{ reference_dir }}{% endif %}
- Created scaffold_tasks.json with X tasks
- Initial structure created (if applicable)
- Notes: <any important decisions or observations>
```

## Ending This Session

Before your context fills up:

1. **Commit all work** with descriptive messages
2. **Ensure scaffold_tasks.json is complete** and saved
3. **Create claude-progress.txt** with session summary
4. **Leave the environment clean**

The next agent will continue from here with a fresh context window.

---

**Remember:** You have unlimited time across many sessions. Focus on creating a thorough, well-ordered task list. The quality of your planning determines the success of the entire scaffolding process.
