/**
 * Schema Scanner
 *
 * Utilities for scanning codebases to find schemas and build migration manifests.
 * Supports Zod-to-OpenAPI migrations and can be extended for other migration types.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import type { MigrationFile, MigrationFileStatus } from "../../core/state";

// =============================================================================
// Types
// =============================================================================

export interface ScanResult {
  hasSchema: boolean;
  usageCount: number;
  schemasDefinedList: string[];
  schemasImported: string[];
  typesExported: string[];
}

export interface SchemaMapping {
  zodName: string;
  openapiPath: string;
  notes?: string;
}

export interface OpenAPISchema {
  name: string;
  path: string;
}

export type FileType = "schema" | "api" | "component" | "hook" | "page" | "lib" | "other";

// =============================================================================
// Regex Patterns for Zod Detection
// =============================================================================

const ZOD_IMPORT_PATTERN = /from\s+["']zod["']|import.*\bz\b.*from\s+["']zod["']/;
const ZOD_USAGE_PATTERN = /\bz\./g;
const ZOD_SCHEMA_DEFINITION = /(?:export\s+)?(?:const|let)\s+(\w+Schema)\s*=\s*z\./g;
const ZOD_TYPE_EXPORT = /export\s+type\s+(\w+)\s*=\s*z\.infer<typeof\s+(\w+)>/g;
const SCHEMA_IMPORT_PATTERN = /import\s*\{([^}]+)\}\s*from\s*["']\.\.?\/[^"']+["']/g;

// =============================================================================
// File Scanning
// =============================================================================

/**
 * Scan a TypeScript file for Zod schema definitions and usage
 */
export function scanFileForZodSchemas(filePath: string): ScanResult {
  if (!existsSync(filePath)) {
    return {
      hasSchema: false,
      usageCount: 0,
      schemasDefinedList: [],
      schemasImported: [],
      typesExported: [],
    };
  }

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return {
      hasSchema: false,
      usageCount: 0,
      schemasDefinedList: [],
      schemasImported: [],
      typesExported: [],
    };
  }

  // Check for Zod import
  const hasZodImport = ZOD_IMPORT_PATTERN.test(content);

  // Count z. usages
  const usages = content.match(ZOD_USAGE_PATTERN);
  const usageCount = usages?.length ?? 0;

  // Find schema definitions (e.g., const fooSchema = z.object(...))
  const schemasDefinedList: string[] = [];
  let match: RegExpExecArray | null;

  const schemaDefPattern = new RegExp(ZOD_SCHEMA_DEFINITION.source, "g");
  while ((match = schemaDefPattern.exec(content)) !== null) {
    schemasDefinedList.push(match[1]);
  }

  // Find type exports (e.g., export type Foo = z.infer<typeof fooSchema>)
  const typesExported: string[] = [];
  const typeExportPattern = new RegExp(ZOD_TYPE_EXPORT.source, "g");
  while ((match = typeExportPattern.exec(content)) !== null) {
    typesExported.push(match[1]);
  }

  // Find schema imports from other files
  const schemasImported: string[] = [];
  const importPattern = new RegExp(SCHEMA_IMPORT_PATTERN.source, "g");
  while ((match = importPattern.exec(content)) !== null) {
    const imports = match[1];
    for (const item of imports.split(",")) {
      const name = item.trim().split(" as ")[0].trim();
      if (name.endsWith("Schema") || name.endsWith("schema")) {
        schemasImported.push(name);
      }
    }
  }

  return {
    hasSchema: hasZodImport || usageCount > 0,
    usageCount,
    schemasDefinedList,
    schemasImported,
    typesExported,
  };
}

/**
 * Classify a file by its type based on path and naming conventions
 */
export function classifyFile(filePath: string, relativePath: string): FileType {
  const name = basename(filePath).toLowerCase();
  const relLower = relativePath.toLowerCase();

  if (name.includes("schema")) {
    return "schema";
  } else if (name.endsWith(".api.ts") || relLower.includes("/api/")) {
    return "api";
  } else if (relLower.includes("/components/")) {
    return "component";
  } else if (name.startsWith("use") || relLower.includes("/hooks/")) {
    return "hook";
  } else if (relLower.includes("/pages/")) {
    return "page";
  } else if (relLower.includes("/lib/") || relLower.includes("/utils/")) {
    return "lib";
  } else {
    return "other";
  }
}

