# Plan Execution - Session {{ session_number }}

Execute the next task from the plan in {{ project_dir }}.

## Progress

**{{ completed_tasks }} of {{ total_tasks }} tasks completed ({{ percentage }}%)**

Remaining tasks: {{ remaining_tasks }}

{% if health_check_output %}
---

## ⚠️ Health Check Failed

The health check ran before this session and detected issues:

```
{{ health_check_output }}
```

**Action Required:** Review and fix these issues before proceeding with new work. The health check ensures the codebase is in a working state.
{% endif %}

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

{% if test_info_exists %}
---

## Pre-Written Tests (TDD - GREEN Phase)

The Test Subagent has written failing tests for this task. Your job is to make them pass.

**Test Command:** `{{ test_info_test_command }}`

**Current Status:** RED (failing)

**Failure Output:**
```
{{ test_info_failure_output }}
```

**Your Goal:** Implement the feature so that the tests pass (GREEN).
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

Review git history and progress notes to understand the current state. Your current task is shown above.

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

### 5. Commit Progress

```bash
git add -A
git commit -m "execute: {{ current_task_id }} - <brief description>"
```

### 6. Document in Progress File

Append to `claude-progress.txt`:
- What you implemented
- Key decisions made
- Any issues encountered
- Verification results

---

## Completion

When you have completed the current task:

1. Ensure verification passes (run the verification command if provided)
2. Commit your changes
3. Document your progress

The harness will automatically detect task completion and assign the next task.

---

## Important Reminders

- **One task per session** - Focus on completing the current task fully
- **Follow the plan** - The plan was designed intentionally; follow its approach
- **Verify before committing** - Always run verification to confirm your work
- **Leave code working** - Every session should end with a functional codebase
- **Document clearly** - Future sessions depend on your progress notes
- **Harness tracks progress** - You don't need to update task files; the harness detects completion
