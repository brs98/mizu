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

0. **Baseline Testing (CRITICAL)**

   Before doing anything else, run the test suite to understand the current state:

   ```bash
   pnpm test
   # or: npm test
   ```

   Document which tests are currently failing in `claude-progress.txt`. This helps you know:
   - Whether the bug is caught by existing tests
   - What was already broken vs what you might break

1. **Analyze the Error**
   - Read the error message and stack trace carefully
   - Identify which files are involved
   - Understand what the error is telling you

2. **Explore the Codebase**
   - Read the files mentioned in the error
   - Check related files for context
   - Look for similar patterns in the codebase

3. **Create bugfix_tasks.json**
   Break down the bug fix into concrete, verifiable tasks using **Test-Driven Development (TDD)**:

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
    "description": "Write failing test that reproduces the bug (TDD: RED)",
    "status": "pending",
    "verificationCommand": "pnpm test || true",
    "notes": "Test SHOULD fail - it proves the bug exists and will prevent regression",
    "dependencies": ["bugfix-002"]
  },
  {
    "id": "bugfix-004",
    "description": "Implement the fix to make test pass (TDD: GREEN)",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["bugfix-003"]
  },
  {
    "id": "bugfix-005",
    "description": "Verify fix works and all tests pass",
    "status": "pending",
    "verificationCommand": "pnpm test && pnpm typecheck",
    "dependencies": ["bugfix-004"]
  }
]
```

### Test-Driven Bug Fixing

Follow the **Red-Green** cycle for bug fixes:

1. **RED**: Write a test that reproduces the bug. This test SHOULD fail - it proves the bug exists.
2. **GREEN**: Fix the bug so the test passes.

**Why write the test first?**
- Proves you understand the bug before fixing it
- Guarantees the bug won't regress
- The test documents exactly what was broken
- You know the fix works when the test turns green

**Verification Guidelines:** Every task that modifies code should have a `verificationCommand`. Use `pnpm typecheck` for type changes, `pnpm test` for behavior changes.

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
