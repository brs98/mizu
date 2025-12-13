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

2. **Read feature_tasks.json**
   Find the next pending task whose dependencies are all completed.

3. **Execute the Task**
   - Implement what the task describes
   - Follow existing codebase patterns
   - Write code that matches existing conventions

4. **Verify the Task**
   Run the task's verificationCommand (if provided):
```bash
# Example: pnpm test
```

5. **Update feature_tasks.json**
   Mark the task as completed:
```json
{
  "id": "feature-XXX",
  "status": "completed",
  "completedAt": "2024-01-15T10:30:00Z"
}
```

6. **Commit Progress**
```bash
git add -A
git commit -m "feature: complete task-XXX - <description>"
```

7. **Update claude-progress.txt**
   Document what you did in this session.

## Completion

When ALL tasks are completed and verified:
- All tests should pass
- Say "Feature implementation complete" to indicate completion

Work on ONE task at a time. Leave the codebase in a working state.
