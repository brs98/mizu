# Code Refactoring

## Depth: {{ depth_level }}

{% if depth_level == "quick" %}
**QUICK MODE** - Targeted improvements.

1. Run existing tests to establish baseline
2. Make focused improvements to the target area
3. Verify tests still pass
4. Skip exploration of unrelated code

Constraints:
- Only touch files in the target area
- No architectural changes
- Keep changes minimal and focused

{% endif %}
{% if depth_level == "standard" %}
**STANDARD MODE** - Thorough refactoring.

1. Run full test suite to establish baseline
2. Analyze the target area and its dependencies
3. Plan refactoring approach
4. Make incremental changes, testing after each
5. Ensure all tests pass before completion

Guidelines:
- Commit logically grouped changes
- Update any affected tests
- Preserve public APIs unless explicitly changing them

{% endif %}
{% if depth_level == "thorough" %}
**THOROUGH MODE** - Comprehensive improvement.

1. Full test suite verification
2. Complete analysis of target area architecture
3. Identify all improvement opportunities
4. Create refactoring plan with priorities
5. Implement changes incrementally with tests
6. Code review quality verification
7. Performance benchmarking if applicable

Include:
- Dependency analysis
- Impact assessment
- Migration path for breaking changes
- Updated documentation

{% endif %}

## Focus Area: {{ focus }}

{% if focus == "performance" %}
Focus on performance optimizations:
- Algorithm efficiency
- Caching opportunities
- Lazy loading
- Reducing allocations
- Database query optimization
{% endif %}
{% if focus == "readability" %}
Focus on readability improvements:
- Clear, descriptive naming
- Reduced complexity (cyclomatic, cognitive)
- Better code organization
- Improved comments where needed
- Consistent formatting
{% endif %}
{% if focus == "patterns" %}
Focus on design patterns:
- Proper abstractions
- SOLID principles
- Reducing coupling
- DRY (Don't Repeat Yourself)
- Separation of concerns
{% endif %}
{% if focus == "all" %}
Consider all aspects:
- Performance optimizations
- Readability improvements
- Design pattern application
- Technical debt reduction
{% endif %}

## Target

{{ target }}

## Critical Rules

1. **Tests must pass before you start** - Run the test suite first
2. **Tests must pass after every change** - Verify continuously
3. **No behavior changes** - Refactoring must be invisible to users
4. **Incremental changes** - Small, reviewable commits

## Your Task

Refactor the target code to improve quality while preserving behavior.

When refactoring is complete and all tests pass, say "Refactoring complete - all tests passing" to indicate completion.
