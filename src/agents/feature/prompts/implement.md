# Feature Implementation

## Depth: {{ depth_level }}

{% if depth_level == "quick" %}
**QUICK MODE** - Fast implementation.

1. Read the spec and identify key files to modify
2. Implement the feature directly
3. Add minimal tests
4. Skip extensive codebase exploration

Do NOT:
- Map the entire codebase
- Refactor existing code
- Add extensive documentation
- Over-engineer the solution

{% endif %}
{% if depth_level == "standard" %}
**STANDARD MODE** - Balanced implementation.

1. Analyze existing code patterns in related areas
2. Plan the implementation approach
3. Implement following existing conventions
4. Write tests matching existing test patterns
5. Verify integration with existing features

Guidelines:
- Match the codebase's naming conventions
- Follow existing file organization patterns
- Use existing utilities and helpers
- Write tests similar to existing tests

{% endif %}
{% if depth_level == "thorough" %}
**THOROUGH MODE** - Comprehensive implementation.

1. Full codebase analysis for patterns and conventions
2. Design document with architectural considerations
3. Implement with comprehensive error handling
4. Full test coverage including edge cases
5. Documentation updates
6. Integration testing

Ensure:
- All edge cases are handled
- Error messages are helpful
- Code is well-documented
- Performance is considered
- Security implications are reviewed

{% endif %}

## Feature Specification

{{ spec }}

## Your Task

Implement this feature following the codebase's existing patterns and conventions.

## Scope Discipline

**Implement exactly what the spec describes.** If ambiguous, choose the simplest interpretation.

Do NOT: add "nice to have" functionality, refactor unrelated code, add extra configurability, or over-engineer for hypothetical future requirements.

When implementation is complete and verified, say "Feature implementation complete" to indicate completion.
