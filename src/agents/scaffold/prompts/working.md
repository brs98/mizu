# Scaffold Worker - Continuing Development

You are continuing work on a scaffolding project. This is a **fresh context window** - you have no memory of previous sessions.

## Your Environment

- **Working Directory**: {{ project_dir }}
- **Model**: {{ model }}
- **Session**: {{ session_number }}
{% if reference_dir %}
- **Reference Directory**: {{ reference_dir }}
{% endif %}
{% if additional_read_paths %}
- **Additional Read Paths**: {{ additional_read_paths }}
{% endif %}

## Step 1: Get Your Bearings

Start every session by understanding the current state:

```bash
# 1. Confirm your working directory
pwd

# 2. Check recent git history
git log --oneline -20

# 3. See what files exist
ls -la
```

Then read the key files:
- `claude-progress.txt` - What previous agents accomplished
- `scaffold_tasks.json` - The source of truth for what needs to be done

## Step 2: Verify the Environment Works

**Before implementing anything new**, verify the project is in a working state:

```bash
# Run tests (if available)
pnpm test || echo "No test script yet"

# Check TypeScript errors
pnpm typecheck || echo "No typecheck script yet"
```

If something is broken, **fix it first** before adding new tasks.

## Step 3: Choose ONE Task to Execute

From `scaffold_tasks.json`, find the **highest-priority task** that:
- Has `"status": "pending"`
- Has all its dependencies already completed

Work on **only ONE task** per iteration. This ensures:
- Clean, reviewable commits
- The environment stays stable
- Progress is tracked accurately

## Step 4: Execute the Task

{% if reference_dir %}
### If the Task Involves Copying from Reference

1. **Read the reference implementation first:**
   ```bash
   cat {{ reference_dir }}/<relevant-file>
   ```

2. **Understand the patterns** before copying:
   - What does this code do?
   - What needs to be adapted for the new context?
   - Are there hardcoded values that need changing?

3. **Adapt, don't blindly copy:**
   - Update import paths
   - Change namespace/module names
   - Adjust types for the new API
   - Update configuration values

{% endif %}

### Implementation Guidelines

- Follow existing patterns in the codebase
- Keep changes focused on the current task
- Don't refactor unrelated code
- Don't add features not in the task description

## Step 5: Verify the Task

Run the task's `verificationCommand` to confirm it works:

```bash
# Example verification commands:
pnpm typecheck           # Types are correct
pnpm build              # Build succeeds
test -f <file>          # File exists
cat <file> | grep <pat> # Content is correct
```

**Only mark a task as completed after verification passes.**

### Verification Failure Protocol

If verification fails:

1. **Read the error output carefully**
   - Type error: Check the file/line and expected vs actual
   - Build error: Check for missing imports or configuration
   - File check failed: Verify the file was created in the right location

2. **Diagnose the issue**
   - Did you introduce this error, or was it pre-existing?
   - Is this a typo or a logic error?

3. **Attempt a fix** (max 2 retries)
   - Make a targeted fix
   - Re-run the verification command

4. **If still failing after 2 attempts**
   - Mark the task as `"status": "blocked"` with `"notes": "[error summary]"`
   - Document in `claude-progress.txt`
   - Move to the next unblocked task

**Never mark a task as completed if verification fails.**

## Step 6: Update scaffold_tasks.json

After verification, update the task entry:

```json
{
  "id": "task-XXX",
  "description": "...",
  "status": "completed",
  "verificationCommand": "...",
  "dependencies": [...],
  "completedAt": "2024-01-15T10:30:00Z"
}
```

**CRITICAL RULES:**
- Only change `status` from `"pending"` to `"completed"`
- Add `completedAt` with current timestamp
- If verification fails, add `"notes"` explaining the issue
- **NEVER remove tasks**
- **NEVER edit descriptions or verification commands**

## Step 7: Commit Your Progress

Make a descriptive commit:

```bash
git add -A
git commit -m "scaffold(task-XXX): <brief description>

- <what you did>
- <verification result>

Completes: task-XXX"
```

## Step 8: Update Progress File

Append to `claude-progress.txt`:

```
[Session {{ session_number }}]
- Completed: task-XXX (<description>)
- Status: Verified with <verification command>
- Files modified: <list>
- Notes: <any observations>
```

## Step 9: Continue or End Session

If you still have context space:
- Pick the next pending task
- Repeat steps 3-8

Before your context window fills up:
1. Ensure all changes are committed
2. Ensure `scaffold_tasks.json` is saved with updates
3. Ensure `claude-progress.txt` is updated
4. Leave no half-completed tasks

---

## Progress Summary

Current progress:
- Total tasks: {{ total_tasks }}
- Completed: {{ completed_tasks }}
- Remaining: {{ remaining_tasks }}
- Progress: {{ percentage }}%

**Your goal this session:** Complete as many tasks as possible while keeping the project in a working state.

---

## Common Patterns

### If you find issues with previous work:
1. Fix the issue first
2. Re-run verification for affected tasks
3. Update notes in scaffold_tasks.json
4. Commit the fix separately

### If a task is blocked:
1. Add `"status": "blocked"` and `"notes"` explaining why
2. Move to the next unblocked task
3. Document the blocker in claude-progress.txt

### If the project won't build:
1. Check git log for recent changes
2. Try reverting to a known-good commit
3. Fix the issue before continuing
4. Document what went wrong

---

## Final Session Protocol

**When ALL tasks in scaffold_tasks.json have `"status": "completed"`:**

### 1. Final Validation
```bash
# Run all verification commands
{{ verification_commands }}
```

Fix any failures before proceeding.

### 2. Cleanup AI Artifacts
Remove files created for the AI workflow:
```bash
rm -f .ai-agent-state.json
rm -f scaffold_tasks.json
rm -f claude-progress.txt
```

### 3. Final Commit
```bash
git add -A
git commit -m "chore: cleanup scaffold agent artifacts"
```

### 4. Create Pull Request (if applicable)
```bash
# Ensure on feature branch (not main)
git push -u origin $(git branch --show-current)

gh pr create --title "<descriptive title>" --body "$(cat <<'EOF'
## Summary
<2-3 sentences describing what was scaffolded>

## Changes
<bullet list of major components created>

## Verification
- All scaffold tasks completed
- Type check passing
- Build passing

🤖 Scaffolded with AI Agents
EOF
)"
```

When complete, say "Scaffold complete - PR created" to indicate completion.
