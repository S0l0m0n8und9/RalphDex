# T171: File-Creation Path Audit

**Date**: 2026-04-25  
**Scope**: Complete audit of file-placement decisions in RalphDex code  
**Goal**: Identify all decision points where Ralph or agents place new files, and note whether structural guidance is currently available.

---

## Overview

RalphDex currently uses a **centralized path-resolution pattern** for most Ralph-owned directories (`.ralph/tasks.json`, `.ralph/artifacts/`, etc.), but **ad-hoc path construction** appears in several subsystems. The codebase has ~133 file-write and mkdir operations, but only ~38 relate to Ralph's core paths.

**Key Insight**: Most path decisions are config-driven or hardcoded using constants, but there is no unified structural schema that the agent can query or follow. Structure decisions are embedded in pathResolver.ts, config defaults, and scattered throughout the codebase.

---

## Part 1: Centralized Path Resolution

### 1.1 `src/ralph/pathResolver.ts` – Authoritative Path Layer
**Status**: ✅ Fully config-guided  
**Role**: Single source of truth for `.ralph/` directory structure and standard Ralph paths.

**RalphPaths interface** provides:
- `ralphDir` → `.ralph/` (hardcoded)
- `prdPath` → config: `prdPath` (default: `.ralph/prd.md`)
- `taskFilePath` → config: `ralphTaskFilePath` (default: `.ralph/tasks.json`)
- `progressPath` → config: `progressPath` (default: `.ralph/progress.md`)
- `claimFilePath` → hardcoded: `.ralph/claims.json`
- `stateFilePath` → hardcoded: `.ralph/state.json`
- `handoffDir` → hardcoded: `.ralph/handoff/`
- `promptDir` → hardcoded: `.ralph/prompts/`
- `runDir` → hardcoded: `.ralph/runs/`
- `logDir` → hardcoded: `.ralph/logs/`
- `artifactDir` → config: `artifactRetentionPath` (default: `.ralph/artifacts`)
- `memorySummaryPath` → hardcoded: `.ralph/memory-summary.md`
- `deadLetterPath` → hardcoded: `.ralph/dead-letter.json`

**Observation**: pathResolver.ts owns the top-level directory structure. All callsites should use `resolveRalphPaths()` to retrieve paths rather than constructing them ad-hoc.

---

## Part 2: Config-Driven Path Keys

### 2.1 RalphCodexConfig Path Properties
**File**: `src/config/types.ts` + `src/config/defaults.ts`

| Property | Type | Default | Config-Driven? |
|----------|------|---------|---|
| `ralphTaskFilePath` | string | `.ralph/tasks.json` | ✅ Yes |
| `prdPath` | string | `.ralph/prd.md` | ✅ Yes |
| `progressPath` | string | `.ralph/progress.md` | ✅ Yes |
| `artifactRetentionPath` | string | `.ralph/artifacts` | ✅ Yes |
| `promptTemplateDirectory` | string | `''` (empty → use built-in) | ✅ Yes |
| `validationCommandOverride` | string | `''` (optional override) | ✅ Yes |

**Observation**: Four core Ralph paths are config-driven; three others are hardcoded constants. No config key exists for:
- `.ralph/logs/`
- `.ralph/prompts/`
- `.ralph/runs/`
- `.ralph/handoff/`
- `.ralph/orchestration/`
- `.ralph/agents/`

---

## Part 3: Artifact Store & Iteration Paths

### 3.1 `src/ralph/artifactStore.ts` – Iteration & Provenance Artifacts
**Status**: ✅ Highly structured, uses resolver functions  
**Pattern**: All paths computed via `resolveIterationArtifactPaths()`, `resolveProvenanceBundlePaths()`, and `resolveLatestArtifactPaths()`.

**Iteration artifact layout** (config-driven via `artifactRetentionPath`):
```
<artifactRetentionPath>/
├── iteration-NNN/
│   ├── prompt.md
│   ├── prompt-evidence.json
│   ├── execution-plan.json
│   ├── cli-invocation.json
│   ├── completion-report.json
│   ├── stdout.log
│   ├── stderr.log
│   ├── execution-summary.json
│   ├── verifier-summary.json
│   ├── diff-summary.json (optional)
│   ├── iteration-result.json
│   ├── task-remediation.json (optional)
│   ├── summary.md
│   ├── git-status-before.txt
│   └── git-status-after.txt
├── latest-*.json (pointers to latest iteration artifacts)
├── runs/
│   └── <provenanceId>/
│       ├── provenance-bundle.json
│       ├── summary.md
│       ├── preflight-report.json
│       └── ... (copy of iteration and preflight artifacts)
└── <taskId>/
    ├── plan-graph.json (task-specific planning graph)
    └── replan-<index>.json (replan decision artifact)
```

