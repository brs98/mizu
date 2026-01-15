/**
 * Tests for State Management Module
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createBuilderState,
  createMigratorState,
  saveState,
  loadState,
  loadBuilderState,
  loadMigratorState,
  hasExistingState,
  detectStateType,
  isInitialized,
  loadFeatureList,
  saveFeatureList,
  syncFeaturesFromFile,
  getNextFailingFeature,
  getFeatureProgress,
  loadMigrationManifest,
  saveMigrationManifest,
  syncManifestFromFile,
  getNextPendingFile,
  getMigrationProgress,
  appendProgress,
  readProgress,
  incrementSession,
  markInitialized,
  isComplete,
  type BuilderState,
  type MigratorState,
  type FeatureTest,
  type MigrationFile,
} from "../core/state";

// =============================================================================
// Test Helpers
// =============================================================================

let testDir: string;

function createTestDir(): string {
  const dir = join(tmpdir(), `ai-agents-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// =============================================================================
// Builder State Tests
// =============================================================================

describe("Builder State", () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test("createBuilderState creates valid state", () => {
    const state = createBuilderState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
      specFile: "/path/to/spec.md",
    });

    expect(state.type).toBe("builder");
    expect(state.initialized).toBe(false);
    expect(state.sessionCount).toBe(0);
    expect(state.projectDir).toBe(testDir);
    expect(state.model).toBe("claude-sonnet-4-5");
    expect(state.specFile).toBe("/path/to/spec.md");
    expect(state.features).toEqual([]);
    expect(state.createdAt).toBeDefined();
    expect(state.updatedAt).toBeDefined();
  });

  test("saveState and loadState work correctly", () => {
    const state = createBuilderState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
    });
    state.initialized = true;
    state.sessionCount = 5;

    saveState(state);

    const loaded = loadState(testDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe("builder");
    expect(loaded?.initialized).toBe(true);
    expect(loaded?.sessionCount).toBe(5);
  });

  test("loadBuilderState returns null for non-builder state", () => {
    const state = createMigratorState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
      sourceDir: "src",
      migrationType: "zod-to-openapi",
    });
    saveState(state);

    const loaded = loadBuilderState(testDir);
    expect(loaded).toBeNull();
  });

  test("hasExistingState detects state file", () => {
    expect(hasExistingState(testDir)).toBe(false);

    const state = createBuilderState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
    });
    saveState(state);

    expect(hasExistingState(testDir)).toBe(true);
  });

  test("detectStateType returns correct type", () => {
    expect(detectStateType(testDir)).toBeNull();

    const builderState = createBuilderState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
    });
    saveState(builderState);

    expect(detectStateType(testDir)).toBe("builder");
  });

  test("isInitialized returns correct status", () => {
    expect(isInitialized(testDir)).toBe(false);

    const state = createBuilderState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
    });
    saveState(state);

    expect(isInitialized(testDir)).toBe(false);

    state.initialized = true;
    saveState(state);

    expect(isInitialized(testDir)).toBe(true);
  });
});

// =============================================================================
// Feature List Tests
// =============================================================================

describe("Feature List Management", () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test("saveFeatureList and loadFeatureList work correctly", () => {
    const features: FeatureTest[] = [
      {
        id: "feat-001",
        category: "functional",
        description: "User can log in",
        steps: ["Go to login", "Enter credentials", "Click submit"],
        passes: false,
      },
      {
        id: "feat-002",
        category: "style",
        description: "Login button is blue",
        steps: ["Go to login", "Check button color"],
        passes: true,
        lastTestedAt: "2024-01-15T10:00:00Z",
      },
    ];

    saveFeatureList(testDir, features);
    const loaded = loadFeatureList(testDir);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("feat-001");
    expect(loaded[0].passes).toBe(false);
    expect(loaded[1].passes).toBe(true);
    expect(loaded[1].lastTestedAt).toBe("2024-01-15T10:00:00Z");
  });

  test("loadFeatureList returns empty array for missing file", () => {
    const features = loadFeatureList(testDir);
    expect(features).toEqual([]);
  });

  test("syncFeaturesFromFile updates state from file", () => {
    const features: FeatureTest[] = [
      { id: "feat-001", category: "functional", description: "Test 1", steps: [], passes: false },
      { id: "feat-002", category: "functional", description: "Test 2", steps: [], passes: true },
      { id: "feat-003", category: "functional", description: "Test 3", steps: [], passes: true },
    ];
    saveFeatureList(testDir, features);

    const state = createBuilderState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
    });

    const synced = syncFeaturesFromFile(state);

    expect(synced.features).toHaveLength(3);
    expect(synced.totalFeatures).toBe(3);
    expect(synced.completedFeatures).toBe(2);
  });

  test("getNextFailingFeature returns first failing feature", () => {
    const features: FeatureTest[] = [
      { id: "feat-001", category: "functional", description: "Test 1", steps: [], passes: true },
      { id: "feat-002", category: "functional", description: "Test 2", steps: [], passes: false },
      { id: "feat-003", category: "functional", description: "Test 3", steps: [], passes: false },
    ];

    const next = getNextFailingFeature(features);
    expect(next?.id).toBe("feat-002");
  });

  test("getNextFailingFeature returns null when all pass", () => {
    const features: FeatureTest[] = [
      { id: "feat-001", category: "functional", description: "Test 1", steps: [], passes: true },
      { id: "feat-002", category: "functional", description: "Test 2", steps: [], passes: true },
    ];

    const next = getNextFailingFeature(features);
    expect(next).toBeNull();
  });

  test("getFeatureProgress calculates correctly", () => {
    const features: FeatureTest[] = [
      { id: "feat-001", category: "functional", description: "Test 1", steps: [], passes: true },
      { id: "feat-002", category: "functional", description: "Test 2", steps: [], passes: true },
      { id: "feat-003", category: "functional", description: "Test 3", steps: [], passes: false },
      { id: "feat-004", category: "functional", description: "Test 4", steps: [], passes: false },
    ];

    const progress = getFeatureProgress(features);

    expect(progress.total).toBe(4);
    expect(progress.passing).toBe(2);
    expect(progress.failing).toBe(2);
    expect(progress.percentage).toBe(50);
  });

  test("getFeatureProgress handles empty list", () => {
    const progress = getFeatureProgress([]);

    expect(progress.total).toBe(0);
    expect(progress.passing).toBe(0);
    expect(progress.failing).toBe(0);
    expect(progress.percentage).toBe(0);
  });
});

// =============================================================================
// Migrator State Tests
// =============================================================================

describe("Migrator State", () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test("createMigratorState creates valid state", () => {
    const state = createMigratorState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
      sourceDir: "src/schemas",
      targetDir: "backend",
      migrationType: "zod-to-openapi",
    });

    expect(state.type).toBe("migrator");
    expect(state.initialized).toBe(false);
    expect(state.sourceDir).toBe("src/schemas");
    expect(state.targetDir).toBe("backend");
    expect(state.migrationType).toBe("zod-to-openapi");
    expect(state.files).toEqual([]);
  });

  test("loadMigratorState returns null for non-migrator state", () => {
    const state = createBuilderState({
      projectDir: testDir,
      model: "claude-sonnet-4-5",
    });
    saveState(state);

    const loaded = loadMigratorState(testDir);
    expect(loaded).toBeNull();
  });
});

// =============================================================================
// Migration Manifest Tests
// =============================================================================

describe("Migration Manifest Management", () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test("saveMigrationManifest and loadMigrationManifest work correctly", () => {
    const files: MigrationFile[] = [
      {
        path: "src/schema.ts",
        status: "pending",
        sourceType: "zod",
        targetType: "openapi",
        dependencies: [],
      },
      {
        path: "src/api.ts",
        status: "migrated",
        sourceType: "zod",
        targetType: "openapi",
        dependencies: ["src/schema.ts"],
        migratedAt: "2024-01-15T10:00:00Z",
      },
    ];

    saveMigrationManifest(testDir, files);
    const loaded = loadMigrationManifest(testDir);

    expect(loaded).toHaveLength(2);
    expect(loaded[0].path).toBe("src/schema.ts");
    expect(loaded[0].status).toBe("pending");
    expect(loaded[1].status).toBe("migrated");
    expect(loaded[1].migratedAt).toBe("2024-01-15T10:00:00Z");
  });

  test("getNextPendingFile respects dependencies", () => {
    const files: MigrationFile[] = [
      {
        path: "src/api.ts",
        status: "pending",
        sourceType: "zod",
        targetType: "openapi",
        dependencies: ["src/schema.ts"],
      },
      {
        path: "src/schema.ts",
        status: "pending",
        sourceType: "zod",
        targetType: "openapi",
        dependencies: [],
      },
    ];

    const next = getNextPendingFile(files);
    // Should return schema.ts because api.ts depends on it
    expect(next?.path).toBe("src/schema.ts");
  });

  test("getNextPendingFile returns file when dependencies are migrated", () => {
    const files: MigrationFile[] = [
      {
        path: "src/api.ts",
        status: "pending",
        sourceType: "zod",
        targetType: "openapi",
        dependencies: ["src/schema.ts"],
      },
      {
        path: "src/schema.ts",
        status: "migrated",
        sourceType: "zod",
        targetType: "openapi",
        dependencies: [],
      },
    ];

    const next = getNextPendingFile(files);
    expect(next?.path).toBe("src/api.ts");
  });

  test("getMigrationProgress calculates correctly", () => {
    const files: MigrationFile[] = [
      { path: "a.ts", status: "migrated", sourceType: "zod", targetType: "openapi", dependencies: [] },
      { path: "b.ts", status: "migrated", sourceType: "zod", targetType: "openapi", dependencies: [] },
      { path: "c.ts", status: "pending", sourceType: "zod", targetType: "openapi", dependencies: [] },
      { path: "d.ts", status: "blocked", sourceType: "zod", targetType: "openapi", dependencies: [] },
      { path: "e.ts", status: "error", sourceType: "zod", targetType: "openapi", dependencies: [] },
    ];

    const progress = getMigrationProgress(files);

    expect(progress.total).toBe(5);
    expect(progress.migrated).toBe(2);
    expect(progress.pending).toBe(1);
    expect(progress.blocked).toBe(1);
    expect(progress.error).toBe(1);
    expect(progress.percentage).toBe(40);
  });
});

// =============================================================================
// Progress File Tests
// =============================================================================

describe("Progress File Management", () => {
  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test("appendProgress creates file if not exists", () => {
    appendProgress(testDir, "Session 1 completed");

    const content = readProgress(testDir);
    expect(content).toContain("Session 1 completed");
    expect(content).toContain("# Claude Progress Log");
  });

  test("appendProgress appends to existing file", () => {
    appendProgress(testDir, "Session 1 completed");
    appendProgress(testDir, "Session 2 completed");

    const content = readProgress(testDir);
    expect(content).toContain("Session 1 completed");
    expect(content).toContain("Session 2 completed");
  });

  test("readProgress returns empty string for missing file", () => {
    const content = readProgress(testDir);
    expect(content).toBe("");
  });
});

// =============================================================================
// Session Management Tests
// =============================================================================

describe("Session Management", () => {
  test("incrementSession increases count", () => {
    const state = createBuilderState({
      projectDir: "/test",
      model: "claude-sonnet-4-5",
    });
    expect(state.sessionCount).toBe(0);

    const updated = incrementSession(state);
    expect(updated.sessionCount).toBe(1);

    const updated2 = incrementSession(updated);
    expect(updated2.sessionCount).toBe(2);
  });

  test("markInitialized sets flag", () => {
    const state = createBuilderState({
      projectDir: "/test",
      model: "claude-sonnet-4-5",
    });
    expect(state.initialized).toBe(false);

    const updated = markInitialized(state);
    expect(updated.initialized).toBe(true);
  });
});

// =============================================================================
// Completion Detection Tests
// =============================================================================

describe("Completion Detection", () => {
  test("isComplete returns true when all builder features pass", () => {
    const state = createBuilderState({
      projectDir: "/test",
      model: "claude-sonnet-4-5",
    });
    state.features = [
      { id: "1", category: "functional", description: "", steps: [], passes: true },
      { id: "2", category: "functional", description: "", steps: [], passes: true },
    ];

    expect(isComplete(state)).toBe(true);
  });

  test("isComplete returns false when builder features remain", () => {
    const state = createBuilderState({
      projectDir: "/test",
      model: "claude-sonnet-4-5",
    });
    state.features = [
      { id: "1", category: "functional", description: "", steps: [], passes: true },
      { id: "2", category: "functional", description: "", steps: [], passes: false },
    ];

    expect(isComplete(state)).toBe(false);
  });

  test("isComplete returns false for empty builder features", () => {
    const state = createBuilderState({
      projectDir: "/test",
      model: "claude-sonnet-4-5",
    });
    state.features = [];

    expect(isComplete(state)).toBe(false);
  });

  test("isComplete returns true when all migrator files are migrated or skipped", () => {
    const state = createMigratorState({
      projectDir: "/test",
      model: "claude-sonnet-4-5",
      sourceDir: "src",
      migrationType: "zod-to-openapi",
    });
    state.files = [
      { path: "a.ts", status: "migrated", sourceType: "zod", targetType: "openapi", dependencies: [] },
      { path: "b.ts", status: "skipped", sourceType: "zod", targetType: "openapi", dependencies: [] },
    ];

    expect(isComplete(state)).toBe(true);
  });

  test("isComplete returns false when migrator files are pending", () => {
    const state = createMigratorState({
      projectDir: "/test",
      model: "claude-sonnet-4-5",
      sourceDir: "src",
      migrationType: "zod-to-openapi",
    });
    state.files = [
      { path: "a.ts", status: "migrated", sourceType: "zod", targetType: "openapi", dependencies: [] },
      { path: "b.ts", status: "pending", sourceType: "zod", targetType: "openapi", dependencies: [] },
    ];

    expect(isComplete(state)).toBe(false);
  });
});
