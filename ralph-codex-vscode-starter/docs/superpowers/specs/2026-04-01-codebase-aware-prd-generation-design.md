# Codebase-Aware PRD and Task Generation

**Date:** 2026-04-01  
**Status:** Approved

## Problem

`generateProjectDraft()` receives only the user's objective string — no information about what already exists in the repository. The AI must guess the current state of the codebase. This produces wrong PRDs: a user who asks "refactor into a function app" when no function app exists gets a PRD scoped to refactoring an existing function app, rather than introducing one.

## Goal

Before generating the PRD and tasks, assemble a lightweight snapshot of the existing codebase (WorkspaceScan metadata + shallow file tree) and inject it into the generation prompt. The AI can then distinguish between "this thing exists and needs changing" and "this thing doesn't exist yet."

## Architecture

### Changes to `src/ralph/projectGenerator.ts`

Add an optional parameter to `generateProjectDraft()`:

```ts
export async function generateProjectDraft(
  objective: string,
  config: RalphCodexConfig,
  cwd: string,
  codebaseContext?: string   // ← new, optional
): Promise<{ prdText: string; tasks: Pick<RalphTask, 'id' | 'title' | 'status'>[] }>
```

Update `GENERATION_PROMPT_TEMPLATE` to include an optional codebase block. When `codebaseContext` is a non-empty string, the prompt is prefixed with:

```
<codebase>
{CODEBASE_CONTEXT}
</codebase>

```

Followed by explicit framing:

```
Use the codebase context above to understand what already exists before
interpreting the objective. If the objective mentions a technology or
structure that does not appear in the file tree, treat this as introducing
it from scratch rather than modifying existing code.
```

When `codebaseContext` is absent or empty, the `<codebase>` block and framing sentence are omitted entirely — no empty tags in the prompt.

### New helper in `src/commands/registerCommands.ts`

Private async function:

```ts
async function buildCodebaseSnapshot(cwd: string): Promise<string>
```

**Steps:**

1. Call `scanWorkspaceCached(cwd)` to get a `WorkspaceScan`.
2. Format the scan metadata into readable lines:
   - Package manager(s)
   - Source roots
   - Manifests (file names only, not full paths)
   - Validation command(s)
3. Generate a file tree by walking `cwd` recursively to depth 2, ignoring:
   `node_modules`, `.git`, `dist`, `out`, `coverage`, `.ralph`, `.vscode`, `*.vsix`
4. Return the combined string.

**Error handling:** If `scanWorkspaceCached()` throws for any reason (empty directory, permissions, etc.), catch and return `""`. Generation then proceeds without codebase context rather than blocking workspace init.

**Empty directory:** If the workspace has no files beyond the ignore list, the snapshot string will be short (or empty). This is fine — omitting the `<codebase>` block for an empty dir is correct behaviour.

### Changes to `src/commands/registerCommands.ts`

Both the `initializeWorkspace` and `newProject` handlers get the same update in the `generateProjectDraft` call site:

```ts
// Before calling generateProjectDraft:
const codebaseContext = await buildCodebaseSnapshot(workspaceFolder.uri.fsPath);

// Existing call updated:
const generated = await generateProjectDraft(
  objective.trim(),
  config,
  workspaceFolder.uri.fsPath,
  codebaseContext   // ← passed through
);
```

No other changes to either handler.

## Snapshot format (example)

```
Package manager: npm
Source roots: src/
Manifests: package.json
Validation: npm run validate

File tree:
src/
  index.ts
  handlers/
  utils/
package.json
tsconfig.json
```

Without `host.json` or a `functions/` directory in the tree, the AI correctly infers that no Azure Function App structure exists yet.

## What is not changing

- `parseGenerationResponse()` — no change
- The fallback path in both handlers — no change
- `draftTasksFromPrd()` — no change
- User-facing input prompts — no change
- File locking, provenance, artifact retention — not involved
- `WorkspaceScan` interface — no change

## Testing

- **`generateProjectDraft` unit tests:** Add two cases — (a) `codebaseContext` provided: assert the prompt sent to the CLI contains the `<codebase>` block; (b) `codebaseContext` omitted: assert no `<codebase>` tag in the prompt.
- **`buildCodebaseSnapshot` unit test:** Mock `scanWorkspaceCached` return value; assert the returned string contains expected metadata lines and a file tree section.
- **Error path test:** Mock `scanWorkspaceCached` to throw; assert `buildCodebaseSnapshot` returns `""` without rethrowing.
- Existing response-parser and command tests require no changes.
