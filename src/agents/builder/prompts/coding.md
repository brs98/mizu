# Coding Agent - Continuing Development

You are continuing work on an existing project. This is a **fresh context window** - you have no memory of previous sessions.

## Your Environment

- **Working Directory**: {{ project_dir }}
- **Model**: {{ model }}
- **Session**: {{ session_number }}
- **Browser Testing**: {{ browser_testing_enabled }}

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
- `feature_list.json` - The source of truth for what needs to be built

## Step 2: Verify the Environment Works

**Before implementing anything new**, verify the app is in a working state:

1. Run `./init.sh` to start the development server
2. Use Puppeteer to test basic functionality:
   - Navigate to the app URL
   - Verify the page loads
   - Test 2-3 previously-passing features

If something is broken, **fix it first** before adding new features.

## Step 3: Choose ONE Feature to Implement

From `feature_list.json`, find the **highest-priority feature** that:
- Has `"passes": false`
- Has all its dependencies already implemented

Work on **only ONE feature** per session. This ensures:
- Clean, reviewable commits
- The environment stays stable
- Progress is tracked accurately

## Step 4: Implement the Feature

Follow the testing steps in the feature entry. For example:

```json
{
  "id": "feat-042",
  "category": "functional",
  "description": "User can delete a conversation from the sidebar",
  "steps": [
    "Navigate to main interface",
    "Create a new conversation",
    "Hover over the conversation in sidebar",
    "Click the delete button",
    "Confirm deletion in modal",
    "Verify conversation is removed from sidebar"
  ],
  "passes": false
}
```

Implement the code to make these steps work.

## Step 5: Test with Browser Automation

{% if browser_testing_enabled %}
Use Puppeteer tools to verify the feature works end-to-end:

```
1. mcp__puppeteer__puppeteer_navigate - Go to the app
2. mcp__puppeteer__puppeteer_screenshot - Capture the state
3. mcp__puppeteer__puppeteer_click - Interact with elements
4. mcp__puppeteer__puppeteer_fill - Enter text in forms
5. mcp__puppeteer__puppeteer_screenshot - Verify the result
```

**Only mark a feature as passing after you have verified it with browser testing.**
{% else %}
Test the feature manually or with unit tests. Verify it works before marking as complete.
{% endif %}

## Step 6: Update feature_list.json

After verification, update the feature entry:

```json
{
  "id": "feat-042",
  "category": "functional",
  "description": "User can delete a conversation from the sidebar",
  "steps": [...],
  "passes": true,
  "lastTestedAt": "2024-01-15T10:30:00Z"
}
```

**CRITICAL RULES:**
- Only change `passes` from `false` to `true`
- Add `lastTestedAt` with current timestamp
- If the test fails, add `failureReason` explaining why
- **NEVER remove features**
- **NEVER edit descriptions or steps**

## Step 7: Commit Your Progress

Make a descriptive commit:

```bash
git add -A
git commit -m "feat(feat-042): implement conversation deletion

- Added delete button to sidebar items
- Created confirmation modal
- Implemented delete API endpoint
- Verified with browser automation

Passes: feat-042"
```

## Step 8: Update Progress File

Append to `claude-progress.txt`:

```
[Session {{ session_number }}]
- Implemented: feat-042 (conversation deletion)
- Status: Passing
- Files modified: src/components/Sidebar.tsx, src/api/conversations.ts
- Notes: Used existing modal component for confirmation
```

## Step 9: End Session Cleanly

Before your context window fills up:

1. Ensure all changes are committed
2. Ensure `feature_list.json` is saved with updates
3. Ensure `claude-progress.txt` is updated
4. Leave no half-implemented features

The next agent will continue from here.

---

## Common Patterns

### If you find bugs in existing features:
1. Fix the bug first
2. Re-verify the affected feature
3. Update `lastTestedAt` in feature_list.json
4. Commit the fix separately

### If a feature is blocked:
1. Add `"failureReason"` explaining the blocker
2. Move to the next unblocked feature
3. Document the blocker in claude-progress.txt

### If the app won't start:
1. Check git log for recent changes
2. Try reverting to a known-good commit
3. Fix the issue before continuing
4. Document what went wrong

---

## Progress Summary

Current progress will be shown here:
- Total features: {{ total_features }}
- Passing: {{ passing_features }}
- Remaining: {{ remaining_features }}

**Your goal this session:** Implement one more feature and leave the environment better than you found it.