// =============================================================================
// Directory Scanning
// =============================================================================

export interface ScanOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
}

const DEFAULT_INCLUDE = ["**/*.ts", "**/*.tsx"];
const DEFAULT_EXCLUDE = [
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  "*.test.ts",
  "*.spec.ts",
  "*.d.ts",
];

/**
 * Recursively scan a directory for TypeScript files
 */
function* walkDirectory(dir: string, rootDir: string): Generator<string> {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      yield* walkDirectory(fullPath, rootDir);
    } else if (stat.isFile() && (entry.endsWith(".ts") || entry.endsWith(".tsx"))) {
      yield fullPath;
    }
  }
}

/**
 * Check if a path should be excluded
 */
function shouldExclude(relativePath: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    if (relativePath.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Scan a directory for files that use Zod
 */
export function scanForZodFiles(
  rootDir: string,
  options: ScanOptions = {}
): MigrationFile[] {
  const { excludePatterns = DEFAULT_EXCLUDE } = options;

  if (!existsSync(rootDir)) {
    return [];
  }

  const migrationFiles: MigrationFile[] = [];

  for (const filePath of walkDirectory(rootDir, rootDir)) {
    const relativePath = relative(rootDir, filePath);

    // Check exclusions
    if (shouldExclude(relativePath, excludePatterns)) {
      continue;
    }

    // Scan the file
    const scanResult = scanFileForZodSchemas(filePath);

    if (scanResult.hasSchema) {
      const fileType = classifyFile(filePath, relativePath);

      const migrationFile: MigrationFile = {
        path: relativePath,
        status: "pending" as MigrationFileStatus,
        sourceType: "zod",
        targetType: "openapi",
        dependencies: [], // Will be filled in by dependency analysis
      };

      // Store additional metadata
      (migrationFile as any).fileType = fileType;
      (migrationFile as any).zodUsages = scanResult.usageCount;
      (migrationFile as any).schemasDefined = scanResult.schemasDefinedList;
      (migrationFile as any).schemasImported = scanResult.schemasImported;

      migrationFiles.push(migrationFile);
    }
  }

  return migrationFiles;
}

// =============================================================================
// OpenAPI Schema Loading
// =============================================================================

/**
 * Load schema names from an OpenAPI spec file
 */
export function loadOpenAPISchemas(swaggerPath: string): Map<string, string> {
  const schemas = new Map<string, string>();

  if (!existsSync(swaggerPath)) {
    return schemas;
  }

  try {
    const content = readFileSync(swaggerPath, "utf-8");
    const spec = JSON.parse(content);

    const schemasDef = spec?.components?.schemas ?? {};
    for (const schemaName of Object.keys(schemasDef)) {
      // Store lowercase -> actual name mapping
      schemas.set(schemaName.toLowerCase(), schemaName);
    }
  } catch (e) {
    console.error(`Failed to load OpenAPI spec: ${e}`);
  }

  return schemas;
}

/**
 * Try to match a Zod schema name to an OpenAPI schema
 */
export function matchZodToOpenAPI(
  zodSchemaName: string,
  openapiSchemas: Map<string, string>
): string | null {
  // Remove common suffixes
  let baseName = zodSchemaName;
  for (const suffix of ["Schema", "schema", "Zod", "Type"]) {
    if (baseName.endsWith(suffix)) {
      baseName = baseName.slice(0, -suffix.length);
      break;
    }
  }

  const lowerName = baseName.toLowerCase();

  // Try exact match (case-insensitive)
  if (openapiSchemas.has(lowerName)) {
    return `components.schemas.${openapiSchemas.get(lowerName)}`;
  }

  // Try with common prefixes removed
  for (const prefix of ["base", "api", "response", "request", "list", "create", "get", "update", "delete"]) {
    if (lowerName.startsWith(prefix)) {
      const trimmed = lowerName.slice(prefix.length);
      if (openapiSchemas.has(trimmed)) {
        return `components.schemas.${openapiSchemas.get(trimmed)}`;
      }
    }
  }

  // Try with common suffixes
  for (const suffix of ["response", "request", "input", "output", "dto"]) {
    if (lowerName.endsWith(suffix)) {
      const trimmed = lowerName.slice(0, -suffix.length);
      if (openapiSchemas.has(trimmed)) {
        return `components.schemas.${openapiSchemas.get(trimmed)}`;
      }
    }
  }

  return null;
}

// =============================================================================
// Dependency Graph
// =============================================================================

/**
 * Build dependency relationships between files based on schema imports
 */
export function buildDependencyGraph(files: MigrationFile[]): MigrationFile[] {
  // Build a map of schema -> file that defines it
  const schemaToFile = new Map<string, string>();

  for (const f of files) {
    const schemasDefined = (f as any).schemasDefined ?? [];
    for (const schema of schemasDefined) {
      schemaToFile.set(schema, f.path);
    }
  }

  // Build dependencies
  for (const f of files) {
    const schemasImported = (f as any).schemasImported ?? [];
    const dependencies: string[] = [];

    for (const imported of schemasImported) {
      const definingFile = schemaToFile.get(imported);
      if (definingFile && definingFile !== f.path && !dependencies.includes(definingFile)) {
        dependencies.push(definingFile);
      }
    }

    f.dependencies = dependencies;
  }

  return files;
}

/**
 * Compute optimal migration order based on dependencies
 */
export function computePriorityOrder(files: MigrationFile[]): string[] {
  const remaining = new Map(files.map((f) => [f.path, f]));
  const order: string[] = [];

  // Type priority
  const typePriority: Record<string, number> = {
    schema: 0,
    lib: 1,
    api: 2,
    hook: 3,
    component: 4,
    page: 5,
    other: 6,
  };

  while (remaining.size > 0) {
    // Find files with no unsatisfied dependencies
    const ready: MigrationFile[] = [];

    for (const [path, file] of remaining) {
      const depsReady = file.dependencies.every((dep) => !remaining.has(dep));
      if (depsReady) {
        ready.push(file);
      }
    }

    if (ready.length === 0) {
      // Circular dependency - add remaining in any order
      ready.push(...remaining.values());
    }

    // Sort: schema files first, then by usage count
    ready.sort((a, b) => {
      const aType = (a as any).fileType ?? "other";
      const bType = (b as any).fileType ?? "other";
      const aPriority = typePriority[aType] ?? 6;
      const bPriority = typePriority[bType] ?? 6;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aUsages = (a as any).zodUsages ?? 0;
      const bUsages = (b as any).zodUsages ?? 0;
      return aUsages - bUsages;
    });

    for (const file of ready) {
      order.push(file.path);
      remaining.delete(file.path);
    }
  }

  return order;
}

// =============================================================================
// Full Analysis Pipeline
// =============================================================================

export interface AnalysisResult {
  files: MigrationFile[];
  priorityOrder: string[];
  stats: {
    total: number;
    withSchemas: number;
    withoutSchemas: number;
    byFileType: Record<string, number>;
  };
}

/**
 * Run full analysis on a directory
 */
export function analyzeDirectory(
  rootDir: string,
  swaggerPath?: string,
  options: ScanOptions = {}
): AnalysisResult {
  // Scan for files
  let files = scanForZodFiles(rootDir, options);

  // Build dependency graph
  files = buildDependencyGraph(files);

  // If OpenAPI spec provided, analyze coverage
  if (swaggerPath && existsSync(swaggerPath)) {
    const openapiSchemas = loadOpenAPISchemas(swaggerPath);

    for (const file of files) {
      const schemasDefined = (file as any).schemasDefined ?? [];
      const mappings: SchemaMapping[] = [];

      for (const schemaName of schemasDefined) {
        const openapiPath = matchZodToOpenAPI(schemaName, openapiSchemas);
        if (openapiPath) {
          mappings.push({
            zodName: schemaName,
            openapiPath,
            notes: "Auto-matched",
          });
        }
      }

      (file as any).mappings = mappings;
    }
  }

  // Compute priority order
  const priorityOrder = computePriorityOrder(files);

  // Compute stats
  const byFileType: Record<string, number> = {};
  let withSchemas = 0;
  let withoutSchemas = 0;

  for (const file of files) {
    const fileType = (file as any).fileType ?? "other";
    byFileType[fileType] = (byFileType[fileType] ?? 0) + 1;

    const schemasDefined = (file as any).schemasDefined ?? [];
    if (schemasDefined.length > 0) {
      withSchemas++;
    } else {
      withoutSchemas++;
    }
  }

  return {
    files,
    priorityOrder,
    stats: {
      total: files.length,
      withSchemas,
      withoutSchemas,
      byFileType,
    },
  };
}
