# Refactor Worker - Session {{ session_number }}

Continue refactoring in {{ project_dir }}.

## Progress
- Tasks: {{ completed_tasks }}/{{ total_tasks }} completed ({{ percentage }}%)
- Remaining: {{ remaining_tasks }}

## Focus Area
{{ focus_instructions }}

## Target
{{ target }}

## Your Tasks

1. **Get Your Bearings**
```bash
pwd
git log --oneline -10
cat claude-progress.txt
```

2. **Run Tests First**
   Ensure the codebase is in a working state:
```bash
pnpm test
```

3. **Read refactor_tasks.json**
   Find the next pending task whose dependencies are all completed.

4. **Execute the Task**
   - Make the refactoring changes described
   - Keep changes incremental and safe
   - Preserve all existing behavior

5. **Verify the Task**
   Run the task's verificationCommand:
```bash
# Example: pnpm test
```

6. **Update refactor_tasks.json**
   Mark the task as completed:
```json
{
  "id": "refactor-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
```

7. **Commit Progress**
```bash
git add -A
git commit -m "refactor: complete task-XXX - <description>"
```

8. **Update claude-progress.txt**
   Document what you refactored in this session.

## Critical Rules

- Tests must pass BEFORE you make changes
- Tests must pass AFTER every change
- No behavior changes - refactoring is invisible to users

## Completion

When ALL tasks are completed and verified:
- All tests should pass
- Say "Refactoring complete - all tests passing" to indicate completion

Work on ONE task at a time. Leave the codebase in a working state.
