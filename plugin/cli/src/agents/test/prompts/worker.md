# Test Writing - Task {{ task_id }}

Write failing tests for this task BEFORE implementation begins.

## Task Description

{{ task_description }}

## Project Directory

{{ project_dir }}

---

## Your Job

You are the **Test Subagent** in a TDD workflow. Your role is to write tests that will FAIL until the main agent implements the feature.

### Step 1: Analyze the Task

Understand what needs to be implemented:
- What is the expected behavior?
- What inputs and outputs are involved?
- What edge cases should be tested?

### Step 2: Discover Test Patterns

Examine the codebase to understand existing test patterns:

```bash
# Find existing test files
find . -name "*.test.*" -o -name "*.spec.*" -o -name "*_test.*" | head -20

# Look at test structure
ls -la test/ tests/ __tests__/ spec/ 2>/dev/null || echo "No standard test directory found"
```

### Step 3: Write Failing Tests

Create test(s) that:
1. **Define expected behavior** - What should the code do?
2. **Will FAIL now** - The implementation doesn't exist yet
3. **Will PASS later** - Once the main agent implements the feature

Follow the existing test patterns in the codebase. If none exist, use a sensible default for the language/framework.

### Step 4: Verify Tests Fail (RED)

Run the tests to confirm they fail:

```bash
{{ test_command }}
```

**CRITICAL**: Your tests MUST fail. If they pass, you wrote the wrong tests - the feature shouldn't exist yet!

### Step 5: Save Test Information

Save test metadata to `.mizu/{{ plan_name }}/tests/{{ task_id }}.json`:

```json
{
  "taskId": "{{ task_id }}",
  "testFiles": ["path/to/your/test/file"],
  "testCommand": "{{ test_command }}",
  "status": "red",
  "failureOutput": "<paste the failure output here>",
  "createdAt": "<timestamp>"
}
```

---

## Important Rules

1. **Tests must fail** - This is the RED phase of TDD
2. **Follow existing patterns** - Match the codebase's test style
3. **Be specific** - Test the exact behavior described in the task
4. **One test file per task** - Keep tests focused
5. **No implementation** - Only write tests, not the actual code

---

## Output

When you're done:
1. Tests are written and committed
2. Tests fail when run (verified)
3. Test info saved to `.mizu/{{ plan_name }}/tests/{{ task_id }}.json`
4. Say **"Tests written and verified RED"** to indicate completion
