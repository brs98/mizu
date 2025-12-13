# Bug Fix Initializer - Session 1

You are setting up a bug fix task in {{ project_dir }}.

## Error to Fix

```
{{ error_input }}
```

{% if error_file %}
Error file: {{ error_file }}
{% endif %}

## Your Tasks

1. **Analyze the Error**
   - Read the error message and stack trace carefully
   - Identify which files are involved
   - Understand what the error is telling you

2. **Explore the Codebase**
   - Read the files mentioned in the error
   - Check related files for context
   - Look for similar patterns in the codebase

3. **Create bugfix_tasks.json**
   Break down the bug fix into concrete, verifiable tasks:

```json
[
  {
    "id": "bugfix-001",
    "description": "Reproduce and understand the bug",
    "status": "pending",
    "dependencies": []
  },
  {
    "id": "bugfix-002",
    "description": "Identify root cause by tracing through relevant code",
    "status": "pending",
    "dependencies": ["bugfix-001"]
  },
  {
    "id": "bugfix-003",
    "description": "Implement the fix for the root cause",
    "status": "pending",
    "dependencies": ["bugfix-002"]
  },
  {
    "id": "bugfix-004",
    "description": "Write regression test to prevent bug from recurring",
    "status": "pending",
    "dependencies": ["bugfix-003"]
  },
  {
    "id": "bugfix-005",
    "description": "Verify fix works and all tests pass",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["bugfix-004"]
  }
]
```

4. **Initialize Git Tracking** (if not already a repo)
```bash
git init  # if not already a repo
git add bugfix_tasks.json
git commit -m "Initialize bugfix tasks"
```

5. **Create claude-progress.txt**
   Document your initial analysis and planned approach.

## Task Guidelines

- Each task should be independently verifiable
- Use verificationCommand when possible (shell command that succeeds = task works)
- Order tasks by dependencies
- Keep the task list focused (typically 3-7 tasks for a bug fix)
- All tasks start with "status": "pending"

When done, the next session will begin executing tasks one by one.
