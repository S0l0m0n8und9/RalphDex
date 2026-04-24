/**
 * Repo structure definition schema — structure.d
 *
 * A `StructureDefinition` document lives at `.ralph/structure.json` (overridable
 * via `ralphCodex.structureDefinitionPath`) and tells Ralph how the repository
 * is organized so the agent respects existing layout conventions instead of
 * making its own structural decisions.
 *
 * The file is hand-editable JSON. Inference (T173) can generate a starter from
 * the current repo layout; the operator can then amend it by hand.
 *
 * Example: see docs/structure-definition-example.json
 */

export type StructureDirectoryRole =
  | 'source'    // Primary production source code
  | 'test'      // Automated test files
  | 'docs'      // Documentation
  | 'config'    // Configuration files
  | 'scripts'   // Build / tooling scripts
  | 'state'     // Runtime-managed state (e.g. .ralph/)
  | 'output'    // Build artefacts (e.g. out/, dist/)
  | 'assets'    // Static assets
  | 'other';    // Anything not covered above

export interface StructureDirectoryEntry {
  /** Workspace-relative path to the directory. */
  path: string;
  /** Semantic role for this directory. */
  role: StructureDirectoryRole;
  /** Optional human-readable description. */
  description?: string;
}

/** File-type placement rule. First matching rule wins. */
export interface StructurePlacementRule {
  /** Glob pattern matched against workspace-relative file paths. */
  pattern: string;
  /** Directory path (matching a `directories` entry) where matched files belong. */
  directory: string;
  /** Optional description explaining the rule's intent. */
  description?: string;
}

export interface StructureNamingConvention {
  /** Glob scope to which this convention applies. */
  scope: string;
  /** Convention identifier (informational — e.g. "camelCase", "kebab-case"). */
  convention: string;
  /** Optional human-readable description. */
  description?: string;
}

export interface StructureForbiddenPath {
  /** Workspace-relative path or glob pattern agents must not create or overwrite. */
  path: string;
  /** Reason the path is off-limits to agents. */
  reason: string;
}

/**
 * Top-level structure.d document.
 *
 * Persisted as JSON at `ralphCodex.structureDefinitionPath`
 * (default: `.ralph/structure.json`).
 */
export interface StructureDefinition {
  /** Schema version. Must be 1. */
  version: 1;
  /** Top-level directory roles describing the repository layout. */
  directories: StructureDirectoryEntry[];
  /** File-type placement rules. First matching rule wins. Omit to skip placement enforcement. */
  placementRules?: StructurePlacementRule[];
  /** Naming conventions for files or directories within a scope. */
  namingConventions?: StructureNamingConvention[];
  /** Paths agents must not create or modify. */
  forbiddenPaths?: StructureForbiddenPath[];
}