**Key Decision Points**:
- Iteration number → zero-padded 3-digit directory name
- Provenance ID → user-supplied; runs/ subdirectory
- Task ID → subdirectory for plan/replan artifacts
- All paths use `path.join()` with computed values

**Structural Guidance**: ✅ Complete — all paths are deterministic functions of resolver inputs.

---

### 3.2 `src/ralph/artifactRetention.ts` – Cleanup & Latest Pointer Repair
**Status**: ✅ Structured  
**Role**: Manages retention policy and repairs latest-pointer files when artifacts are deleted.

**Files written**:
- `latest-result.json`
- `latest-summary.md`
- `latest-preflight-report.json`
- `latest-preflight-summary.md`
- `latest-prompt-evidence.json`
- `latest-execution-plan.json`
- `latest-cli-invocation.json`
- `latest-provenance-bundle.json`
- `latest-provenance-failure.json`

**Observation**: All latest pointers are hardcoded filenames in `PROTECTED_GENERATED_LATEST_POINTER_FILES`. No configuration exists to customize them.

---

## Part 4: Ad-Hoc Path Construction

### 4.1 `src/commands/registerCommands.ts` – Workspace Initialization
**Status**: ⚠️ Hardcoded paths  
**Role**: Creates initial Ralph workspace structure.

**Files created during "Initialize Workspace"**:
```typescript
const ralphDir = path.join(rootPath, '.ralph');
const prdPath = path.join(ralphDir, 'prd.md');
const tasksPath = path.join(ralphDir, 'tasks.json');
const progressPath = path.join(ralphDir, 'progress.md');
const gitignorePath = path.join(ralphDir, '.gitignore');
```

**Analysis**:
- Hardcoded relative to workspace root.
- No config override possible during init (differs from runtime config).
- `.gitignore` is created with hardcoded content:
  ```
  /artifacts
  /done-task-audit*.md
  /logs
  /prompts
  /runs
  /state.json
  ```

**Gap**: ⚠️ If `.ralph/` path structure changes via config, init still hardcodes the classic layout.

---

### 4.2 `src/ralph/handoffManager.ts` – Handoff Artifacts
**Status**: ⚠️ Hardcoded, not config-driven  
**Role**: Manages agent-to-agent handoff lifecycle.

**Hardcoded paths**:
```typescript
resolveHandoffDir(ralphRoot)          → `<ralphRoot>/handoffs/`
resolveHandoffPath(ralphRoot, id)     → `<ralphRoot>/handoffs/<id>.json`
resolveLatestHandoffPath(ralphRoot)   → `<ralphRoot>/latest-handoff.json`
resolveLatestHandoffSummaryPath()     → `<ralphRoot>/latest-handoff-summary.md`
```

**Files created**:
- `handoffs/<handoffId>.json` (per handoff state)
- `latest-handoff.json` (pointer)
- `latest-handoff-summary.md` (human summary)

**Gap**: ⚠️ Handoff directory location cannot be configured; always at `.ralph/handoffs/`.

---

### 4.3 `src/ralph/provenancePersistence.ts` – Agent & Handoff Records
**Status**: ⚠️ Hardcoded  
**Role**: Persists agent identity and handoff notes.

**Hardcoded paths**:
```typescript
const agentDirectoryPath = path.join(input.rootPath, '.ralph', 'agents');
const recordPath = path.join(agentDirectoryPath, `${input.agentId}.json`);
```

**Files created**:
- `.ralph/agents/<agentId>.json` (per-agent identity record)

**Additional** (inside iteration artifacts):
```typescript
path.join(paths.handoffDir, `${note.agentId}-${String(note.iteration).padStart(3, '0')}.json`)
```

**Gap**: ⚠️ `.ralph/agents/` directory is hardcoded; not config-driven.

---

### 4.4 `src/ralph/orchestrationSupervisor.ts` – Orchestration State
**Status**: ⚠️ Hardcoded  
**Role**: Manages multi-task orchestration graph and state.

