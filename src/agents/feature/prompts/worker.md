# Feature Worker - Session {{ session_number }}

Continue implementing the feature in {{ project_dir }}.

## Progress
- Tasks: {{ completed_tasks }}/{{ total_tasks }} completed ({{ percentage }}%)
- Remaining: {{ remaining_tasks }}

## Feature Specification
{{ spec_text }}

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

3. **Read feature_tasks.json**
   Find the next pending task whose dependencies are all completed.

4. **Execute the Task**
   - Implement what the task describes
   - Follow existing codebase patterns
   - Write code that matches existing conventions

5. **Verify the Task**
   Run the task's verificationCommand:
```bash
# Example: pnpm test
```

### Verification Failure Protocol

If verification fails:

1. **Read the error output carefully**
   - Test failure: Read the failing assertion
   - Type error: Check the file/line and expected vs actual
   - Build error: Check for missing imports

2. **Diagnose the issue**
   - Did you introduce this error, or was it pre-existing?
   - Is this a logic error or a typo?

3. **Attempt a fix** (max 2 retries)
   - Make a targeted fix
   - Re-run verification

4. **If still failing after 2 attempts**
   - Mark the task as `"status": "blocked"` with `"notes": "[error summary]"`
   - Document in `claude-progress.txt`
   - Move to the next unblocked task

**Never mark a task as completed if verification fails.**

6. **Update feature_tasks.json**
   Mark the task as completed:
```json
{
  "id": "feature-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
```

7. **Commit Progress**
```bash
git add -A
git commit -m "feature: complete task-XXX - <description>"
```

8. **Update claude-progress.txt**
   Document what you did in this session.

## Completion

When ALL tasks are completed and verified:
- All tests should pass
- Say "Feature implementation complete" to indicate completion

Work on ONE task at a time. Leave the codebase in a working state.
