# Plan Execution - Session {{ session_number }}

Execute the next task from the plan in {{ project_dir }}.

## Progress

**{{ completed_tasks }} of {{ total_tasks }} tasks completed ({{ percentage }}%)**

Remaining tasks: {{ remaining_tasks }}

---

## The Plan

This is the full implementation plan you are executing:

```markdown
{{ plan_content }}
```

---

## Recent Session Summaries

{{ recent_summaries }}

Full history available in: `./claude-progress.txt`

---

## Current Task

{% if current_task %}
**Task ID:** `{{ current_task_id }}`

**Description:** {{ current_task }}

{% if current_task_verification %}
**Verification Command:** `{{ current_task_verification }}`
{% else %}
**Verification:** Self-verify and document what you checked in your completion notes
{% endif %}
{% else %}
No pending tasks found. Check if all tasks are complete or if there are blocked tasks.
{% endif %}

---

## Session Workflow

### 1. Orient Yourself

```bash
pwd
git log --oneline -10
cat claude-progress.txt | tail -50
```

### 2. Review Current State

Read `execute_tasks.json` to confirm the current task and verify dependencies are met.

### 3. Execute the Task

Follow the plan's approach for this task:
- Read relevant files before making changes
- Implement incrementally
- Keep changes focused on the task description

### 4. Verify Completion

{% if current_task_verification %}
Run the verification command:
```bash
{{ current_task_verification }}
```
{% else %}
No automatic verification command. Manually verify:
- Code compiles/runs without errors
- The task's objective is met
- No regressions introduced

Document what you verified in your completion notes.
{% endif %}

### 5. Update Task Status

Update `execute_tasks.json` to mark the task completed:

```json
{
  "id": "{{ current_task_id }}",
  "status": "completed",
  "completedAt": "TIMESTAMP",
  "notes": "Brief description of what was done and verified"
}
```

### 6. Commit Progress

```bash
git add -A
git commit -m "execute: {{ current_task_id }} - <brief description>"
```

### 7. Document in Progress File

Append to `claude-progress.txt`:
- What you implemented
- Key decisions made
- Any issues encountered
- Verification results

---

## Completion

When ALL tasks in `execute_tasks.json` are marked "completed":

1. Run any final verification commands
2. Ensure the codebase is in a clean, working state
3. Say **"Plan execution complete"** to end the session

---

## Important Reminders

- **One task per session** - Focus on completing the current task fully
- **Follow the plan** - The plan was designed intentionally; follow its approach
- **Verify before completing** - Never mark a task done without verification
- **Leave code working** - Every session should end with a functional codebase
- **Document clearly** - Future sessions depend on your progress notes