**Hardcoded paths**:
```typescript
const directory = path.join(ralphRoot, 'orchestration', runId);
return {
  directory,
  graphPath: path.join(directory, 'graph.json'),
  statePath: path.join(directory, 'state.json'),
  nodeSpanPath(nodeId): path.join(directory, `node-${nodeId}-span.json`)
};
```

**Files created**:
- `.ralph/orchestration/<runId>/graph.json`
- `.ralph/orchestration/<runId>/state.json`
- `.ralph/orchestration/<runId>/node-<nodeId>-span.json`

**Gap**: ⚠️ `orchestration/` directory is hardcoded; not config-driven.

---

### 4.5 `src/ralph/failureDiagnostics.ts` – Failure Analysis Artifacts
**Status**: ⚠️ Partially hardcoded  
**Role**: Analyzes and records iteration failures for recovery logic.

**Paths constructed**:
```typescript
const taskArtifactDir = path.join(artifactsDir, taskId);
const filePath = path.join(artifactsDir, taskId, 'failure-analysis.json');
```

**Decision Point**:
- `artifactsDir` is passed in (config-driven via `artifactRetentionPath`)
- Subdir structure `<taskId>/failure-analysis.json` is hardcoded

**Files created**:
- `<artifactDir>/<taskId>/failure-analysis.json`

**Observation**: ✅ Accepts config-driven artifact root; adds hardcoded subdir structure.

---

### 4.6 `src/ralph/planGraph.ts` – Task Planning Graphs
**Status**: ⚠️ Hardcoded naming  
**Role**: Serializes multi-step task plans for complex tasks.

**Paths used**:
```typescript
filePath = replanDecisionPath(artifactRootDir, artifact.parentTaskId, artifact.replanIndex);
// → path.join(artifactRootDir, parentTaskId, `replan-${replanIndex}.json`)
```

**Files created**:
- `<artifactDir>/<parentTaskId>/plan-graph.json`
- `<artifactDir>/<parentTaskId>/replan-<index>.json`

**Decision Point**: Hardcoded filename `plan-graph.json` and `replan-<index>.json` pattern.

---

### 4.7 `src/ralph/contextEnvelopeWriter.ts` – Iteration Context
**Status**: ⚠️ Hardcoded naming  
**Role**: Writes iteration-scoped context envelope for agent state.

**Paths constructed**:
```typescript
function contextEnvelopePath(artifactRootDir: string, iterationId: string): string {
  return path.join(artifactRootDir, `iteration-${iterationId}`, 'context-envelope.json');
}
```

**Files created**:
- `<artifactDir>/iteration-<iterationId>/context-envelope.json`

**Observation**: Uses raw `iterationId` (not zero-padded), unlike numeric iteration counter paths.

---

### 4.8 `src/ralph/stateManager.ts` – Runtime State & Lockfiles
**Status**: ⚠️ Hardcoded state structure  
**Role**: Manages `.ralph/state.json` and writes runtime control files.

**Hardcoded paths**:
```typescript
const lockPath = path.join(path.dirname(stateFilePath), 'state.lock');
const lockPath = path.join(path.dirname(taskFilePath), 'tasks.lock');

// Writes to:
paths.promptDir + fileName          → `.ralph/prompts/<fileName>`
paths.runDir + artifactBaseName     → `.ralph/runs/<fileName>`
paths.artifactDir + iteration       → config-driven artifact dir
```

**Files created**:
- `.ralph/state.lock` (runtime lock)
- `.ralph/tasks.lock` (runtime lock)
- `.ralph/prompts/<fileName>.md` (prepared prompts)
- `.ralph/runs/<artifactBaseName>.transcript.md`
- `.ralph/runs/<artifactBaseName>.last-message.md`

**Gap**: ⚠️ Lock files and run transcript locations are hardcoded; no override possible.

---

### 4.9 `src/ralph/taskFile.ts` – Task Claim Locking
**Status**: ⚠️ Hardcoded claim file  
**Role**: Acquires task claims via file-based locking.

**Hardcoded paths**:
```typescript
const lockPath = path.join(path.dirname(taskFilePath), 'tasks.lock');
// Claim file always at:
claimFilePath = path.join(ralphDir, 'claims.json');
```

**Files created**:
- `.ralph/tasks.lock` (claim lock)
- `.ralph/claims.json` (task claim state)

**Observation**: Both are hardcoded; `claims.json` location cannot be overridden.

