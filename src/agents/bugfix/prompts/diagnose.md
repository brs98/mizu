# Bug Diagnosis

## Depth: {{ depth_level }}

{% if depth_level == "quick" %}
**QUICK MODE** - Trust the error, make a fast fix.

1. Read ONLY the file(s) mentioned in the error
2. Identify the exact line/function causing the issue
3. Apply a minimal fix immediately
4. Skip exploration - don't map the codebase

{% endif %}
{% if depth_level == "standard" %}
**STANDARD MODE** - Understand context, fix properly.

1. Read the files mentioned in the error
2. Check immediate dependencies (1-2 files)
3. Understand WHY the bug exists
4. Plan a fix that addresses root cause

{% endif %}
{% if depth_level == "thorough" %}
**THOROUGH MODE** - Comprehensive analysis.

1. Analyze the full stack trace
2. Map all code paths involved
3. Check for similar patterns elsewhere
4. Understand the broader context
5. Plan a complete fix

{% endif %}

## Error Input

```
{{ error_input }}
```

## Your Task

Diagnose this error and identify what needs to be fixed.

{% if depth_level == "quick" %}
After diagnosis, immediately apply the fix. Don't wait for confirmation.
{% else %}
Report your findings:
- What is the root cause?
- Which file(s) need to change?
- What is the fix?

Then apply the fix and verify it works.
{% endif %}

When the fix is verified and working, say "Fix verified - bug is resolved" to indicate completion.
