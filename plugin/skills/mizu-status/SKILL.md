---
name: mizu-status
description: Use when checking the status of an autonomous mizu plan execution - reads state files to show progress percentage, current task, completed tasks, and recent execution notes
---

# Mizu Status Skill

Check the status of a mizu plan execution by reading its state files.

## Files to Read

All files are in the `.mizu/` directory in the project where `mizu execute` was started:

| File | Contains |
|------|----------|
| `.mizu/state.json` | Initialization state, session count, completion summary |
| `.mizu/tasks.json` | Task list with status (pending/in_progress/completed/blocked) |
| `.mizu/progress.txt` | Execution log with timestamps |

## Quick Status Check

Read `.mizu/state.json` and `.mizu/tasks.json` together:

```json
// .mizu/state.json
{
  "initialized": true,
  "sessionCount": 5,
  "completionSummary": "Completed 3 of 5 tasks..."
}

// .mizu/tasks.json
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
tail -50 .mizu/progress.txt
```

## Reporting Status

When asked for status, report:
1. **Progress:** X% (Y of Z tasks completed)
2. **Current task:** What's being worked on
3. **Session count:** How many agent sessions have run
4. **Recent activity:** Last few lines from progress file (if relevant)
