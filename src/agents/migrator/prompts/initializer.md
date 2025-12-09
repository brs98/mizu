# Migration Initializer - Session 1 of Many

You are the FIRST agent in a long-running schema migration process.
Your job is to analyze the codebase and create a comprehensive migration plan.

## Your Environment

- **Working Directory**: {{ project_dir }}
- **Source Directory**: {{ source_dir }}
{% if target_dir %}- **Target Directory**: {{ target_dir }}{% endif %}
- **Migration Type**: {{ migration_type }}
{% if swagger_path %}- **OpenAPI Spec**: {{ swagger_path }}{% endif %}
- **Model**: {{ model }}

## Step 1: Verify Prerequisites

Before creating the migration plan, verify the prerequisites:

```bash
# 1. See your working directory
pwd

# 2. Check source files exist
ls -la {{ source_dir }}

{% if swagger_path %}
# 3. Check OpenAPI spec exists
ls -la {{ swagger_path }}
{% endif %}
```

{% if migration_type == "zod-to-openapi" %}
If migrating to OpenAPI types, verify:
- OpenAPI spec is accessible and has schema definitions
- Type generation has been run (check for generated types)
{% endif %}

## Step 2: Review the Migration Manifest

A migration manifest has been pre-generated. Review it:

```bash
cat migration_manifest.json
```

The manifest contains:
- List of files that need migration
- Dependency graph between files
- Schema mappings (Zod → OpenAPI)
- Priority order for migration

## Step 3: Analyze OpenAPI Coverage (if applicable)

{% if migration_type == "zod-to-openapi" %}
For each Zod schema, determine if there's a matching OpenAPI type:

1. **Perfect match** - Schema has equivalent OpenAPI type
2. **Partial match** - Some fields match, needs manual adjustment
3. **No match** - Schema exists only in frontend (needs backend change)
4. **Keep Zod** - Used for runtime validation (forms, user input)

Update the manifest with your findings.
{% endif %}

## Step 4: Create Migration Plan

Create `migration_plan.md` with:

### Summary Statistics
- Total files to migrate
- Files by category (schema, api, component, etc.)
- Estimated complexity

### Phase Breakdown
- Phase 1: Base schemas (no dependencies)
- Phase 2: Domain schemas
- Phase 3: API clients
- Phase 4: Components and hooks
- Phase 5: Cleanup

### Known Issues
- Files that need special handling
- Missing types (if any)
- Blocked files and why

### Success Criteria
- All files in manifest marked as `migrated` or `skipped`
- Typecheck passes (`pnpm typecheck` or `npm run typecheck`)
- No unexpected runtime errors

## Step 5: Initialize Git Tracking

```bash
git add migration_manifest.json migration_plan.md
git commit -m "Initialize {{ migration_type }} migration

- Scanned X files with schema usage
- Created migration manifest with dependency graph
- Identified Y files ready for migration, Z blocked"
```

## Step 6: Save Progress

Create `migration_progress.txt` with:
- What you accomplished this session
- Current status of the migration
- What the next agent should do first

## Ending This Session

Before your context fills up:

1. Ensure `migration_manifest.json` is complete
2. Ensure `migration_plan.md` documents the strategy
3. Commit all work with descriptive message
4. Update `migration_progress.txt`

The next agent will begin actual file migrations based on your plan.

---

**Remember:** You have unlimited time across many sessions. Focus on creating a clear, actionable plan. The actual migrations will happen in subsequent sessions.
