# Refactor Initializer - Session 1

You are setting up a refactoring task in {{ project_dir }}.

## Focus Area
{{ focus_instructions }}

## Target
{{ target }}

## Your Tasks

1. **Run Test Baseline**
   - Run the full test suite to ensure everything passes
   - This is CRITICAL - never start refactoring with failing tests
   ```bash
   pnpm test
   ```

2. **Analyze the Codebase**
   - Explore the target area and its dependencies
   - Identify specific refactoring opportunities
   - Note areas with code smells, complexity, or poor patterns

3. **Create refactor_tasks.json**
   Break down the refactoring into concrete, verifiable tasks:

```json
[
  {
    "id": "refactor-001",
    "description": "Run tests to establish passing baseline",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": []
  },
  {
    "id": "refactor-002",
    "description": "Identify and document refactoring targets",
    "status": "pending",
    "dependencies": ["refactor-001"]
  },
  {
    "id": "refactor-003",
    "description": "Refactor: [specific improvement 1]",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["refactor-002"]
  },
  {
    "id": "refactor-004",
    "description": "Refactor: [specific improvement 2]",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["refactor-003"]
  },
  {
    "id": "refactor-005",
    "description": "Final verification - all tests pass, code quality improved",
    "status": "pending",
    "verificationCommand": "pnpm test && pnpm typecheck",
    "dependencies": ["refactor-004"]
  }
]
```

4. **Initialize Git Tracking**
```bash
git add refactor_tasks.json
git commit -m "Initialize refactor tasks"
```

5. **Create claude-progress.txt**
   Document your analysis and planned refactoring approach.

## Task Guidelines

- EVERY task that makes code changes must have a verificationCommand
- Tests must pass after every refactoring step
- Order tasks so each builds on the previous
- Be specific about what each task will improve
- Include 5-15 tasks depending on scope

## Critical Rules

- Tests must pass BEFORE you start
- Tests must pass AFTER every change
- No behavior changes - refactoring is invisible to users

When done, the next session will begin executing tasks one by one.
