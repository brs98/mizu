# Feature Initializer - Session 1

You are setting up a feature implementation in {{ project_dir }}.

## Feature Specification

{{ spec_text }}

{% if spec_file %}
Spec file: {{ spec_file }}
{% endif %}

## Your Tasks

0. **Baseline Testing (CRITICAL)**

   Before doing anything else, verify the codebase is healthy:

   ```bash
   pnpm test
   # or: npm test
   ```

   If tests fail, document the pre-existing failures in `claude-progress.txt`. You need to know what was already broken vs what you might break.

1. **Analyze the Codebase**
   - Explore the project structure
   - Identify related existing functionality
   - Understand patterns and conventions used

2. **Plan the Implementation**
   - Identify what needs to be built
   - Determine which files need modification
   - Plan the integration points

3. **Create feature_tasks.json**
   Break down the feature into concrete, verifiable tasks:

```json
[
  {
    "id": "feature-001",
    "description": "Analyze requirements and existing codebase patterns",
    "status": "pending",
    "dependencies": []
  },
  {
    "id": "feature-002",
    "description": "Design implementation approach following existing conventions",
    "status": "pending",
    "dependencies": ["feature-001"]
  },
  {
    "id": "feature-003",
    "description": "Implement core feature logic",
    "status": "pending",
    "verificationCommand": "pnpm typecheck",
    "dependencies": ["feature-002"]
  },
  {
    "id": "feature-004",
    "description": "Add unit and integration tests",
    "status": "pending",
    "verificationCommand": "pnpm test",
    "dependencies": ["feature-003"]
  },
  {
    "id": "feature-005",
    "description": "Integrate with existing code and verify all tests pass",
    "status": "pending",
    "verificationCommand": "pnpm test && pnpm typecheck",
    "dependencies": ["feature-004"]
  }
]
```

**Verification Guidelines:** Every task that modifies code should have a `verificationCommand`. Use `pnpm typecheck` for type changes, `pnpm test` for behavior changes, or combine them.

4. **Initialize Git Tracking**
```bash
git add feature_tasks.json
git commit -m "Initialize feature implementation tasks"
```

5. **Create claude-progress.txt**
   Document your analysis and planned approach.

## Task Guidelines

- Each task should be independently verifiable
- Use verificationCommand when possible
- Order tasks by dependencies
- Include 5-10 tasks depending on feature complexity
- All tasks start with "status": "pending"

When done, the next session will begin executing tasks one by one.
