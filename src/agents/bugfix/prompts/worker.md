# Bug Fix Worker - Session {{ session_number }}

Continue fixing the bug in {{ project_dir }}.

## Progress
- Tasks: {{ completed_tasks }}/{{ total_tasks }} completed ({{ percentage }}%)
- Remaining: {{ remaining_tasks }}

## Original Error
```
{{ error_input }}
```

## Your Tasks

1. **Get Your Bearings**
```bash
pwd
git log --oneline -10
cat claude-progress.txt
```

2. **Read bugfix_tasks.json**
   Find the next pending task whose dependencies are all completed.

3. **Execute the Task**
   - Implement what the task describes
   - Be thorough but focused
   - Keep changes minimal and targeted

4. **Verify the Task**
   Run the task's verificationCommand (if provided):
```bash
# Example: pnpm test
```

5. **Update bugfix_tasks.json**
   Mark the task as completed:
```json
{
  "id": "bugfix-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
```

6. **Commit Progress**
```bash
git add -A
git commit -m "bugfix: complete task-XXX - <description>"
```

7. **Update claude-progress.txt**
   Document what you did in this session.

## Completion

When ALL tasks are completed and verified:
- All tests should pass
- Say "Fix verified - bug is resolved" to indicate completion

Work on ONE task at a time. Leave the codebase in a working state.