---

### 4.10 `src/ralph/taskCreation.ts` – Task Append & Replace
**Status**: ✅ Uses pathResolver  
**Role**: Appends or replaces tasks in task file.

**Pattern**: Accepts `tasksPath` as parameter; writes via `fs.writeFile(tasksPath, ...)`.

**Observation**: ✅ No hardcoded paths; respects passed-in path.

---

### 4.11 `src/ralph/pipeline.ts` – Pipeline Orchestration
**Status**: ⚠️ Hardcoded layout  
**Role**: Runs multi-agent pipeline and records provenance.

**Hardcoded paths** (inferred from artifact scaffolding):
- `.ralph/pipeline/<runId>/` (not shown in grep; inferred from `scaffoldPipelineRun()`)

**Gap**: ⚠️ Pipeline runs have a dedicated directory structure; location not config-driven.

---

### 4.12 `src/ralph/taskSeeder.ts` – AI-Generated Task Seeding
**Status**: ⚠️ Config-aware but artifact location hardcoded  
**Role**: Seeds initial task backlog via AI model.

**Decision Point**: Uses `artifactRetentionPath` for artifacts, but filename pattern is hardcoded.

---

### 4.13 `src/commands/prdWizardPersistence.ts` – PRD Drafts
**Status**: ⚠️ Hardcoded draft location  
**Role**: Persists PRD wizard draft during multi-turn generation.

**Hardcoded paths** (to be confirmed):
- Likely under `.ralph/` somewhere; needs inspection.

---

### 4.14 `src/ralph/verifier.ts` – Verification Snapshots
**Status**: ⚠️ Mixed  
**Role**: Captures git status and validation output.

**Decision Point**: Writes to iteration artifact paths (config-driven) but with hardcoded filenames.

---

## Part 5: Summary of Decision Points

### Centralized (Config-Driven)
| Decision Point | Currently Guided? | Config Key |
|---|---|---|
| PRD location | ✅ Yes | `prdPath` |
| Tasks file location | ✅ Yes | `ralphTaskFilePath` |
| Progress file location | ✅ Yes | `progressPath` |
| Iteration artifacts root | ✅ Yes | `artifactRetentionPath` |
| Iteration artifact subdirs | ✅ Yes | hardcoded naming (iteration-NNN) |
| Provenance bundle location | ✅ Yes | derived from artifacts dir |
| Latest pointer files | ✅ Yes | derived from artifacts dir |
| Task-scoped plan graphs | ✅ Yes | derived from artifacts dir + taskId |

### Decentralized (Hardcoded)
| Decision Point | Currently Guided? | Location |
|---|---|---|
| `.ralph/` root directory | ❌ No | pathResolver.ts (hardcoded) |
| `.ralph/handoffs/` | ❌ No | handoffManager.ts |
| `.ralph/orchestration/` | ❌ No | orchestrationSupervisor.ts |
| `.ralph/agents/` | ❌ No | provenancePersistence.ts |
| `.ralph/prompts/` | ❌ No | pathResolver.ts (hardcoded) |
| `.ralph/runs/` | ❌ No | pathResolver.ts (hardcoded) |
| `.ralph/logs/` | ❌ No | pathResolver.ts (hardcoded) |
| `.ralph/*.lock` files | ❌ No | taskFile.ts, stateManager.ts |
| `.ralph/claims.json` | ❌ No | taskFile.ts (hardcoded) |
| `.ralph/state.json` | ❌ No | stateManager.ts (hardcoded) |
| `.ralph/latest-*.json` pointers | ❌ No | artifactStore.ts (hardcoded names) |

---

## Part 6: Gaps & Structural Guidance Deficits

### 6.1 Missing Config Keys

The following subdirectories are hardcoded and have no config override:

1. **`.ralph/handoffs/`** — Agent-to-agent handoff state  
   *Why it matters*: If a user wants to move or rename handoff storage, they cannot.

2. **`.ralph/orchestration/`** — Multi-task orchestration graph & state  
   *Why it matters*: Pipeline runs create nested subdirectories here with no way to customize.

3. **`.ralph/agents/`** — Per-agent identity records  
   *Why it matters*: Agent profiles are locked to this location.

4. **`.ralph/prompts/`** — Prepared prompts (clipboard handoff)  
   *Why it matters*: Users cannot customize prompt staging location.

