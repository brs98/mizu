# Add User Preferences Feature

## Overview

Add a user preferences system that allows users to customize their experience. This includes storing preferences in a JSON file and providing an API to read/write them.

## Implementation Steps

1. Create the preferences schema and types in `src/core/preferences.ts`
2. Implement the preferences file storage with read/write functions
3. Add CLI commands for getting and setting preferences
4. Write unit tests for the preferences module
5. Update documentation with preferences usage examples

## Technical Approach

- Use Zod for schema validation
- Store preferences in `~/.mizu/preferences.json`
- Provide type-safe getters/setters

## Verification

Run `bun test` to verify all tests pass after implementation.
