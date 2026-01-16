---
name: mizu-status
description: Use when checking the status of an autonomous mizu plan execution - reads state files to show progress percentage, current task, completed tasks, and recent execution notes
---

# Mizu Status Skill

Check the status of a mizu plan execution by reading its state files.

## Directory Structure

Each plan has its own directory within `.mizu/`:

```
.mizu/
└── <plan-name>/           # e.g., squishy-prancing-mango/
    ├── plan.md            # Copy of the original plan
    ├── execution.json     # Execution config
    ├── state.json         # Execution state
    ├── tasks.json         # Task list
    └── progress.txt       # Progress log
```

## Finding Plans

**To list all plan directories:**
```bash
ls -la .mizu/
```

**If user specifies a plan name:** Use `.mizu/<plan-name>/`

**If multiple plans exist:** Use AskUserQuestion to let user choose which plan to check.

## Files to Read

All files are in the plan directory `.mizu/<plan-name>/`:

| File | Contains |
|------|----------|
| `state.json` | Initialization state, session count, plan name |
| `tasks.json` | Task list with status (pending/in_progress/completed/blocked) |
| `progress.txt` | Execution log with timestamps |

## Quick Status Check

Read `state.json` and `tasks.json` together:

```json
// .mizu/<plan-name>/state.json
{
  "planName": "squishy-prancing-mango",
  "initialized": true,
  "sessionCount": 5,
  "completedTasks": 3,
  "totalTasks": 5
}

// .mizu/<plan-name>/tasks.json
[
  {"id": "task-001", "description": "...", "status": "completed", "completedAt": "..."},
  {"id": "task-002", "description": "...", "status": "in_progress"},
  {"id": "task-003", "description": "...", "status": "pending"}
]
```

**Calculate progress:** `(completed tasks / total tasks) * 100`

**Current task:** First task with `status: "in_progress"`, or first `"pending"` if none in progress.

## Recent Progress Notes

Use Bash to get recent execution notes:

```bash
tail -50 .mizu/<plan-name>/progress.txt
```

## Reporting Status

When asked for status, report:
1. **Plan:** Name of the plan being executed
2. **Progress:** X% (Y of Z tasks completed)
3. **Current task:** What's being worked on
4. **Session count:** How many agent sessions have run
5. **Recent activity:** Last few lines from progress file (if relevant)