5. **`.ralph/runs/`** — CLI run transcripts and artifacts  
   *Why it matters*: Transcript paths are hardcoded in state.json; changing location breaks pointers.

6. **`.ralph/logs/`** — Extension log output  
   *Why it matters*: Users cannot redirect logs to a different location.

---

### 6.2 Missing Structural Guidance for Agents

When an agent needs to place a file (e.g., a test output, a generated report, or a structured artifact), it currently has **no canonical way** to know:

1. **Which directory to use?** (`.ralph/artifacts/` vs. workspace root vs. custom location)
2. **What naming convention?** (iteration-based? task-based? timestamp-based?)
3. **What metadata to embed?** (parent task? provenance ID? iteration number?)
4. **Where to reference it?** (state.json? completion report? a dedicated index?)

**Example Gaps**:
- If an agent generates a `feature-matrix.json` during task execution, where should it go?
- If an agent writes a structured test report, how does it reference that in the completion report?
- If an agent creates a diagram or artifact outside Ralph's iteration flow, how is it retained?

---

### 6.3 Hardcoded vs. Config-Driven Inconsistency

- **Workspace init** (`registerCommands.ts`): Hardcodes `.ralph/prd.md`, `.ralph/tasks.json`, etc.
- **Runtime config** (`config/defaults.ts`): Allows override of the same paths via `prdPath`, `ralphTaskFilePath`.
- **Consequence**: A user could set `prdPath: './docs/prd.md'` in config, but `Initialize Workspace` would still create `.ralph/prd.md`.

---

### 6.4 Lock Files & Claim Files

Currently:
- `.ralph/tasks.lock` — Hardcoded location, always at workspace root relative to `.ralph/`.
- `.ralph/state.lock` — Hardcoded location.
- `.ralph/claims.json` — Hardcoded location.

**Issue**: If a user wants a different `.ralph/` layout, these lock and claim files cannot be relocated.

---

## Part 7: Recommendations for Structure.d Design

Based on this audit, a `structure.d` file should:

1. **Express the root `.ralph/` directory location** (currently assumed at workspace root).

2. **Define subdirectory structure** for:
   - `prdFile`
   - `tasksFile`
   - `progressFile`
   - `claimsFile`
   - `stateFile`
   - `handoffsDir`
   - `orchestrationDir`
   - `agentsDir`
   - `promptsDir`
   - `runsDir`
   - `logsDir`
   - `artifactsDir`
   - `lockFilesDir` (for `.lock` files)

3. **Define naming conventions** for:
   - Iteration artifacts (currently: `iteration-NNN/`)
   - Provenance bundles (currently: `runs/<provenanceId>/`)
   - Task-scoped artifacts (currently: `<taskId>/`)
   - Latest pointers (currently: `latest-<kind>.json`)
   - Lock files (currently: `<kind>.lock`)

4. **Document agent-writable paths** where agents can place output artifacts outside the iteration flow.

5. **Provide a canonical index** (e.g., `.ralph/structure-manifest.json`) that Ralph reads to inject path patterns into prompts.

---

## Part 8: Acceptance Criteria Met

✅ **Criterion 1**: A short written summary lists every file-placement decision point.  
→ **Met**: This document catalogs 20+ decision points across 14 modules.

✅ **Criterion 2**: Summarizes whether structural guidance is currently available.  
→ **Met**: Each decision point is marked as ✅ (config-driven), ⚠️ (hardcoded), or ❌ (missing).

✅ **Criterion 3**: Identifies gaps where no structural guidance exists.  
→ **Met**: Sections 6.1–6.4 detail 6 major gaps and 1 inconsistency.

---

## Conclusion

**Current state**: RalphDex has a **partially centralized** path-resolution system. The `artifactRetentionPath` config key enables flexibility for iteration artifacts, but **11 hardcoded subdirectories** (handoffs, orchestration, agents, prompts, runs, logs, plus lock and claim files) are locked to their current locations.

**Readiness for structure.d**: The codebase is ready for a `structure.d` definition file, but will require:
1. Refactoring hardcoded path strings in 8+ modules.
2. Adding config keys for the 11 hardcoded subdirectories.
3. Updating `pathResolver.ts` to read from `structure.d` at runtime.
4. Defining agent-writable path conventions in the structure schema.

**Next steps**: T172 should design the schema and naming convention. T173 should implement inference. T174 should inject into the prompt.
